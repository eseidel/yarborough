/**
 * Per-route SEO metadata.
 *
 * The app is a client-rendered SPA, so everything a crawler sees beyond
 * index.html is set here after render.
 *
 * Board permalinks canonicalize to themselves, not to /. The instinct is to
 * fold them into the homepage, since every /bid/<board> renders the same page
 * with different cards. Sixteen months of Search Console data says otherwise:
 * eleven of them are indexed, they earn 4.4% of the site's clicks, and they
 * average a better position than the homepage does. The old site served
 * byte-identical HTML at / and at every /bid/ URL, with no canonical at all,
 * and Google both settled on eleven of them and ranked them. Discarding pages
 * that work, to prevent a duplicate-content problem that fifteen years did
 * not produce, would be a regression we chose.
 *
 * Explorer states are different: /explore has never been indexed at all (the
 * old robots.txt disallowed it), so there is nothing to protect, and
 * /explore/<board> collapses to /explore.
 */

/** The one hostname the site should ever be indexed under. */
export const CANONICAL_ORIGIN = "https://saycbridge.com";

/**
 * Point <link rel="canonical"> and og:url at `path`, an absolute path on this
 * site such as "/", "/explore", or "/bid/13-8415fab0e7".
 *
 * index.html deliberately ships no canonical tag. One file is served for every
 * route, so any static value would be wrong for all but one of them — and
 * wrong in the served HTML, where a crawler sees it whether or not it ever
 * renders the app. Absent means self-canonical, which is the right answer for
 * every route here.
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

  let og = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  if (!og) {
    og = document.createElement("meta");
    og.setAttribute("property", "og:url");
    document.head.appendChild(og);
  }
  og.content = href;
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
