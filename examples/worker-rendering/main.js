import { loadRuntime } from "../shared/runtime.js";
import {
    applyCameraState,
    createExampleState,
    createOrbitControls,
    markError,
    markReady,
    serializeCamera,
    updateStatus,
} from "../shared/example-utils.js";

const state = createExampleState("worker-rendering");

try {
    if (!globalThis.OffscreenCanvas) throw new Error("OffscreenCanvas is not available in this browser.");

    const runtime = await loadRuntime();
    const THREE = runtime.THREE;
    const canvas = document.getElementById("view");
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 200);
    camera.position.set(0.5, 1.3, 2);
    const controls = createOrbitControls(runtime.OrbitControls, camera, canvas);
    const offscreenCanvas = canvas.transferControlToOffscreen();
    const worker = new Worker("./worker.js", { type: "module" });

    worker.addEventListener("message", event => {
        const message = event.data || {};
        if (message.type === "ready") {
            if (message.camera) applyCameraState(camera, message.camera);
            if (message.fit?.target) {
                controls.target.fromArray(message.fit.target);
                controls.minDistance = message.fit.minDistance;
                controls.maxDistance = message.fit.maxDistance;
                controls.update();
            }
            sendCamera();
            markReady(state, message.renderer || "worker-webgl");
        }
        else if (message.type === "frame") {
            state.frames = message.frames;
        }
        else if (message.type === "error") {
            markError(state, message.message || "Worker rendering failed.");
        }
    });
    worker.addEventListener("error", event => {
        markError(state, event.message || event.error || event);
    });

    function postResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        worker.postMessage({
            type: "resize",
            width: window.innerWidth,
            height: window.innerHeight,
            pixelRatio: window.devicePixelRatio || 1,
            camera: serializeCamera(camera),
        });
    }

    function sendCamera() {
        worker.postMessage({
            type: "camera",
            camera: serializeCamera(camera),
        });
    }

    controls.addEventListener("change", sendCamera);

    function updateControls() {
        controls.update();
        requestAnimationFrame(updateControls);
    }
    updateControls();

    worker.postMessage({
        type: "init",
        canvas: offscreenCanvas,
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: window.devicePixelRatio || 1,
        camera: serializeCamera(camera),
        search: location.search,
    }, [offscreenCanvas]);
    window.addEventListener("resize", postResize);
    updateStatus("worker-webgl");
}
catch (error) {
    markError(state, error);
}
