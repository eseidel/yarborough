import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const PASSING_BOARD = "8-0622931ecfe9993de30355dae4";

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
