import { BufferGeometry, Object3D } from "three";
import { getParam } from "./utils.internal.js";

const debug = getParam("debugprogressive");

/**
 * The raycast mesh is a low poly version of the mesh used for raycasting. It is set when a mesh that has LOD level with more vertices is discovered for the first time
 * @param obj the object to get the raycast mesh from
 * @returns the raycast mesh or null if not set
 */
export function getRaycastMesh(obj: Object3D) {
    if (obj.userData?.["needle:raycast-mesh"] instanceof BufferGeometry) {
        return obj.userData["needle:raycast-mesh"];
    }
    return null;
}
/**
 * Set the raycast mesh for an object. The raycast mesh is a low poly version of the mesh used for raycasting. It is set when a mesh that has LOD level with more vertices is discovered for the first time  
 * @param obj the object to set the raycast mesh for
 * @param geom the raycast mesh
 */
export function setRaycastMesh(obj: Object3D, geom: BufferGeometry) {
    if (obj.type === "Mesh" || obj.type === "SkinnedMesh") {
        if (!obj.userData) obj.userData = {};
        obj.userData["needle:raycast-mesh"] = geom;
        if (debug && !geom.getAttribute("position")) console.warn("setRaycastMesh: missing position", geom);
    }
}







