/**
 * The crawler-facing files are hand-written and easy to break silently, so
 * they are asserted here. Everything checked is something saycbridge.com does
 * today and the replacement must keep doing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Vitest runs with the repository root as its working directory.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("index.html", () => {
  const html = read("index.html");

  it("lets crawlers follow links", () => {
    expect(html).toContain('name="robots" content="index, follow"');
    expect(html).not.toMatch(/name="robots"[^>]*nofollow/);
  });

  it("ships no static canonical, which would be wrong for every route but one", () => {
    // One file is served for /, /explore and every /bid/<board>. src/seo.ts
    // sets a self-referential canonical per route instead.
    expect(html).not.toContain('rel="canonical"');
  });

  it("references the favicon the old site served", () => {
    expect(html).toContain('rel="icon" href="/favicon.ico"');
    expect(existsSync(join(process.cwd(), "public/favicon.ico"))).toBe(true);
  });

  it("keeps the title and description of the page it replaces", () => {
    expect(html).toContain("<title>Bidding Practice - SAYC Bridge</title>");
    expect(html).toContain(
      "Practice bridge bidding using the Standard American Yellow Card (SAYC) convention system.",
    );
  });

  it("ships crawlable copy in the shell, not an empty root div", () => {
    const root_div = html.slice(html.indexOf('<div id="root">'));
    expect(root_div).toContain("<h1>");
    // "bridge bidding practice" and "sayc bridge" are the two query families
    // that earn the site's traffic; the heading should contain both.
    expect(root_div).toMatch(/<h1>[^<]*Bridge Bidding[^<]*<\/h1>/i);
    expect(root_div).toMatch(/<h1>[^<]*SAYC[^<]*<\/h1>/i);
    expect(root_div).toContain("Standard American Yellow Card");
    expect(root_div).toContain('href="/explore"');
  });

  it("declares Open Graph tags, except the per-route og:url", () => {
    for (const tag of ["og:type", "og:title", "og:description"]) {
      expect(html).toContain(`property="${tag}"`);
    }
    expect(html).not.toContain('property="og:url"');
  });
});

describe("robots.txt", () => {
  const robots = read("public/robots.txt");

  it("allows the whole site", () => {
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
  });

  it("no longer disallows /explore, which is now computed in the browser", () => {
    expect(robots).not.toContain("Disallow: /explore");
  });

  it("points at the sitemap by absolute URL", () => {
    expect(robots).toContain("Sitemap: https://saycbridge.com/sitemap.xml");
  });
});

describe("sitemap.xml", () => {
  const sitemap = read("public/sitemap.xml");

  it("lists the two canonical URLs and no board permalinks", () => {
    expect(sitemap).toContain("<loc>https://saycbridge.com/</loc>");
    expect(sitemap).toContain("<loc>https://saycbridge.com/explore</loc>");
    expect(sitemap).not.toContain("/bid/");
  });
});

describe("_redirects", () => {
  const redirects = read("public/_redirects");

  it("redirects the old modes instead of soft-404ing them", () => {
    // SPA not_found_handling answers 200 for unmatched paths, so without
    // these /scoring and /play would return the app shell to a crawler.
    expect(redirects).toMatch(/^\/scoring\s+\/\s+301$/m);
    expect(redirects).toMatch(/^\/play\s+\/\s+302$/m);
    expect(redirects).toMatch(/^\/play\/\*\s+\/\s+302$/m);
  });

  it("keeps /scoring permanent and /play temporary", () => {
    // The distinction is the decision: the flashcards are retired, card play
    // has not been ruled on.
    expect(redirects).not.toMatch(/^\/scoring\s+\/\s+302$/m);
  });
});

describe("_headers", () => {
  const headers = read("public/_headers");

  it("caches hashed assets immutably and revalidates the shell", () => {
    expect(headers).toContain("/assets/*");
    expect(headers).toContain("max-age=31536000, immutable");
    expect(headers).toContain("/index.html");
    expect(headers).toContain("max-age=0, must-revalidate");
  });
});
