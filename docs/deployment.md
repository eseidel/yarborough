# Deployment

saycbridge.com is a static site served from Cloudflare Workers static assets.
There is no server-side component: the bidding engine runs in the browser via
Pyodide and Z3.

| Environment | Hostname             | Worker               | Trigger                          |
| ----------- | -------------------- | -------------------- | -------------------------------- |
| Preview     | `dev.saycbridge.com` | `saycbridge-preview` | Every push to `main`, automatic  |
| Production  | `saycbridge.com`     | `saycbridge`         | "Promote to production", by hand |

`www.saycbridge.com` 301s to the apex, and plain HTTP 301s to HTTPS, so
`https://saycbridge.com/...` is the single canonical address.

## How a change reaches production

1. Merge to `main`. **Deploy preview** builds the site, uploads `dist` as a
   workflow artifact, and deploys it to dev.saycbridge.com.
2. Check dev.saycbridge.com.
3. Actions tab → **Promote to production** → **Run workflow**. Leave the input
   blank to promote the most recent successful `main` build, or paste a run ID
   to promote — or roll back to — an older one.

From the command line, step 3 is `gh workflow run promote.yml --ref main`.

Promotion never rebuilds. It downloads the artifact from the preview run and
deploys those exact files, so production ships the bytes that were verified on
preview. It also checks out the promoted commit, so the Wrangler config and the
assets always come from the same revision.

Any collaborator with write access can promote: triggering a workflow is a
write-level permission, so there is no separate approver list to maintain.

### Rolling back

Promote an older run ID. Cloudflare also retains prior versions, so
`wrangler rollback --env=""` works as an emergency path.

### Deploying by hand

Requires `wrangler login`, or `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` in the environment.

```bash
pnpm deploy:preview   # build and publish to dev.saycbridge.com
pnpm deploy           # build and publish to saycbridge.com
```

Because this repository defines multiple Wrangler environments, production must
be named explicitly as `--env=""`. A bare `wrangler deploy` is ambiguous and
warns.

## Configuration

Everything below already exists. It is recorded so it can be understood,
audited, or rebuilt — not as steps to follow.

### Cloudflare

The zone and both Workers live in a personal Cloudflare account kept
single-purpose. Custom Domains cannot cross accounts, so the zone has to stay
wherever the Workers are.

Two zone settings do work that is not in this repository:

- **Always Use HTTPS** (SSL/TLS → Edge Certificates) turns the fifteen years of
  `http://` inbound links into 301s.
- **A Redirect Rule** sends `https://www.*` to `https://${1}`, 301, preserving
  the query string. Host-level redirects cannot live in `public/_redirects`,
  which is path-only, and doing it in Worker code would mean running the Worker
  on every asset request rather than serving assets directly.

The Redirect Rule's editor warns that `www` may not be proxied. It is: the
`www` Custom Domain is inherently proxied, it just is not the conventional
orange-clouded record the check looks for. Adding a DNS record for `www` would
collide with the Custom Domain and break it.

### Credentials

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are repository secrets, so
either workflow can read them. The token is scoped to:

- Account → Workers Scripts → Edit
- Zone → Workers Routes → Edit, on saycbridge.com

Deliberately **not** Zone → DNS → Edit. Custom Domains are attached
server-side: Cloudflare creates the DNS record and issues the certificate
itself, so the client never writes DNS. Cloudflare's own generated Workers
Builds CI token grants Workers Routes but not DNS for the same reason.

This matters because the token lives in a public repository's secrets and the
zone carries the domain's MX records. Scoped this way, the worst a leaked token
can do is redeploy the site; with DNS edit it could rewrite MX and intercept
mail. If a deploy ever fails on the custom domain step for permissions, add DNS
edit then — not in advance.

## DNS

Cloudflare is authoritative. The apex, `www`, and `dev` are Custom Domain
records that Wrangler manages; do not create records for them by hand.

The rest of the zone is mail and verification:

| Record                  | Purpose                                         |
| ----------------------- | ----------------------------------------------- |
| `MX` ×7                 | Google Workspace                                |
| `google._domainkey` TXT | DKIM                                            |
| Apex TXT                | `google-site-verification=…` for Search Console |

**Mail does not currently reach anyone.** The MX records point at a Google
Workspace whose sole super admin account is locked out by an enforced 2-Step
Verification policy, with no second admin and no backup codes. Google accepts
the mail and delivers it normally, so senders get no bounce and believe they
have reached us. Cloudflare Email Routing, with a catch-all forwarding to an
address that is actually read, is the intended fix; recovering the Workspace is
a separate errand for the archive.

There is no SPF and no DMARC record. Worth adding whenever mail is sorted out.

## Search

The site has been indexed since 2011 and its inbound links point at
`http://www.saycbridge.com/...`, which the redirects above consolidate onto the
canonical HTTPS apex.

Still outstanding: verify the `https://saycbridge.com` property in Google
Search Console and submit `https://saycbridge.com/sitemap.xml`. Search Console
history starts at verification rather than retroactively, so this only gets
more expensive to postpone. Afterwards, watch the Coverage report for `/bid/`
URLs — they are canonicalized to `/`, so they should report as "Alternate page
with proper canonical tag" rather than as duplicates.

`src/analytics.ts` reports to GA4 (`G-V8KS5372FL`). It is restricted to the
production hostnames: preview is promoted as the very same build artifact, so
the hostname is the only thing that can keep dev.saycbridge.com out of the
property.

### What the app already does

- `public/robots.txt` allows everything and points at the sitemap. The old
  site's `Disallow: /explore` is deliberately gone: it existed to keep crawlers
  off a JSON endpoint per candidate bid, and the explorer is computed in the
  browser now.
- `public/_redirects` sends `/scoring` and `/play` to `/`. Without it,
  `not_found_handling: "single-page-application"` answers 200 with the app
  shell, which is a soft 404 on two URLs that are live and indexed today.
  `/scoring` is a 301: the scoring flashcards are retired and the URL should
  leave the index. `/play` is a 302, because card play has not been ruled on.
- `index.html` ships the site description inside `#root`, which React replaces
  on boot. A crawler that does not execute 12 MB of WebAssembly still gets the
  page's copy.

## Notes

- `not_found_handling: "single-page-application"` is what makes deep links work
  on a cold load.
- Cloudflare's static asset limits are 25 MiB per file and 20,000 files. The
  build is ~22 MB across 14 files, the largest being `pyodide.asm.wasm` at
  ~9 MB.
