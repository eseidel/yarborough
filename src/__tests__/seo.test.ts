import { describe, it, expect, beforeEach } from "vitest";
import { setCanonical, setTitle, CANONICAL_ORIGIN } from "../seo";

function canonicalHref(): string | undefined {
  return document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
}

describe("seo", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.title = "";
  });

  it("creates a canonical link when index.html has none", () => {
    setCanonical("/explore");
    expect(canonicalHref()).toBe(`${CANONICAL_ORIGIN}/explore`);
  });

  it("reuses the existing canonical link rather than adding a second", () => {
    document.head.innerHTML =
      '<link rel="canonical" href="https://saycbridge.com/">';
    setCanonical("/explore");
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(canonicalHref()).toBe(`${CANONICAL_ORIGIN}/explore`);
  });

  it("canonicalizes to the apex, never to the deploy host", () => {
    setCanonical("/");
    expect(canonicalHref()).toBe("https://saycbridge.com/");
  });

  it("keeps og:url in step with the canonical URL", () => {
    document.head.innerHTML =
      '<meta property="og:url" content="https://saycbridge.com/">';
    setCanonical("/explore");
    expect(
      document.querySelector<HTMLMetaElement>('meta[property="og:url"]')
        ?.content,
    ).toBe(`${CANONICAL_ORIGIN}/explore`);
  });

  it("sets the document title and mirrors it into og:title", () => {
    document.head.innerHTML = '<meta property="og:title" content="old">';
    setTitle("Bid Explorer - SAYC Bridge");
    expect(document.title).toBe("Bid Explorer - SAYC Bridge");
    expect(
      document.querySelector<HTMLMetaElement>('meta[property="og:title"]')
        ?.content,
    ).toBe("Bid Explorer - SAYC Bridge");
  });

  it("sets the title even when og:title is absent", () => {
    setTitle("Bidding Practice - SAYC Bridge");
    expect(document.title).toBe("Bidding Practice - SAYC Bridge");
  });
});
