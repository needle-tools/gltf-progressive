import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";

function runModuleWorker(source) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(source, { eval: true, type: "module" });
        worker.once("message", resolve);
        worker.once("error", reject);
        worker.once("exit", code => {
            if (code !== 0) {
                reject(new Error(`Worker exited with code ${code}`));
            }
        });
    });
}

test("configured GLTFLoader can be used from a worker without window", async () => {
    const entryUrl = new URL("../../dist/lib/index.js", import.meta.url).href;
    const gltfUrl = `data:model/gltf+json;charset=utf-8,${encodeURIComponent(JSON.stringify({
        asset: { version: "2.0" },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ name: "WorkerSmoke" }],
    }))}`;
    const result = await runModuleWorker(`
        import { parentPort } from "node:worker_threads";
        import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

        globalThis.self = globalThis;
        globalThis.location = { href: "https://gltf-progressive.test/worker.js?debugprogressive&gltf-progressive-worker" };
        globalThis.ProgressEvent ??= class ProgressEvent extends Event {
            constructor(type, init = {}) {
                super(type);
                this.lengthComputable = init.lengthComputable ?? false;
                this.loaded = init.loaded ?? 0;
                this.total = init.total ?? 0;
            }
        };

        try {
            const { configureLoader } = await import(${JSON.stringify(entryUrl)});
            const loader = new GLTFLoader();
            configureLoader(loader, { progressive: true });

            loader.load(
                ${JSON.stringify(gltfUrl)},
                gltf => parentPort.postMessage({
                    ok: true,
                    sceneName: gltf.scene.children[0]?.name || "",
                }),
                undefined,
                error => parentPort.postMessage({
                    ok: false,
                    message: error?.message || String(error),
                    stack: error?.stack || "",
                }),
            );
        } catch (error) {
            parentPort.postMessage({
                ok: false,
                message: error?.message || String(error),
                stack: error?.stack || "",
            });
        }
    `);

    assert.equal(result.ok, true, result.stack || result.message);
    assert.equal(result.sceneName, "WorkerSmoke");
});
