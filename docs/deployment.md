# Deployment

saycbridge.com is a static site served from Cloudflare Workers static assets.
There is no server-side component: the bidding engine runs in the browser via
Pyodide and Z3.

| Environment | Worker               | Trigger                          |
| ----------- | -------------------- | -------------------------------- |
| Preview     | `saycbridge-preview` | Every push to `main`, automatic  |
| Production  | `saycbridge`         | "Promote to production", by hand |

This is rolling out in two stages. **Stage 1** (this change) deploys both
environments to their `workers.dev` hostnames, which need no DNS, so the whole
pipeline can be verified before saycbridge.com is touched. **Stage 2** moves
the domain to Cloudflare and attaches it.

## How a change reaches production

1. Merge to `main`. **Deploy preview** builds the site, uploads `dist` as a
   workflow artifact, and deploys it to the preview Worker.
2. Check the preview URL.
3. Actions tab → **Promote to production** → **Run workflow**. Leave the input
   blank to promote the most recent successful `main` build, or paste a run ID
   to promote — or roll back to — an older one.

Promotion never rebuilds. It downloads the artifact from the preview run and
deploys those exact files, so production ships the bytes that were verified on
preview. It also checks out the promoted commit, so the Wrangler config and the
assets always come from the same revision.

Any collaborator with write access can promote: triggering a workflow is a
write-level permission, so there is no separate approver list to maintain.

### Rolling back

Promote an older run ID. Cloudflare also retains prior versions, so
`wrangler rollback --env=""` works as an emergency path.

## Stage 1 setup

Needed before the first deploy can succeed.

### Create the API token

Cloudflare dashboard → My Profile → API Tokens → Create Token, from the **Edit
Cloudflare Workers** template. For stage 1 it needs only:

- Account → Workers Scripts → Edit

Stage 2 adds two zone-scoped permissions, below.

### Add the repository secrets

Settings → Secrets and variables → Actions:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID` (Cloudflare dashboard sidebar, or `wrangler whoami`)

Both workflows read these. They are repository-level rather than
environment-scoped so either workflow can use them.

Once these exist, push to `main` and the preview deploy publishes to
`saycbridge-preview.<subdomain>.workers.dev`. Promote once to bring up
`saycbridge.<subdomain>.workers.dev`. Verify both — especially a deep link such
as `/bid/<board>`, which exercises SPA routing, and the bidding engine itself,
which pulls ~22 MB of Pyodide and Z3 assets.

## Stage 2: cutting saycbridge.com over

Only start this once stage 1 is verified.

### 1. Move the zone to Cloudflare

saycbridge.com is currently on GoDaddy nameservers
(`ns35`/`ns36.domaincontrol.com`), with the apex at `192.241.239.197` and `www`
at `ghs.google.com`. Workers Custom Domains require the zone to be active on
Cloudflare nameservers.

1. Add saycbridge.com as a zone in the Cloudflare dashboard.
2. Let Cloudflare import the existing DNS records, then confirm what you still
   need came across — MX and any mail-related TXT records especially.
3. Update the nameservers at GoDaddy to the pair Cloudflare assigns.
4. Wait for the zone to show as active.

The imported records keep the old site serving throughout, so this step alone
changes nothing a visitor sees.

### 2. Widen the API token

Add to the existing token, both scoped to saycbridge.com:

- Zone → Workers Routes → Edit
- Zone → DNS → Edit (so Wrangler can create the records itself)

### 3. Attach the domains

In `wrangler.jsonc`, add to the top-level (production) config:

```jsonc
"routes": [
  { "pattern": "saycbridge.com", "custom_domain": true },
  { "pattern": "www.saycbridge.com", "custom_domain": true }
],
```

and to `env.preview`:

```jsonc
"routes": [{ "pattern": "dev.saycbridge.com", "custom_domain": true }],
```

Set the production `workers_dev` to `false` so the apex is the only canonical
origin. Delete the imported apex and `www` records first, or the deploy will
conflict with them. Cloudflare then creates the records and certificates.

Merge, let preview deploy, then promote. Keep the old host running until
production is confirmed on Cloudflare.

## Deploying by hand

Requires `wrangler login`, or the same two environment variables.

```bash
pnpm deploy:preview   # build and publish to the preview Worker
pnpm deploy           # build and publish to production
```

Because this repository defines multiple Wrangler environments, production must
be named explicitly as `--env=""`. A bare `wrangler deploy` is ambiguous and
warns.

## Search

saycbridge.com has been indexed since 2011 and every inbound link points at
`http://www.saycbridge.com/...`. The cutover changes both the scheme and the
canonical hostname, which is a site move as far as a search engine is
concerned. These steps are what keep it from reading as a new site.

### Before the cutover

Verify `saycbridge.com` in Google Search Console (DNS TXT is easiest once the
zone is on Cloudflare) and add both the `http://www.saycbridge.com` and
`https://saycbridge.com` properties. Search Console history starts at
verification, not retroactively, so doing this while the old site is still
serving is the only way to have a before-and-after to compare. There is no
other baseline: the old analytics is `ga.js`, which Google shut off in 2023.

### At the cutover

1. **Always Use HTTPS** on (SSL/TLS → Edge Certificates). Every existing link
   is `http://`, and this is what turns them into a 301 to `https://`.
2. **A Redirect Rule for `www`**, 301, preserving path and query:
   - When: `http.host eq "www.saycbridge.com"`
   - Then: dynamic redirect to
     `concat("https://saycbridge.com", http.request.uri.path)`, preserve query
     string, status 301.

   Both hostnames answering with the same content would split the link equity
   between them, and the canonical tag that would otherwise settle it is set by
   the app after render rather than in the served HTML.

3. Keep the `www` custom domain route in `wrangler.jsonc` regardless — the
   Redirect Rule needs a proxied record on the hostname to run at all.

### After the cutover

Submit `https://saycbridge.com/sitemap.xml` in Search Console, then watch the
Coverage report for `/bid/` URLs. They are canonicalized to `/`, so they should
report as "Alternate page with proper canonical tag" rather than as duplicates.
Cloudflare Web Analytics (free, cookieless, and the zone is already there) is
worth turning on at the same time; `src/analytics.ts` still calls the dead
`ga.js` and reports nothing.

### What the app already does

- `public/robots.txt` allows everything and points at the sitemap. The old
  site's `Disallow: /explore` is deliberately gone: it existed to keep crawlers
  off a JSON endpoint per candidate bid, and the explorer is computed in the
  browser now.
- `public/_redirects` 302s `/scoring` and `/play` to `/`. Without it,
  `not_found_handling: "single-page-application"` answers 200 with the app
  shell, which is a soft 404 on two URLs that are live and indexed today. They
  are 302 rather than 301 because neither mode has been ported yet.
- `index.html` ships the site description inside `#root`, which React replaces
  on boot. A crawler that does not execute 12 MB of WebAssembly still gets the
  page's copy.
- `/` renders a board rather than redirecting to `/bid/<board>`, and every
  board permalink carries `<link rel="canonical">` back to `/`.

## Notes

- `not_found_handling: "single-page-application"` is what makes deep links work
  on a cold load. It replaces the `404.html` copy the old GitHub Pages workflow
  needed.
- `www.saycbridge.com` must keep resolving — fifteen years of inbound links
  point at it — but it must not _serve_ the site. See "Search" below.
- Cloudflare's static asset limits are 25 MiB per file and 20,000 files. The
  current build is ~22 MB across 14 files, the largest being `pyodide.asm.wasm`
  at ~9 MB.
