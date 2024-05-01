import { WebGLRenderer, Scene, Camera, Object3D, Mesh } from 'three';
import { NEEDLE_progressive_mesh_model } from '../extension.js';

/**
 * This interface is used to define a plugin for the progressive extension. It can be registered using the `registerPlugin` function.
 */
export interface NEEDLE_progressive_plugin {
    /** Called before the LOD level will be requested/updated for a object */
    onBeforeUpdateLOD?(renderer: WebGLRenderer, scene: Scene, camera: Camera, object: Mesh): void;

    /** Called after the LOD level has been requested */
    onAfterUpdatedLOD?(renderer: WebGLRenderer, scene: Scene, camera: Camera, object: Mesh, level: number): void;

    /** Called when a new mesh is registered */
    onRegisteredNewMesh?(mesh: Mesh, ext: NEEDLE_progressive_mesh_model): void;

    /** Called before the LOD mesh is fetched */
    onBeforeGetLODMesh?(mesh: Mesh, level: number): void;
}

/** 
 * List of registered plugins for the progressive extension. Please use the `registerPlugin` function to add a plugin.
 * @internal
 */
export const plugins = new Array<NEEDLE_progressive_plugin>();

/**
 * Register a plugin for the progressive extension. The plugin callbacks will be called at different stages of the progressive extension.
 */
export function registerPlugin(plugin: NEEDLE_progressive_plugin) {
    plugins.push(plugin);
}
