import path from "node:path";
import { defineConfig } from "vitest/config";
import {
    getDefaultCacheRoot,
} from "@needle-tools/three-test-matrix";
import webgpuBrowserDefaults from "@needle-tools/three-test-matrix/vitest";
import { rawFsServePlugin } from "@needle-tools/three-test-matrix/vite";

const sharedCacheRoot = getDefaultCacheRoot({ cwd: __dirname });

export default defineConfig(() => {
    return {
        plugins: [rawFsServePlugin({
            cacheRoots: [
                path.resolve(__dirname, ".cache"),
                sharedCacheRoot,
            ],
            headers: {
                "Cross-Origin-Embedder-Policy": "require-corp",
                "Cross-Origin-Opener-Policy": "same-origin",
            },
        })],
        define: {
            __GLTF_PROGRESSIVE_COMPAT_PAGES_ROOT__: JSON.stringify(path.resolve(__dirname, ".cache/gltf-progressive-three-compat-pages")),
        },
        server: {
            fs: {
                allow: [
                    path.resolve(__dirname),
                    path.parse(path.resolve(__dirname)).root,
                ],
            },
        },
        test: {
            include: ["tests/compat/**/*.browser.test.ts"],
            testTimeout: 120_000,
            hookTimeout: 120_000,
            browser: {
                enabled: true,
                ...webgpuBrowserDefaults,
                instances: [{ browser: "chromium" }],
                viewport: {
                    width: 1280,
                    height: 720,
                },
            },
        },
    };
});
