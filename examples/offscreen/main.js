import { loadRuntime } from "../shared/runtime.js";
import {
    addLoadedScene,
    createOrbitControls,
    createExampleState,
    createSceneChangeButton,
    getInitialSceneIndex,
    getModelUrl,
    markError,
    markReady,
    markSceneLoaded,
    markSceneLoading,
    normalizeSceneIndex,
    resizeRenderer,
    setupScene,
    setupRoomEnvironment,
    trackLODChanges,
} from "../shared/example-utils.js";

const state = createExampleState("offscreen");
const params = new URLSearchParams(location.search);

try {
    if (!globalThis.OffscreenCanvas) throw new Error("OffscreenCanvas is not available in this browser.");

    const runtime = await loadRuntime();
    const THREE = runtime.THREE;
    const visibleCanvas = document.getElementById("view");
    const visibleContext = visibleCanvas.getContext("bitmaprenderer");
    if (!visibleContext) throw new Error("bitmaprenderer is not available in this browser.");

    let width = window.innerWidth;
    let height = window.innerHeight;
    let pixelRatio = window.devicePixelRatio || 1;
    const offscreenCanvas = new OffscreenCanvas(Math.max(1, width * pixelRatio), Math.max(1, height * pixelRatio));
    const renderer = new THREE.WebGLRenderer({ canvas: offscreenCanvas, antialias: true });
    const { scene, camera } = setupScene(THREE, width, height);
    setupRoomEnvironment(THREE, runtime.RoomEnvironment, renderer, scene);
    const controls = createOrbitControls(runtime.OrbitControls, camera, visibleCanvas);
    let root = null;
    let sceneIndex = getInitialSceneIndex(params);
    let loadToken = 0;

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        pixelRatio = window.devicePixelRatio || 1;
        visibleCanvas.width = Math.max(1, Math.floor(width * pixelRatio));
        visibleCanvas.height = Math.max(1, Math.floor(height * pixelRatio));
        resizeRenderer(renderer, camera, width, height, pixelRatio);
    }
    resize();

    const firstLoader = new runtime.GLTFLoader();
    const lodsManager = runtime.useNeedleProgressive(firstLoader, renderer);
    trackLODChanges(lodsManager, state);

    async function loadScene(nextIndex) {
        const token = ++loadToken;
        sceneIndex = normalizeSceneIndex(nextIndex);
        const url = getModelUrl(params, sceneIndex);
        markSceneLoading(state, sceneIndex, url);

        const loader = token === 1 ? firstLoader : new runtime.GLTFLoader();
        if (token !== 1) runtime.useNeedleProgressive(loader, renderer);

        const nextRoot = await new Promise((resolve, reject) => {
            loader.load(url, gltf => resolve(addLoadedScene(THREE, scene, gltf, { camera, controls })), undefined, reject);
        });

        if (token !== loadToken) {
            nextRoot.removeFromParent();
            return;
        }

        root?.removeFromParent();
        root = nextRoot;
        markSceneLoaded(state, runtime, root);
        markReady(state, "offscreen-webgl");
    }

    window.addEventListener("resize", resize);
    createSceneChangeButton(() => loadScene(sceneIndex + 1).catch(error => markError(state, error)));

    function render() {
        state.frames += 1;
        controls.update();
        renderer.render(scene, camera);
        visibleContext.transferFromImageBitmap(offscreenCanvas.transferToImageBitmap());
        requestAnimationFrame(render);
    }

    await loadScene(sceneIndex);
    render();
}
catch (error) {
    markError(state, error);
}
