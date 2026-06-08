import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheRoot = path.join(repoRoot, ".cache", "example-smoke");
const runtimeBundlePath = path.join(cacheRoot, "runtime.js");
const reactThreeFiberRoot = path.join(repoRoot, "examples", "react-three-fiber");
const reactThreeFiberDist = path.join(reactThreeFiberRoot, "dist");

export const reactThreeFiberExample = {
    name: "react-three-fiber",
    path: "/examples/react-three-fiber/",
};

const examplesIndexHtml = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>glTF Progressive Examples</title>
</head>
<body>
    <main>
        <h1>glTF Progressive Examples</h1>
        <ul>
            <li><a href="/examples/threejs/index.html">three.js</a></li>
            <li><a href="/examples/webgpu/index.html?runtime=/__example-runtime.js">WebGPU</a></li>
            <li><a href="/examples/offscreen/index.html?runtime=/__example-runtime.js">OffscreenCanvas</a></li>
            <li><a href="/examples/worker-rendering/index.html?runtime=/__example-runtime.js">Worker rendering</a></li>
            <li><a href="/examples/react-three-fiber/">React Three Fiber</a></li>
            <li><a href="/examples/modelviewer.html">model-viewer</a></li>
            <li><a href="/examples/modelviewer-multiple.html">model-viewer multiple</a></li>
        </ul>
    </main>
</body>
</html>`;

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

export async function buildReactThreeFiberExample() {
    await run("npm", ["run", "build"], { cwd: reactThreeFiberRoot });
}

export function startExampleServer(options = {}) {
    const host = options.host || "127.0.0.1";
    const port = Number(options.port || 0);
    return new Promise(resolve => {
        const instance = createServer(async (request, response) => {
            try {
                const requestUrl = new URL(request.url || "/", `http://${host}`);
                const resolved = resolveRequest(requestUrl.pathname);
                response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
                response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
                if (resolved.body !== undefined) {
                    response.setHeader("Content-Type", resolved.contentType);
                    response.end(resolved.body);
                    return;
                }

                const filePath = resolved.filePath;
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

function resolveRequest(pathname) {
    if (pathname === "/__example-runtime.js") return { filePath: runtimeBundlePath };
    if (pathname === "/" || pathname === "/examples" || pathname === "/examples/") {
        return { body: examplesIndexHtml, contentType: "text/html" };
    }
    if (pathname === reactThreeFiberExample.path) return { filePath: path.join(reactThreeFiberDist, "index.html") };
    if (pathname.startsWith(reactThreeFiberExample.path)) {
        const relativePath = pathname.slice(reactThreeFiberExample.path.length);
        const normalizedPath = normalizeRelativeRequestPath(relativePath);
        return { filePath: path.join(reactThreeFiberDist, normalizedPath || "index.html") };
    }
    const normalizedPath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, "");
    return { filePath: path.join(repoRoot, normalizedPath === "/" ? "examples/webgpu/index.html" : normalizedPath) };
}

function normalizeRelativeRequestPath(pathname) {
    return path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, "");
}

function getMimeType(filePath) {
    if (filePath.endsWith(".html")) return "text/html";
    if (filePath.endsWith(".js")) return "text/javascript";
    if (filePath.endsWith(".css")) return "text/css";
    if (filePath.endsWith(".json") || filePath.endsWith(".gltf")) return "application/json";
    if (filePath.endsWith(".wasm")) return "application/wasm";
    return "application/octet-stream";
}

function run(command, args, options) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            ...options,
            stdio: "inherit",
            shell: process.platform === "win32",
        });
        child.on("error", reject);
        child.on("close", code => {
            if (code === 0) resolve();
            else reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
        });
    });
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const portArg = process.argv.find(arg => arg.startsWith("--port="));
    const port = portArg ? Number(portArg.slice("--port=".length)) : Number(process.env.PORT || 0);
    await buildExampleRuntimeBundle();
    await buildReactThreeFiberExample();
    const server = await startExampleServer({ port });
    const baseUrl = `http://${server.host}:${server.port}`;

    console.log(`Examples: ${baseUrl}/examples/`);
}
