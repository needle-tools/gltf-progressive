#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import {
    buildWorkerBundle,
    cacheModelGraph,
    cacheThreeVersions,
    createCachedThreeRuntime,
    createLocalThreeRuntime,
    createThreeImportMap,
    defaultThreeVersions,
    getDefaultCacheRoot,
    parseMatrixArgs,
    rawFsUrl,
    rendererModes,
    resolveRequestedVersions,
    writeThreeMatrixPages,
} from "@needle-tools/three-test-matrix";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const args = parseMatrixArgs(process.argv.slice(2));
const sharedCacheRoot = getDefaultCacheRoot({ cacheRoot: args.cacheRoot, cwd: repoRoot });
const threeCacheRoot = path.join(sharedCacheRoot, "three-versions");
const pagesRoot = path.join(repoRoot, ".cache", "gltf-progressive-three-compat-pages");
const workerBundlesRoot = path.join(repoRoot, ".cache", "gltf-progressive-three-compat-workers");
const assetCacheRoot = path.join(sharedCacheRoot, "models", "gltf-progressive", "forgotten-knight");
const fixtureAssets = [
    {
        id: "forgotten-knight-source",
        fileName: "source.glb",
        url: "https://cloud.needle.tools/-/assets/Z23hmXBZ21QnG-Yt9m7/the-forgotten-knight-baked.glb",
    },
    {
        id: "forgotten-knight-optimized",
        fileName: "optimized.glb",
        url: "https://cloud.needle.tools/-/assets/Z23hmXBZ21QnG-Yt9m7-optimized/the-forgotten-knight-baked.glb",
    },
    {
        id: "forgotten-knight-product",
        fileName: "product.glb",
        url: "https://cloud.needle.tools/-/assets/Z23hmXBZ21QnG-Yt9m7-product/the-forgotten-knight-baked.glb",
    },
    {
        id: "forgotten-knight-world",
        fileName: "world.glb",
        url: "https://cloud.needle.tools/-/assets/Z23hmXBZ21QnG-Yt9m7-world/the-forgotten-knight-baked.glb",
    },
];

const versions = resolveRequestedVersions({
    versions: args.versions,
    fromRevision: args.fromRevision,
    defaultVersions: [...defaultThreeVersions],
    cwd: repoRoot,
});

await fs.mkdir(pagesRoot, { recursive: true });
await fs.mkdir(workerBundlesRoot, { recursive: true });

const fixtureManifest = await cacheModelGraph({
    cacheRoot: assetCacheRoot,
    assets: fixtureAssets,
    refresh: args.refresh,
});

await cacheThreeVersions({
    cacheRoot: threeCacheRoot,
    versions,
    refresh: args.refresh,
    cwd: repoRoot,
});

const runtimes = [
    await createLocalThreeRuntime({ repoRoot }),
    ...await Promise.all(versions.map(version => createCachedThreeRuntime({
        cacheRoot: threeCacheRoot,
        version,
    }))),
];

const pagesManifest = await writeThreeMatrixPages({
    pagesRoot,
    runtimes,
    rendererModes,
    createPage: ({ runtime, rendererMode }) => createCompatPage({
        runtime,
        rendererMode,
        workerUrl: rawFsUrl(path.join(workerBundlesRoot, `${runtime.id}-${rendererMode}`.replace(/[^a-zA-Z0-9_.-]/g, "_") + ".js")),
        fixtureAssets: fixtureManifest.assets,
    }),
});

for (const runtime of runtimes) {
    for (const rendererMode of rendererModes) {
        const fileName = `${runtime.id}-${rendererMode}`.replace(/[^a-zA-Z0-9_.-]/g, "_") + ".js";
        await buildWorkerBundle({
            contents: getWorkerEntry(),
            outfile: path.join(workerBundlesRoot, fileName),
            packageRoot: runtime.packageRoot,
            resolveDir: repoRoot,
            sourcefile: "gltf-progressive-worker-entry.js",
        });
    }
}

console.log(`Wrote gltf-progressive compat manifest for ${pagesManifest.pages.length} cases to ${path.join(pagesRoot, "manifest.json")}`);
console.log(`Using Three cache at ${threeCacheRoot}`);
console.log(`Using fixture cache at ${assetCacheRoot}`);

function createCompatPage({ runtime, rendererMode, workerUrl, fixtureAssets }) {
    const importMap = createThreeImportMap(runtime, rendererMode);
    const addonsUrl = runtime.addonsUrl;
    return `<!doctype html>
<html>
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${runtime.id}</title>
        <script type="importmap">
            ${JSON.stringify(importMap, null, 2)}
        </script>
        <script>
            window.__GLTF_PROGRESSIVE_COMPAT_CONFIG__ = {
                runtimeVersion: ${JSON.stringify(runtime.versionLabel)},
                rendererMode: ${JSON.stringify(rendererMode)},
                packageUrl: ${JSON.stringify(rawFsUrl(path.join(repoRoot, "dist", "lib", "index.js")))},
                staticMainUrl: ${JSON.stringify(rawFsUrl(path.join(repoRoot, "tests", "compat", "static", "main.js")))},
                workerUrl: ${JSON.stringify(workerUrl)},
                fixtureAssets: ${JSON.stringify(fixtureAssets)},
                dracoDecoderPath: ${JSON.stringify(`${addonsUrl}libs/draco/gltf/`)},
                ktx2TranscoderPath: ${JSON.stringify(`${addonsUrl}libs/basis/`)},
                webgpuConfigured: ${Boolean(runtime.webgpuUrl)},
                forceWebGLSupported: ${Boolean(runtime.forceWebGLSupported)}
            };
        </script>
    </head>
    <body>
        <canvas id="c" width="512" height="512"></canvas>
        <script type="module">
            import(window.__GLTF_PROGRESSIVE_COMPAT_CONFIG__.staticMainUrl);
        </script>
    </body>
</html>`;
}

function getWorkerEntry() {
    return `
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
    addDracoAndKTX2Loaders,
    configureLoader,
    createLoaders,
    setDracoDecoderLocation,
    setKTX2TranscoderLocation,
} from "./dist/lib/index.js";

const minimalGltf = "data:model/gltf+json;charset=utf-8," + encodeURIComponent(JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "WorkerMatrixSmoke" }],
}));

self.addEventListener("message", async (event) => {
    try {
        if (event.data?.dracoDecoderPath) setDracoDecoderLocation(event.data.dracoDecoderPath);
        if (event.data?.ktx2TranscoderPath) setKTX2TranscoderLocation(event.data.ktx2TranscoderPath);
        createLoaders(null);
        const loader = createConfiguredLoader();
        const gltf = await new Promise((resolve, reject) => {
            loader.load(minimalGltf, resolve, undefined, reject);
        });
        const assets = [];
        for (const asset of event.data?.assets || []) {
            assets.push(await loadAsset(asset));
        }
        self.postMessage({
            ok: true,
            sceneName: gltf.scene.children[0]?.name || "",
            assets,
            hasWindow: typeof window !== "undefined",
            hasDocument: typeof document !== "undefined",
        });
    }
    catch (error) {
        self.postMessage({
            ok: false,
            message: error?.message || String(error),
            stack: error?.stack || "",
            hasWindow: typeof window !== "undefined",
            hasDocument: typeof document !== "undefined",
        });
    }
});

function createConfiguredLoader() {
    const loader = new GLTFLoader();
    addDracoAndKTX2Loaders(loader);
    configureLoader(loader, { progressive: true });
    return loader;
}

async function loadAsset(asset) {
    try {
        const loader = createConfiguredLoader();
        const gltf = await new Promise((resolve, reject) => {
            loader.load(asset.url, resolve, undefined, reject);
        });
        return {
            id: asset.id,
            dependencyCount: asset.dependencyCount,
            status: "loaded",
            sceneChildren: gltf.scene?.children?.length ?? 0,
            animations: gltf.animations?.length ?? 0,
        };
    }
    catch (error) {
        const message = error?.message || String(error);
        const stack = error?.stack || "";
        const isWorkerWebPImageProbe = message.includes("Image is not defined") || stack.includes("Image is not defined");
        return {
            id: asset.id,
            dependencyCount: asset.dependencyCount,
            status: isWorkerWebPImageProbe ? "unsupported" : "failed",
            unsupportedReason: isWorkerWebPImageProbe ? "Three GLTFLoader EXT_texture_webp support probe uses Image in workers." : undefined,
            message,
            stack,
        };
    }
}
`;
}
