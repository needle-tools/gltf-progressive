const DEFAULT_THREE_VERSION = "0.184.0";
const DEFAULT_PROGRESSIVE_VERSION = "3.6.0-canary.5401de9";

export async function loadRuntime(options = {}) {
    const params = options.params || new URLSearchParams(options.search || globalThis.location?.search || "");
    const runtimeUrl = params.get("runtime");
    if (runtimeUrl) {
        return await import(new URL(runtimeUrl, globalThis.location?.href).href);
    }

    const threeVersion = params.get("three") || DEFAULT_THREE_VERSION;
    const threeBase = `https://esm.sh/three@${threeVersion}`;
    const progressiveUrl = params.get("progressive") || `https://esm.sh/@needle-tools/gltf-progressive@${DEFAULT_PROGRESSIVE_VERSION}?deps=three@${threeVersion}`;

    const [THREE, THREE_WEBGPU, gltfLoaderModule, orbitControlsModule, roomEnvironmentModule, progressiveModule] = await Promise.all([
        import(threeBase),
        import(`${threeBase}/webgpu`),
        import(`${threeBase}/examples/jsm/loaders/GLTFLoader.js`),
        import(`${threeBase}/examples/jsm/controls/OrbitControls.js`),
        import(`${threeBase}/examples/jsm/environments/RoomEnvironment.js`),
        import(progressiveUrl),
    ]);

    return {
        THREE,
        THREE_WEBGPU,
        GLTFLoader: gltfLoaderModule.GLTFLoader,
        OrbitControls: orbitControlsModule.OrbitControls,
        RoomEnvironment: roomEnvironmentModule.RoomEnvironment,
        useNeedleProgressive: progressiveModule.useNeedleProgressive,
        LODsManager: progressiveModule.LODsManager,
        NEEDLE_progressive: progressiveModule.NEEDLE_progressive,
    };
}
