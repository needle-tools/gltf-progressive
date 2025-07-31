import { Material } from "three";
import { getParam } from "./utils.internal.js";

export const debug = getParam("debugprogressive");

let debug_RenderWireframe: boolean | undefined;
export let debug_OverrideLodLevel: number = -1; // -1 is automatic

if (debug) {
    let maxLevel = 6;
    function debugToggleProgressive() {
        debug_OverrideLodLevel += 1;
        if (debug_OverrideLodLevel >= maxLevel) {
            debug_OverrideLodLevel = -1;
        }
        console.log(`Toggle LOD level [${debug_OverrideLodLevel}]`);
    }
    window.addEventListener("keyup", evt => {
        if (evt.key === "p") debugToggleProgressive();
        if (evt.key === "w") {
            debug_RenderWireframe = !debug_RenderWireframe;
            console.log(`Toggle wireframe [${debug_RenderWireframe}]`);
        }
        const pressedNumber = parseInt(evt.key);
        if (!isNaN(pressedNumber) && pressedNumber >= 0) {
            debug_OverrideLodLevel = pressedNumber;
            console.log(`Set LOD level to [${debug_OverrideLodLevel}]`);
        }
    });
}

export function applyDebugSettings(material: Material | Array<Material>) {

    if (!debug) return;

    if (Array.isArray(material)) {
        for (const mat of material) {
            applyDebugSettings(mat);
        }
    } else if (material) {
        if ("wireframe" in material) {
            material.wireframe = debug_RenderWireframe === true;
        }
    }
}