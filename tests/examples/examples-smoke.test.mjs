import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cacheRoot = path.join(repoRoot, ".cache", "example-smoke");
const runtimeBundlePath = path.join(cacheRoot, "runtime.js");

const examples = [
    { name: "webgpu", path: "/examples/webgpu/index.html", renderer: "webgpu" },
    { name: "offscreen", path: "/examples/offscreen/index.html", renderer: "offscreen-webgl" },
    { name: "worker-rendering", path: "/examples/worker-rendering/index.html", renderer: "worker-webgl" },
];

test("advanced examples render with the bundled runtime", { timeout: 120_000 }, async () => {
    await buildRuntimeBundle();
    const server = await startServer();
    const browser = await launchBrowser();
    const baseUrl = `http://127.0.0.1:${server.port}`;

    try {
        for (const example of examples) {
            await runExample(browser, baseUrl, example);
        }
    }
    finally {
        await browser.close();
        await new Promise(resolve => server.instance.close(resolve));
    }
});

async function buildRuntimeBundle() {
    await mkdir(cacheRoot, { recursive: true });
    await build({
        stdin: {
            sourcefile: "example-runtime-entry.js",
            resolveDir: repoRoot,
            loader: "js",
            contents: `
                import * as THREE from "three";
                import * as THREE_WEBGPU from "three/webgpu";
                export { THREE, THREE_WEBGPU };
                export { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
                export { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
                export { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
                export { LODsManager, useNeedleProgressive } from "./src/index.ts";
            `,
        },
        outfile: runtimeBundlePath,
        bundle: true,
        format: "esm",
        platform: "browser",
        sourcemap: false,
        logLevel: "silent",
    });
}

async function launchBrowser() {
    const launchOptions = {
        headless: process.env.PLAYWRIGHT_HEADED === "1" ? false : true,
        args: ["--enable-unsafe-webgpu"],
    };
    if (process.env.NEEDLE_BROWSER_CHANNEL) {
        launchOptions.channel = process.env.NEEDLE_BROWSER_CHANNEL;
    }
    return await chromium.launch(launchOptions);
}

async function runExample(browser, baseUrl, example) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const diagnostics = [];
    page.on("console", message => {
        if (message.type() === "error" || message.type() === "warning") diagnostics.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", error => diagnostics.push(error.stack || error.message));

    const url = `${baseUrl}${example.path}?runtime=/__example-runtime.js&asset=minimal`;
    await page.goto(url);
    try {
        await page.waitForFunction(() => globalThis.__GLTF_PROGRESSIVE_EXAMPLE__?.done === true, undefined, { timeout: 45_000 });
        await page.waitForFunction(() => (globalThis.__GLTF_PROGRESSIVE_EXAMPLE__?.frames || 0) > 0, undefined, { timeout: 10_000 });
    }
    catch (error) {
        const state = await page.evaluate(() => globalThis.__GLTF_PROGRESSIVE_EXAMPLE__ || null);
        throw new Error(`${example.name} did not become render-ready: ${error?.message || error}\n${JSON.stringify(state)}\n${diagnostics.join("\n")}`);
    }

    const state = await page.evaluate(() => globalThis.__GLTF_PROGRESSIVE_EXAMPLE__);
    await page.close();

    assert.equal(state.ok, true, `${example.name} failed:\n${[...state.errors, ...diagnostics].join("\n")}`);
    assert.equal(state.loaded, true, `${example.name} did not load the glTF scene.`);
    assert.equal(state.renderer, example.renderer);
    assert.ok(state.frames > 0, `${example.name} did not render any frames.`);
}

function startServer() {
    return new Promise(resolve => {
        const instance = createServer(async (request, response) => {
            try {
                const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
                const filePath = resolveRequestPath(requestUrl.pathname);
                response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
                response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
                response.setHeader("Content-Type", getMimeType(filePath));
                response.end(await import("node:fs/promises").then(fs => fs.readFile(filePath)));
            }
            catch (error) {
                response.statusCode = 404;
                response.end(error?.message || String(error));
            }
        });
        instance.listen(0, "127.0.0.1", () => {
            resolve({ instance, port: instance.address().port });
        });
    });
}

function resolveRequestPath(pathname) {
    if (pathname === "/__example-runtime.js") return runtimeBundlePath;
    const normalizedPath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, "");
    return path.join(repoRoot, normalizedPath === "/" ? "examples/webgpu/index.html" : normalizedPath);
}

function getMimeType(filePath) {
    if (filePath.endsWith(".html")) return "text/html";
    if (filePath.endsWith(".js")) return "text/javascript";
    if (filePath.endsWith(".json") || filePath.endsWith(".gltf")) return "application/json";
    if (filePath.endsWith(".wasm")) return "application/wasm";
    return "application/octet-stream";
}
