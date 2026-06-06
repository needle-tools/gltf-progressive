const config = window.__GLTF_PROGRESSIVE_COMPAT_CONFIG__;
const errors = [];
const warnings = [];
const originalWarn = console.warn.bind(console);

console.warn = (...args) => {
    warnings.push(args.map(value => typeof value === "string" ? value : value?.message || String(value)).join(" "));
    originalWarn(...args);
};

window.addEventListener("error", event => {
    errors.push(event.message || String(event.error || event));
});
window.addEventListener("unhandledrejection", event => {
    errors.push(event.reason?.message || String(event.reason || event));
});

try {
    const THREE = await import("three");
    const rendererResult = await createRenderer(THREE);
    const renderer = rendererResult.renderer;
    if (!renderer) {
        exposeUnsupported(rendererResult.unsupportedReason || "Renderer mode is not available in this Three runtime or browser.");
    }
    else {
        const backendType = getRendererBackendType(renderer);
        if (config.rendererMode === "webgpu" && !backendType.startsWith("webgpu")) {
            renderer?.dispose?.();
            exposeUnsupported(`WebGPU native initialized with ${backendType} backend.`);
        }
        else {
            window.__GLTF_PROGRESSIVE_COMPAT__ = {
                status: "ready",
                rendererMode: config.rendererMode,
                rendererClass: renderer.constructor?.name ?? null,
                backendType,
                runSuite: () => runSuite(THREE, renderer),
            };
        }
    }
}
catch (error) {
    window.__GLTF_PROGRESSIVE_COMPAT_ERROR__ = error?.stack || error?.message || String(error);
}

async function createRenderer(THREE) {
    const canvas = document.getElementById("c");
    if (config.rendererMode === "webgl") {
        return { renderer: new THREE.WebGLRenderer({ canvas, antialias: false }) };
    }

    if (!config.webgpuConfigured) return { renderer: null };
    if (config.rendererMode === "webgpu-force-webgl2" && !config.forceWebGLSupported) return { renderer: null };
    if (config.rendererMode === "webgpu" && !navigator.gpu) {
        return { renderer: null, unsupportedReason: "navigator.gpu is not available." };
    }

    let WebGPURenderer;
    try {
        WebGPURenderer = await getWebGPURenderer(THREE);
    }
    catch (error) {
        return {
            renderer: null,
            unsupportedReason: error?.message || String(error),
        };
    }
    if (!WebGPURenderer) return { renderer: null };

    try {
        const renderer = new WebGPURenderer({
            canvas,
            antialias: false,
            forceWebGL: config.rendererMode === "webgpu-force-webgl2",
        });
        await renderer.init?.();
        return { renderer };
    }
    catch (error) {
        return {
            renderer: null,
            unsupportedReason: error?.message || String(error),
        };
    }
}

async function getWebGPURenderer(THREE) {
    if (THREE.WebGPURenderer) return THREE.WebGPURenderer;
    const module = await import("three/webgpu");
    return module.WebGPURenderer || module.default || null;
}

function getRendererBackendType(renderer) {
    if (renderer.isWebGLRenderer === true) return "webgl";
    if (renderer.isWebGPURenderer === true) {
        const backend = renderer.backend;
        if (backend?.isWebGLBackend === true) return "webgl";
        if (backend?.isWebGPUBackend === true) return "webgpu";
        return backend?.constructor?.name ? `webgpu:${backend.constructor.name}` : "webgpu";
    }
    if (renderer.constructor?.name === "WebGPURenderer") {
        const backend = renderer.backend;
        if (backend?.constructor?.name?.includes("WebGL")) return "webgl";
        return backend?.constructor?.name ? `webgpu:${backend.constructor.name}` : "webgpu";
    }
    return renderer.constructor?.name || "unknown";
}

function exposeUnsupported(reason) {
    window.__GLTF_PROGRESSIVE_COMPAT__ = {
        status: "unsupported",
        rendererMode: config.rendererMode,
        backendType: "unsupported",
        unsupportedReason: reason,
    };
}

async function runSuite(THREE, renderer) {
    const packageModule = await import(config.packageUrl);
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    assertPackageExports(packageModule);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 4);
    camera.updateMatrixWorld();

    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0x55aaee }),
    );
    scene.add(mesh);

    const loader = new GLTFLoader();
    let lodPluginCalls = 0;
    const lodPlugin = {
        onBeforeUpdateLOD() {
            lodPluginCalls += 1;
        },
    };
    packageModule.LODsManager.addPlugin(lodPlugin);
    packageModule.setDracoDecoderLocation(config.dracoDecoderPath);
    packageModule.setKTX2TranscoderLocation(config.ktx2TranscoderPath);
    const lodsManager = packageModule.useNeedleProgressive(loader, renderer, { enableLODsManager: true });
    const gltf = await loadMinimalGltf(loader);
    const fixtureAssets = await loadFixtureAssets(loader, config.fixtureAssets || []);
    const renderFixture = fixtureAssets.find(asset => asset.id === "forgotten-knight-product")?.gltf;
    if (renderFixture?.scene) {
        renderFixture.scene.position.set(0, -1, 0);
        scene.add(renderFixture.scene);
    }
    scene.add(gltf.scene);

    for (let i = 0; i < 4; i++) {
        renderer.render(scene, camera);
        await new Promise(resolve => requestAnimationFrame(resolve));
    }

    const workerAssets = (config.fixtureAssets || []).filter(asset => asset.dependencyCount > 0);
    const worker = await runWorker(config.workerUrl, {
        assets: workerAssets.map(asset => ({
            id: asset.id,
            url: asset.url,
            dependencyCount: asset.dependencyCount,
        })),
        dracoDecoderPath: config.dracoDecoderPath,
        ktx2TranscoderPath: config.ktx2TranscoderPath,
    });
    const clockDeprecationWarnings = warnings.filter(entry => entry.includes("THREE.Clock") && entry.includes("deprecated"));
    packageModule.LODsManager.removePlugin(lodPlugin);

    renderer.dispose?.();

    return {
        config: {
            runtimeVersion: config.runtimeVersion,
            rendererMode: config.rendererMode,
        },
        renderer: {
            className: renderer.constructor?.name ?? null,
            backendType: getRendererBackendType(renderer),
            renderList: getRenderListSummary(renderer, scene, camera),
            lodPluginCalls,
        },
        package: {
            version: packageModule.VERSION,
            lodsManagerClass: lodsManager?.constructor?.name || null,
        },
        loader: {
            sceneName: gltf.scene.children[0]?.name || "",
            parserExtensionRegistered: Boolean(loader.pluginCallbacks?.length),
        },
        fixtureAssets: fixtureAssets.map(({ gltf: _gltf, ...asset }) => asset),
        worker,
        diagnostics: {
            errors: [...errors],
            warnings: [...warnings],
            clockDeprecationWarnings,
        },
    };
}

function assertPackageExports(packageModule) {
    const names = [
        "VERSION",
        "LODsManager",
        "configureLoader",
        "createLoaders",
        "setDracoDecoderLocation",
        "setKTX2TranscoderLocation",
        "useNeedleProgressive",
    ];
    for (const name of names) {
        if (!packageModule[name]) throw new Error(`Missing package export: ${name}`);
    }
}

async function loadMinimalGltf(loader) {
    const url = "data:model/gltf+json;charset=utf-8," + encodeURIComponent(JSON.stringify({
        asset: { version: "2.0" },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ name: "MatrixSmoke" }],
    }));
    return await new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
    });
}

async function loadFixtureAssets(loader, fixtureAssets) {
    const results = [];
    for (const asset of fixtureAssets) {
        const gltf = await new Promise((resolve, reject) => {
            loader.load(asset.url, resolve, undefined, reject);
        });
        results.push({
            id: asset.id,
            url: asset.url,
            sourceUrl: asset.sourceUrl,
            bytes: asset.bytes,
            dependencyCount: asset.dependencyCount,
            ...summarizeGLTF(gltf),
            gltf,
        });
    }
    return results;
}

function summarizeGLTF(gltf) {
    const materials = new Set();
    const textures = new Set();
    let nodes = 0;
    let meshes = 0;
    gltf.scene?.traverse?.(object => {
        nodes += 1;
        if (!object.isMesh) return;
        meshes += 1;
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of objectMaterials) {
            if (!material) continue;
            materials.add(material);
            for (const key of Object.keys(material)) {
                const value = material[key];
                if (value?.isTexture) textures.add(value);
            }
        }
    });
    return {
        sceneChildren: gltf.scene?.children?.length ?? 0,
        nodes,
        meshes,
        materials: materials.size,
        textures: textures.size,
        animations: gltf.animations?.length ?? 0,
    };
}

function runWorker(workerUrl, message) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerUrl, { type: "module" });
        const timeout = setTimeout(() => {
            worker.terminate();
            reject(new Error("Worker compat test timed out."));
        }, 30_000);
        worker.addEventListener("message", event => {
            clearTimeout(timeout);
            worker.terminate();
            resolve(event.data);
        }, { once: true });
        worker.addEventListener("error", event => {
            clearTimeout(timeout);
            worker.terminate();
            reject(new Error(event.message || "Worker compat test failed."));
        }, { once: true });
        worker.postMessage({ type: "run", ...message });
    });
}

function getRenderListSummary(renderer, scene, camera) {
    let renderList = null;
    if (renderer.isWebGPURenderer === true) {
        renderList = renderer._renderLists?.get(scene, camera);
    }
    else if (renderer.isWebGLRenderer === true) {
        renderList = renderer.renderLists?.get(scene, 0);
    }
    return {
        opaque: renderList?.opaque?.length ?? 0,
        transparent: renderList?.transparent?.length ?? 0,
        transmissive: (renderList?.transmissive || renderList?.transparentDoublePass || []).length,
    };
}
