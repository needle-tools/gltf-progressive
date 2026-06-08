import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
    advancedExamples,
    buildExampleRuntimeBundle,
    buildReactThreeFiberExample,
    reactThreeFiberExample,
    startExampleServer,
} from "../../tools/example-server.mjs";

test("advanced examples render with the bundled runtime", { timeout: 240_000 }, async () => {
    await buildExampleRuntimeBundle();
    await buildReactThreeFiberExample();
    const server = await startExampleServer();
    const browser = await launchBrowser();
    const baseUrl = `http://127.0.0.1:${server.port}`;

    try {
        await runExamplesIndex(browser, baseUrl);
        for (const example of advancedExamples) {
            await runExample(browser, baseUrl, example);
        }
        await runReactThreeFiberExample(browser, baseUrl);
    }
    finally {
        await browser.close();
        await new Promise(resolve => server.instance.close(resolve));
    }
});

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

async function runExamplesIndex(browser, baseUrl) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await page.goto(`${baseUrl}/examples/`, { waitUntil: "domcontentloaded" });
    const linkCount = await page.locator("main a").count();
    await page.close();

    assert.ok(linkCount >= 8, "examples index should link to the available examples.");
}

async function runExample(browser, baseUrl, example) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const diagnostics = [];
    page.on("console", message => {
        if (message.type() === "error" || message.type() === "warning") diagnostics.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", error => diagnostics.push(error.stack || error.message));

    const url = buildExampleUrl(baseUrl, example.path, { runtime: "/__example-runtime.js" });
    await page.goto(url);
    try {
        await page.waitForFunction(() => globalThis.__GLTF_PROGRESSIVE_EXAMPLE__?.done === true, undefined, { timeout: 45_000 });
        await page.waitForFunction(() => (globalThis.__GLTF_PROGRESSIVE_EXAMPLE__?.frames || 0) > 0, undefined, { timeout: 10_000 });
        await page.waitForFunction(() => (globalThis.__GLTF_PROGRESSIVE_EXAMPLE__?.progressiveObjects || 0) > 0, undefined, { timeout: 20_000 });
        await page.waitForFunction(() => (globalThis.__GLTF_PROGRESSIVE_EXAMPLE__?.lodChanges || 0) > 0, undefined, { timeout: 45_000 });
        await page.waitForFunction(() => globalThis.__GLTF_PROGRESSIVE_EXAMPLE__?.lodChangeTypes?.includes("mesh"), undefined, { timeout: 45_000 });
        await page.getByRole("button", { name: "Change scene" }).click();
        await page.waitForFunction(() => (globalThis.__GLTF_PROGRESSIVE_EXAMPLE__?.sceneLoads || 0) >= 2, undefined, { timeout: 45_000 });
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
    assert.ok(state.progressiveObjects > 0, `${example.name} did not expose progressive LOD metadata.`);
    assert.ok(state.lodChanges > 0, `${example.name} did not apply any progressive LOD changes.`);
    assert.ok(state.lodChangeTypes.includes("mesh"), `${example.name} did not apply a progressive mesh LOD change.`);
    assert.ok(state.sceneLoads >= 2, `${example.name} did not load a second scene after pressing Change scene.`);
}

function buildExampleUrl(baseUrl, examplePath, params) {
    const url = new URL(examplePath, baseUrl);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return url.href;
}

async function runReactThreeFiberExample(browser, baseUrl) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const diagnostics = [];
    page.on("console", message => {
        if (message.type() === "error") diagnostics.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", error => diagnostics.push(error.stack || error.message));
    page.on("requestfailed", request => diagnostics.push(`request failed: ${request.url()} ${request.failure()?.errorText || ""}`));

    await page.goto(`${baseUrl}${reactThreeFiberExample.path}`, { waitUntil: "domcontentloaded" });
    await page.locator("canvas").waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => globalThis.__GLTF_PROGRESSIVE_R3F_EXAMPLE__?.currentUrl?.includes("/church/model.glb"), undefined, { timeout: 30_000 });
    await page.getByRole("button", { name: "Change scene" }).click();
    await page.waitForFunction(() => globalThis.__GLTF_PROGRESSIVE_R3F_EXAMPLE__?.sceneIndex === 1, undefined, { timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 45_000 });
    await page.waitForTimeout(1_000);

    const canvasSize = await page.locator("canvas").evaluate(canvas => ({
        width: canvas.clientWidth,
        height: canvas.clientHeight,
    }));
    await page.close();

    assert.deepEqual(diagnostics, [], `${reactThreeFiberExample.name} failed:\n${diagnostics.join("\n")}`);
    assert.ok(canvasSize.width > 0 && canvasSize.height > 0, `${reactThreeFiberExample.name} did not create a visible canvas.`);
}
