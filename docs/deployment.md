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

## Notes

- `not_found_handling: "single-page-application"` is what makes deep links work
  on a cold load. It replaces the `404.html` copy the old GitHub Pages workflow
  needed.
- After cutover, `www.saycbridge.com` serves the same content as the apex. If
  you would rather it redirect, drop the `www` route and add a Cloudflare
  Redirect Rule.
- Cloudflare's static asset limits are 25 MiB per file and 20,000 files. The
  current build is ~22 MB across 14 files, the largest being `pyodide.asm.wasm`
  at ~9 MB.
