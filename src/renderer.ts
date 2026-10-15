import type { WebGLRenderer } from 'three';
import type WebGPURenderer from 'three/src/renderers/webgpu/WebGPURenderer.js';

/** Renderers supported by Progressive loading and LOD updates. */
export type ProgressiveRenderer = WebGLRenderer | WebGPURenderer;