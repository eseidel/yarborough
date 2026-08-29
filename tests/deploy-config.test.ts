import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs with the repository root as its working directory.
function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

/** Walks `source`, invoking `visit` for characters outside of string literals. */
function outsideStrings(
  source: string,
  visit: (character: string, index: number) => void,
): void {
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    visit(character, index);
  }
}

/**
 * Parses JSONC. Prettier formats `wrangler.jsonc` with `//` comments and
 * trailing commas, neither of which `JSON.parse` accepts, and both of which
 * must be ignored outside of string literals.
 */
function parseJsonc(source: string): unknown {
  const dropped = new Set<number>();
  let commentUntil = -1;
  outsideStrings(source, (character, index) => {
    if (index < commentUntil) {
      return;
    }
    if (character === "/" && source[index + 1] === "/") {
      let end = index;
      while (end < source.length && source[end] !== "\n") {
        dropped.add(end);
        end += 1;
      }
      commentUntil = end;
    }
  });

  const withoutComments = [...source]
    .filter((_, index) => !dropped.has(index))
    .join("");

  const characters = [...withoutComments];
  const structural: number[] = [];
  outsideStrings(withoutComments, (character, index) => {
    if (!/\s/.test(character)) {
      structural.push(index);
    }
  });
  const removals = new Set<number>();
  for (let position = 1; position < structural.length; position += 1) {
    const current = characters[structural[position]];
    const previous = structural[position - 1];
    if ((current === "}" || current === "]") && characters[previous] === ",") {
      removals.add(previous);
    }
  }

  return JSON.parse(
    characters.filter((_, index) => !removals.has(index)).join(""),
  );
}

interface Route {
  pattern: string;
  custom_domain?: boolean;
}

interface Environment {
  name?: string;
  assets?: { directory?: string; not_found_handling?: string };
  routes?: Route[];
  workers_dev?: boolean;
}

interface WranglerConfig extends Environment {
  env?: Record<string, Environment>;
}

const wrangler = parseJsonc(read("wrangler.jsonc")) as WranglerConfig;
const environments: [string, Environment | undefined][] = [
  ["production", wrangler],
  ["preview", wrangler.env?.preview],
];

describe("wrangler configuration", () => {
  it("serves the directory that vite builds into", () => {
    for (const [label, environment] of environments) {
      expect(environment?.assets?.directory, label).toBe("./dist");
    }
  });

  // Without this, deep links such as /bid/<board> would 404 on a cold load
  // rather than being handed to React Router.
  it("serves index.html for unmatched client-routed paths", () => {
    for (const [label, environment] of environments) {
      expect(environment?.assets?.not_found_handling, label).toBe(
        "single-page-application",
      );
    }
  });

  // Holds before and after the saycbridge.com cutover: an environment that
  // has neither a workers.dev hostname nor a route would deploy to nowhere.
  it("keeps every environment reachable", () => {
    for (const [label, environment] of environments) {
      const reachable =
        environment?.workers_dev === true ||
        (environment?.routes?.length ?? 0) > 0;
      expect(reachable, label).toBe(true);
    }
  });

  it("serves production from the apex and www", () => {
    expect((wrangler.routes ?? []).map((route) => route.pattern)).toEqual([
      "saycbridge.com",
      "www.saycbridge.com",
    ]);
    // The apex is canonical, so production has no *.workers.dev twin.
    expect(wrangler.workers_dev).toBe(false);
  });

  it("serves preview from dev.saycbridge.com", () => {
    expect(
      (wrangler.env?.preview?.routes ?? []).map((route) => route.pattern),
    ).toEqual(["dev.saycbridge.com"]);
  });

  it("attaches any configured hostnames as Cloudflare custom domains", () => {
    for (const [label, environment] of environments) {
      for (const route of environment?.routes ?? []) {
        expect(route.custom_domain, `${label}: ${route.pattern}`).toBe(true);
      }
    }
  });

  // Preview must never publish over production, in either stage.
  it("never shares a hostname between preview and production", () => {
    const productionPatterns = new Set(
      (wrangler.routes ?? []).map((route) => route.pattern),
    );
    for (const route of wrangler.env?.preview?.routes ?? []) {
      expect(productionPatterns.has(route.pattern), route.pattern).toBe(false);
    }
  });

  it("deploys preview as a separate worker", () => {
    expect(wrangler.name).toBe("saycbridge");
    // Wrangler derives "saycbridge-preview" from the environment key, so the
    // preview environment must not override the name back to production's.
    expect(wrangler.env?.preview?.name).toBeUndefined();
  });
});

describe("deployment workflows", () => {
  const preview = read(".github/workflows/deploy.yml");
  const promote = read(".github/workflows/promote.yml");

  // Swapping these flags would publish preview builds to saycbridge.com.
  it("targets the preview environment from the preview workflow", () => {
    expect(preview).toContain("wrangler deploy --env preview");
    expect(preview).not.toContain('wrangler deploy --env=""');
  });

  it("targets the top-level environment from the promote workflow", () => {
    expect(promote).toContain('wrangler deploy --env=""');
    expect(promote).not.toContain("wrangler deploy --env preview");
  });

  // A rebuild here would defeat the point: production must ship the artifact
  // that was verified on the preview hostname.
  it("promotes a prebuilt artifact instead of rebuilding", () => {
    expect(promote).toContain("actions/download-artifact");
    expect(promote).not.toContain("pnpm build");
    expect(preview).toContain("actions/upload-artifact");
  });

  // Fork pull requests on this public repository cannot read secrets.
  it("never deploys from pull requests", () => {
    const withoutComments = (yaml: string) => yaml.replace(/^\s*#.*$/gm, "");
    for (const workflow of [preview, promote]) {
      expect(withoutComments(workflow)).not.toContain("pull_request");
    }
  });
});

describe("vite configuration", () => {
  // Cloudflare serves the app from the domain root, so no base override
  // should reintroduce the old GitHub Pages subpath.
  it("builds for the domain root", () => {
    expect(read("vite.config.ts")).not.toMatch(/^\s*base:/m);
    expect(read("vitest.browser.config.ts")).not.toMatch(/^\s*base:/m);
  });
});
