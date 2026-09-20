import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs with the repository root as its working directory.
function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

/** The commands of the first fenced `bash` block in a Markdown file. */
function fencedCommands(markdown: string): string[] {
  const block = /```bash\n([\s\S]*?)```/.exec(markdown);
  expect(block, "a fenced bash block").not.toBeNull();
  return block![1].split("\n").filter((line) => line.trim() !== "");
}

/** The commands of a shell script: its lines, without `#!`, `set` or blanks. */
function scriptCommands(shell: string): string[] {
  return shell
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line !== "" &&
        !line.startsWith("#") &&
        !line.startsWith("set ") &&
        line !== "set -euo pipefail",
    );
}

describe("the documented checks", () => {
  const presubmit = scriptCommands(read("scripts/presubmit.sh"));

  // Three places used to list the checks and all three had drifted apart.
  // The script is the one that runs, so it is the one the prose must match.
  it("are the commands scripts/presubmit.sh runs, in AGENTS.md", () => {
    expect(fencedCommands(read("AGENTS.md"))).toEqual(presubmit);
  });

  it("are the commands scripts/presubmit.sh runs, in the README", () => {
    const testing = read("README.md").slice(
      read("README.md").indexOf("## Testing"),
    );
    expect(fencedCommands(testing)).toEqual(presubmit);
  });

  it("are every check, and each is a script package.json defines", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    for (const command of presubmit) {
      if (command.startsWith("npx ")) continue;
      expect(command).toMatch(/^pnpm /);
      expect(Object.keys(pkg.scripts)).toContain(command.slice("pnpm ".length));
    }
    expect(presubmit).toContain("pnpm baseline:check");
    expect(presubmit).toContain("pnpm test:browser");
    expect(presubmit).toContain("pnpm test:production");
  });
});

describe("CLAUDE.md", () => {
  // One file, two names: the instructions must never be able to disagree.
  it("is a symlink to AGENTS.md", () => {
    const path = join(process.cwd(), "CLAUDE.md");
    expect(lstatSync(path).isSymbolicLink()).toBe(true);
    expect(readlinkSync(path)).toBe("AGENTS.md");
  });
});

describe("the retired Python engine", () => {
  // The port deleted python/ (docs/typescript-engine-notes.md, phase 9). The
  // provenance comments in src/engine/ that name the Python original are kept
  // on purpose; a path that claims python/ still exists in the tree is not.
  const documents = [
    "README.md",
    "AGENTS.md",
    "docs/progress-plan.md",
    "docs/practice-ux.md",
    "docs/deployment.md",
    "docs/bidding_card.md",
  ];

  it.each(documents)("is not cited as a live path by %s", (document) => {
    expect(read(document)).not.toMatch(/python\//);
  });
});
