import * as path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(async (command) => {


    return {
        base: "./",
        assetsInclude: ['*'],

        plugins: [
            react(),
            basicSsl(),
        ],

        server: {
            https: true,
            proxy: { // workaround: specifying a proxy skips HTTP2 which is currently problematic in Vite since it causes session memory timeouts.
                'https://localhost:3000': 'https://localhost:3000'
            },
            watch: {
                awaitWriteFinish: {
                    stabilityThreshold: 500,
                    pollInterval: 1000
                },
            },
            strictPort: true,
            port: 3001
        },
        build: {
            outDir: "./dist",
            emptyOutDir: true,
            keepNames: true,
        },
        resolve: {
            alias: {
                'react': () => path.resolve(__dirname, 'node_modules/react'),
                '@react-three/fiber': () => path.resolve(__dirname, 'node_modules/@react-three/fiber'),
            }
        }
    }
});