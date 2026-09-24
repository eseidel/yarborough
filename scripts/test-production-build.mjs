import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const PASSING_BOARD = "8-0622931ecfe9993de30355dae4";
const DIST = fileURLToPath(new URL("../dist", import.meta.url));
// An exported C API entry point of libz3, present in the Z3 module's glue.
const Z3_MARKER = "Z3_mk_solver";

/**
 * The layout of the built assets: the engine and its Z3 module in one chunk
 * that only the bidding worker imports, nothing of the Python runtime the
 * site used to ship, and an app chunk that is free of both.
 */
function checkAssets() {
  const files = readdirSync(DIST, { recursive: true }).map(String);
  const pythonRuntime = files.filter(
    (file) => /pyodide|micropip/i.test(file) || file.endsWith(".whl"),
  );
  assert.deepEqual(pythonRuntime, [], "the build ships a Python runtime");

  const chunks = files.filter(
    (file) => file.startsWith("assets/") && file.endsWith(".js"),
  );
  const withZ3 = chunks.filter((file) =>
    readFileSync(join(DIST, file), "latin1").includes(Z3_MARKER),
  );
  assert.equal(withZ3.length, 1, `Z3 is in ${withZ3.length} chunks: ${withZ3}`);
  const [engineChunk] = withZ3;
  assert.doesNotMatch(engineChunk, /^assets\/index-/, "Z3 is in the app chunk");

  const engineChunkName = engineChunk.slice("assets/".length);
  const importers = chunks.filter(
    (file) =>
      file !== engineChunk &&
      readFileSync(join(DIST, file), "latin1").includes(engineChunkName),
  );
  assert.deepEqual(
    importers.map((file) => file.replace(/-[\w-]+\.js$/, "")),
    ["assets/z3b.worker"],
    "only the bidding worker may import the engine chunk",
  );
  return engineChunk;
}

/** Where the nav bar sits, how it is drawn, and where the page's text starts. */
function measureFirstScreen() {
  const nav = document.querySelector("#root nav");
  const heading = document.querySelector("#root h1");
  return {
    nav: nav && {
      height: nav.getBoundingClientRect().height,
      background: getComputedStyle(nav).backgroundColor,
    },
    headingTop: heading?.getBoundingClientRect().top ?? null,
    viewportHeight: window.innerHeight,
  };
}

/**
 * The first paint of a first visit is the static shell in index.html, shown
 * until the app script has downloaded. It must look like the app, not like a
 * page of bare text: the same nav bar, and the crawler's description below
 * the fold. Blocking the app script holds the page at that first paint.
 */
async function checkFirstPaint(browser, origin) {
  const app = await browser.newPage();
  await app.goto(`${origin}/`);
  await app.locator('[data-testid="call-table"]').waitFor();
  const booted = await app.evaluate(measureFirstScreen);
  await app.close();

  const shell = await browser.newPage();
  await shell.route(/\/assets\/index-[\w-]+\.js$/, (route) => route.abort());
  await shell.goto(`${origin}/`);
  const firstPaint = await shell.evaluate(measureFirstScreen);
  await shell.close();

  assert.notEqual(firstPaint.nav, null, "the static shell has no nav bar");
  assert.deepEqual(
    firstPaint.nav,
    booted.nav,
    "the static shell's nav bar does not match the app's",
  );
  assert.ok(
    firstPaint.headingTop !== null &&
      firstPaint.headingTop >= firstPaint.viewportHeight,
    `the static shell's text starts on screen, at ${firstPaint.headingTop}px`,
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Could not allocate a local preview port");
  }
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function waitForServer(url) {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(
        `Preview server responded with ${response.status} ${response.statusText}`,
      );
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error;
      }
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Preview server did not start: ${String(lastError)}`);
}

async function main() {
  const engineChunk = checkAssets();
  console.log(`engine chunk: ${engineChunk}`);
  const port = await availablePort();
  const origin = `http://${HOST}:${port}`;
  const viteCli = fileURLToPath(
    new URL("../node_modules/vite/bin/vite.js", import.meta.url),
  );
  const preview = spawn(
    process.execPath,
    [
      viteCli,
      "preview",
      "--host",
      HOST,
      "--port",
      String(port),
      "--strictPort",
    ],
    { stdio: "inherit" },
  );

  try {
    await waitForServer(`${origin}/`);
    const browser = await chromium.launch();
    try {
      await checkFirstPaint(browser, origin);
      const page = await browser.newPage();
      const externalRequests = new Set();
      const browserErrors = [];
      const failedRequests = [];
      page.on("request", (request) => {
        const requestUrl = new URL(request.url());
        if (
          requestUrl.protocol !== "data:" &&
          requestUrl.protocol !== "blob:" &&
          requestUrl.origin !== origin
        ) {
          externalRequests.add(requestUrl.origin);
        }
      });
      page.on("console", (message) => {
        if (message.type() === "error") {
          browserErrors.push(message.text());
        }
      });
      page.on("pageerror", (error) => {
        browserErrors.push(error.message);
      });
      page.on("response", (response) => {
        if (response.status() >= 400) {
          failedRequests.push(`${response.status()} ${response.url()}`);
        }
      });

      const navigationStarted = performance.now();
      const response = await page.goto(`${origin}/bid/${PASSING_BOARD}`);
      assert.equal(response?.status(), 200);
      try {
        await page.locator('[data-testid="call-table"]').waitFor();
      } catch (error) {
        throw new Error(
          `The production app did not render a call table: ${String(error)}\n${browserErrors.join("\n")}\n${failedRequests.join("\n")}`,
        );
      }
      // The engine loads and bids for the seats before South; the table shows
      // a pulsing marker in the pending cell until then. Wait for a call.
      await page
        .locator('[data-testid="call-table"]')
        .getByText("Pass")
        .first()
        .waitFor({ timeout: 120_000 });
      console.log(
        `first bid ${((performance.now() - navigationStarted) / 1000).toFixed(1)} s after navigation`,
      );
      assert.match(
        (await page.locator('[data-testid="call-table"]').textContent()) ?? "",
        /Pass/,
      );
      assert.deepEqual([...externalRequests], []);
    } finally {
      await browser.close();
    }
  } finally {
    if (preview.exitCode === null && preview.kill("SIGTERM")) {
      await new Promise((resolve) => preview.once("exit", resolve));
    }
  }
}

await main();
