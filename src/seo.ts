/**
 * Per-route SEO metadata.
 *
 * The app is a client-rendered SPA, so everything a crawler sees beyond
 * index.html is set here after render. The canonical URL matters most: every
 * board permalink (/bid/<board>) and every explorer state (/explore/<board>)
 * is a distinct URL rendering the same page, and saycbridge.com has fifteen
 * years of inbound links pointing at them. Canonicalizing the whole /bid/
 * space back to / consolidates that rather than splitting it across an
 * unbounded set of near-duplicate URLs.
 */

/** The one hostname the site should ever be indexed under. */
export const CANONICAL_ORIGIN = "https://saycbridge.com";

/**
 * Point <link rel="canonical"> at `path`, which must be a canonical path
 * (no board id, no query), e.g. "/" or "/explore".
 */
export function setCanonical(path: string): void {
  if (typeof document === "undefined") return;
  const href = `${CANONICAL_ORIGIN}${path}`;
  let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;

  const og = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  if (og) og.content = href;
}

/** Set the document title and the og:title that mirrors it. */
export function setTitle(title: string): void {
  if (typeof document === "undefined") return;
  document.title = title;
  const og = document.querySelector<HTMLMetaElement>(
    'meta[property="og:title"]',
  );
  if (og) og.content = title;
}
