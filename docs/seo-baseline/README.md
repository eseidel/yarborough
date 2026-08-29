# Search baseline, pre-cutover

Exported 29 August 2026 from the `http://www.saycbridge.com` Search Console
property, covering the preceding 16 months — the maximum Search Console
retains. **This is the only copy.** The window is rolling, so those months
have since begun ageing out of Google's own records; they cannot be exported
again.

The CSVs are verbatim from the export. This file is what they mean.

## The shape of the traffic

|                         | Clicks        | Impressions |
| ----------------------- | ------------- | ----------- |
| All pages               | 5,779         | 74,677      |
| `/`                     | 5,508 (95.3%) | 66,094      |
| `/bid/<board>`, 11 URLs | 256 (4.4%)    | 7,597       |
| `/scoring`              | 15 (0.3%)     | 979         |
| `/play`                 | 0             | 0           |

Desktop 2,932 clicks · mobile 2,403 · tablet 409. Mobile ranks better than
desktop (average position 6.69 against 10.19) and is 42% of clicks.

## What it settled

**The homepage is the site.** 95% of clicks land on `/`. This is why `/` no
longer redirects to `/bid/<board>`: the redirect was pointed at essentially
all of the site's search traffic, and its target was a different URL on every
crawl.

**Board permalinks are worth keeping.** Eleven are indexed and they average a
better position than the homepage. They canonicalize to themselves rather than
to `/`, which reverses the first draft of this work — see the comment in
`src/seo.ts`. Worth knowing that the old site served _byte-identical_ HTML at
`/` and at every `/bid/` URL, with no canonical tag at all, and Google settled
on eleven of them anyway. The duplicate-content problem the canonical was
meant to prevent did not occur in fifteen years.

**`/scoring` is already gone.** 15 clicks in 16 months at average position 26
— page three. It is a 301 in `public/_redirects`, and porting the flashcards
was not worth it.

**`/play` has never had search traffic at all.** It does not appear in the
export. Its 302 is a courtesy to bookmarks, nothing more.

## The queries to protect

The top ten queries are 85% of clicks. Two families:

- _bridge bidding practice_ — 751 clicks at position 2.4, plus "practice
  bridge bidding", "bidding practice bridge", "practice bridge bidding online
  free" and a long tail of variants.
- _sayc_ — "sayc bidding practice" (435, position 1), "sayc bridge" (372),
  "sayc bridge bidding practice" (308, position 1).

Both families run through the page title, the meta description, and the `<h1>`
in `index.html`. Changing any of those three is changing what the site ranks
for, so change them deliberately.

One gap, visible but not acted on: bare "sayc" draws 14,934 impressions and
only 186 clicks at position 7.8, and "sayc bidding system" and "sayc bridge
bidding system" look like people wanting to _read about_ the system rather
than practice it. The old site never had a page for that, and neither does
this one.

## What to compare against, after the cutover

The old property is scoped to `http://www.saycbridge.com` and stops recording
the moment traffic moves to `https://saycbridge.com`. That is expected and is
not a traffic loss. The `saycbridge.com` Domain property spans both and is
where the after-picture lives.

Watch, in order: total clicks against the 5,779 above; `/`'s share; whether
the eleven board permalinks stay indexed; and whether the two query families
hold their positions. Mobile is the one to watch hardest — 42% of clicks, the
better-ranking half of the audience, and the half that pays for the 12 MB
WebAssembly download on a cold load.
