import { loadRuntime } from "../shared/runtime.js";
import {
    addLoadedScene,
    createOrbitControls,
    createExampleState,
    getModelUrl,
    markError,
    markReady,
    resizeRenderer,
    setupScene,
    setupRoomEnvironment,
} from "../shared/example-utils.js";

const state = createExampleState("offscreen");

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

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        pixelRatio = window.devicePixelRatio || 1;
        visibleCanvas.width = Math.max(1, Math.floor(width * pixelRatio));
        visibleCanvas.height = Math.max(1, Math.floor(height * pixelRatio));
        resizeRenderer(renderer, camera, width, height, pixelRatio);
    }
    resize();

    const loader = new runtime.GLTFLoader();
    runtime.useNeedleProgressive(loader, renderer);
    const root = await new Promise((resolve, reject) => {
        loader.load(getModelUrl(), gltf => resolve(addLoadedScene(THREE, scene, gltf, { camera, controls })), undefined, reject);
    });

    window.addEventListener("resize", resize);

    function render() {
        state.frames += 1;
        root.rotation.y += 0.01;
        controls.update();
        renderer.render(scene, camera);
        visibleContext.transferFromImageBitmap(offscreenCanvas.transferToImageBitmap());
        requestAnimationFrame(render);
    }

    markReady(state, "offscreen-webgl");
    render();
}
catch (error) {
    markError(state, error);
}
