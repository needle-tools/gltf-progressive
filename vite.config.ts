// vite.config.ts
import { resolve } from 'path';
import { defineConfig } from 'vite';
import { transform } from 'esbuild';

import fs from 'fs';
import path from 'path';

// https://vitejs.dev/guide/build.html#library-mode


// @ts-ignore sorry not sure how to fix this
export default defineConfig(() => {

    console.log("########################################### Begin Build")

    // const isLightMode = process.argv.includes('--light');
    const clearOutputDirectory = process.argv.includes('--noclear') === false;

    let postfix = "";

    return {
        plugins: [
            copyWorkerPlugin
        ],
        build: {
            emptyOutDir: clearOutputDirectory,
            lib: {
                entry: resolve(__dirname, 'src/index.ts'),
                name: 'needle-tools-gltf-progressive',
                formats: ['es', 'esm', 'cjs'],
                fileName: (format) => ({
                    es: `gltf-progressive${postfix}.js`,
                    esm: `gltf-progressive${postfix}.min.js`,
                    cjs: `gltf-progressive${postfix}.umd.cjs`,
                }[format]),
            },
            rollupOptions: {
                external: [
                    "three",
                    "three/examples/jsm/loaders/GLTFLoader.js",
                    "three/examples/jsm/libs/meshopt_decoder.module.js",
                    "three/examples/jsm/loaders/DRACOLoader.js",
                    "three/examples/jsm/loaders/KTX2Loader.js",
                ],
                output: {
                    minifyInternalExports: false,
                    plugins: [minifyEs()],
                    // prevent rollup from generating separate chunks
                    manualChunks: _ => "needle-tools-gltf-progressive"
                }
            }
        }
    }
});


// https://github.com/vitejs/vite/issues/6555
function minifyEs() {
    return {
        name: 'minifyEs',
        renderChunk: {
            order: 'post',
            async handler(code, chunk, outputOptions) {
                if (outputOptions.format === 'es' && chunk.fileName.endsWith('.min.js')) {
                    return await transform(code, { minify: true });
                }
                return code;
            },
        }
    };
}


/** @type {import("vite").Plugin} */
const copyWorkerPlugin = {
    name: 'copy-workers',
    // configResolved(config) {
    //     if(!config.rollupOptions) config.rollupOptions = {};
    //     if(!config.rollupOptions.external) config.rollupOptions.external = [];
    //     // config.rollupOptions.external.push((id) => id.includes('.worker.'));
    // },
    writeBundle(outputOptions, _bundle) {
        const outDir = outputOptions.dir || 'dist';
        const srcPath = path.resolve('src');
        const pattern = /\.worker\.(js|ts)$/;

        // Find all worker files
        function findWorkerFiles(dir: string, basePath: string = ''): Array<{ src: string, relative: string }> {
            const files: Array<{ src: string, relative: string }> = [];

            if (!fs.existsSync(dir)) return files;

            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativePath = path.join(basePath, entry.name);

                if (entry.isDirectory()) {
                    files.push(...findWorkerFiles(fullPath, relativePath));
                } else if (pattern.test(entry.name)) {
                    files.push({
                        src: fullPath,
                        relative: relativePath
                    });
                }
            }

            return files;
        }

        const workerFiles = findWorkerFiles(srcPath);

        for (const file of workerFiles) {
            // Copy to lib/worker/loader.worker.js (preserving directory structure)
            const destPath = path.join(outDir, 'lib', file.relative);
            const destDir = path.dirname(destPath);

            // Ensure destination directory exists
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }

            // Copy the file
            fs.copyFileSync(file.src, destPath);
            console.log(`✓ Copied worker: ${file.relative} → lib/${file.relative}`);
        }

        if (workerFiles.length > 0) {
            console.log(`📦 Copied ${workerFiles.length} worker file(s) to lib/`);
        }
    }
}