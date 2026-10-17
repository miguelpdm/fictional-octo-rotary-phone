import { test, expect, webkit, devices } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function contentType(file) {
  if (file.endsWith(".html")) return "text/html";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let file = path.join(root, urlPath);
      if (urlPath.endsWith("/")) file = path.join(file, "index.html");
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        res.writeHead(200, { "Content-Type": contentType(file) });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

test("webkit iPhone: tap starts AudioContext and oscillators", async () => {
  const { server, port } = await startServer();
  const browser = await webkit.launch();
  try {
    const context = await browser.newContext({
      ...(devices["iPhone 13"] || {
        viewport: { width: 390, height: 844 },
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        hasTouch: true,
        isMobile: true,
      }),
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/melodia/`);
    await page.waitForSelector("#pad");
    await page.waitForFunction(
      () => document.getElementById("progress")?.textContent.includes("/ 30")
    );

    await page.locator("#pad").tap();
    await page.waitForTimeout(250);

    const info = await page.evaluate(() => window.__melodiaAudio());
    expect(info.state).toBe("running");
    expect(info.starts).toBeGreaterThan(0);
    expect(info.currentTime).toBeGreaterThan(0);

    const ui = await page.evaluate(() => ({
      progress: document.getElementById("progress").textContent,
      pad: document.getElementById("pad-label").textContent,
    }));
    expect(ui.progress).toMatch(/Nota 1 \/ 30/);
    expect(ui.pad).toBe("Sigue");
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
});
