import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { advancedExamples, buildExampleRuntimeBundle, startExampleServer } from "../../tools/example-server.mjs";

test("advanced examples render with the bundled runtime", { timeout: 120_000 }, async () => {
    await buildExampleRuntimeBundle();
    const server = await startExampleServer();
    const browser = await launchBrowser();
    const baseUrl = `http://127.0.0.1:${server.port}`;

    try {
        for (const example of advancedExamples) {
            await runExample(browser, baseUrl, example);
        }
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
