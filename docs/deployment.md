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

Stage 1 is live and verified, so this is the remaining work.

Custom Domains require Cloudflare to be authoritative for the zone. That means
changing the nameservers at GoDaddy, not editing records there, which moves all
DNS at once. Email is the real risk; the website is not.

### What is on the domain today

Re-run this immediately before flipping, rather than trusting the list below.
The zone is being actively edited: its SOA serial went from `2016050300` to
`2026082902` in a single day.

```bash
dig saycbridge.com ANY +noall +answer @ns35.domaincontrol.com
```

As last measured:

| Record                  | Value                                  | Notes                                   |
| ----------------------- | -------------------------------------- | --------------------------------------- |
| Apex `A`                | `192.241.239.197`                      | **Dead** — does not respond. Delete it. |
| `www` CNAME             | `ghs.google.com`                       | The live legacy site                    |
| `mail` CNAME            | `ghs.google.com`                       | Redirect to Google Mail login           |
| `MX` ×7                 | `aspmx.l.google.com` and friends       | **Live Google Workspace mail**          |
| `google._domainkey` TXT | DKIM key                               | Must survive                            |
| Apex TXT                | `google-site-verification=4Bw3qJjVic…` | Search Console; predates this work      |

There is no SPF and no DMARC record. That is a pre-existing gap, not something
the migration introduces, but it is worth fixing while you are in the DNS.

Because the apex is already dead, pointing it at the Worker carries no
regression risk. `www` is the only hostname where users notice anything.

### 1. Add the zone to Cloudflare

Add saycbridge.com in account `5ea3476b…` — the same account as the Workers,
since Custom Domains cannot cross accounts. Let Cloudflare import the records.

Set `www` and `mail` to **DNS-only (grey cloud)**. Proxying Google-hosted
hostnames through Cloudflare breaks their certificate handling.

### 2. Verify the imported zone before touching GoDaddy

Cloudflare answers on its assigned nameservers as soon as the zone exists,
while GoDaddy is still authoritative and live traffic is untouched. This proves
the new zone is correct with nobody exposed, and it is the gate that protects
email:

```bash
NS=<an-assigned-cloudflare-nameserver>
dig @$NS saycbridge.com MX +short                       # expect all 7 Google hosts
dig @$NS google._domainkey.saycbridge.com TXT +short    # expect the DKIM key
dig @$NS saycbridge.com TXT +short                      # expect google-site-verification
dig @$NS www.saycbridge.com +short                      # expect ghs.google.com
```

Mail routing is only MX data, and Cloudflare cannot proxy MX, so there is no
Cloudflare-specific way for mail to break. The only failure mode is a record
the importer missed, which the above catches.

### 3. Change the nameservers at GoDaddy

Point them at the pair Cloudflare assigns. Usually under an hour, formally up
to 48. Once the zone is active, send yourself a test email before continuing.

### 4. Widen the API token

Add one permission, scoped to saycbridge.com. Editing a token in place does not
change its value, so the GitHub secret does not need rotating.

- Zone → Workers Routes → Edit

Deliberately **not** Zone → DNS → Edit. Custom Domains are attached server-side:
Cloudflare creates the DNS record and issues the certificate itself, so the
client never writes DNS and should not need permission to. Cloudflare's own
generated Workers Builds CI token grants Workers Routes but not DNS for exactly
this reason.

This matters because the token lives in a public repository's secrets and the
zone carries live Google Workspace mail. With Workers Routes alone, the worst a
leaked token can do is redeploy the site. With DNS edit, it could rewrite the MX
records and intercept mail. If a deploy ever fails on the custom domain step
with a permissions error, add DNS edit then — but do not grant it pre-emptively.

### 5. Attach the domains

Delete the dead apex `A` record and the `www` CNAME first, or the deploy will
conflict with them. Then merge the routes in `wrangler.jsonc`, let preview
deploy, and promote. Cloudflare creates the records and certificates.

### Rolling back

Reversible, but not instantly: repoint the nameservers at GoDaddy and wait out
propagation. This only stays true if the old side is left intact — keep the
GoDaddy zone and the Google domain mapping for `www`. Delete the Google
mapping and restoring the CNAME will not bring the legacy site back.

To give up only the website while keeping the DNS move, remove the `www` route
and restore its CNAME to `ghs.google.com`.

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
- `public/_redirects` sends `/scoring` and `/play` to `/`. Without it,
  `not_found_handling: "single-page-application"` answers 200 with the app
  shell, which is a soft 404 on two URLs that are live and indexed today.
  `/scoring` is a 301: the scoring flashcards are retired and the URL should
  leave the index. `/play` is a 302, because card play has not been ruled on.
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
