import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheRoot = path.join(repoRoot, ".cache", "example-smoke");
const runtimeBundlePath = path.join(cacheRoot, "runtime.js");

export const advancedExamples = [
    { name: "webgpu", path: "/examples/webgpu/index.html", renderer: "webgpu" },
    { name: "offscreen", path: "/examples/offscreen/index.html", renderer: "offscreen-webgl" },
    { name: "worker-rendering", path: "/examples/worker-rendering/index.html", renderer: "worker-webgl" },
];

export async function buildExampleRuntimeBundle() {
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

export function startExampleServer(options = {}) {
    const host = options.host || "127.0.0.1";
    const port = Number(options.port || 0);
    return new Promise(resolve => {
        const instance = createServer(async (request, response) => {
            try {
                const requestUrl = new URL(request.url || "/", `http://${host}`);
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
        instance.listen(port, host, () => {
            const address = instance.address();
            resolve({
                instance,
                host,
                port: typeof address === "object" ? address.port : port,
            });
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
    if (filePath.endsWith(".css")) return "text/css";
    if (filePath.endsWith(".json") || filePath.endsWith(".gltf")) return "application/json";
    if (filePath.endsWith(".wasm")) return "application/wasm";
    return "application/octet-stream";
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const portArg = process.argv.find(arg => arg.startsWith("--port="));
    const port = portArg ? Number(portArg.slice("--port=".length)) : Number(process.env.PORT || 0);
    await buildExampleRuntimeBundle();
    const server = await startExampleServer({ port });
    const baseUrl = `http://${server.host}:${server.port}`;

    console.log(`Example server: ${baseUrl}`);
    console.log("");
    console.log("Local checkout runtime:");
    for (const example of advancedExamples) {
        console.log(`- ${example.name}: ${baseUrl}${example.path}?runtime=/__example-runtime.js`);
        console.log(`  minimal: ${baseUrl}${example.path}?runtime=/__example-runtime.js&asset=minimal`);
    }
    console.log("");
    console.log("CDN/static examples:");
    console.log(`- three.js: ${baseUrl}/examples/threejs/index.html`);
    console.log(`- model-viewer: ${baseUrl}/examples/modelviewer.html`);
    console.log(`- model-viewer multiple: ${baseUrl}/examples/modelviewer-multiple.html`);
    console.log("");
    console.log("React Three Fiber remains a Vite app:");
    console.log("- cd examples/react-three-fiber && npm run start");
}
