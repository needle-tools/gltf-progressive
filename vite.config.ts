// vite.config.ts
import { resolve } from 'path';
import { defineConfig } from 'vite';
import { transform } from 'esbuild';

// https://vitejs.dev/guide/build.html#library-mode


// @ts-ignore sorry not sure how to fix this
export default defineConfig(() => {

    console.log("########################################### Begin Build")

    // const isLightMode = process.argv.includes('--light');
    const clearOutputDirectory = process.argv.includes('--noclear') === false;

    let postfix = "";

    return {
        plugins: [
            // ...getPluginsForLibrary({
            //     light: isLightMode
            // })
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
                external: ["three",
                    "three/examples/jsm/loaders/GLTFLoader.js",
                    "three/examples/jsm/libs/meshopt_decoder.module.js",
                    "three/examples/jsm/loaders/DRACOLoader.js",
                    "three/examples/jsm/loaders/KTX2Loader.js",
                ],
                output: {
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
