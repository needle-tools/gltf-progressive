import { BufferGeometry, Object3D } from "three";


export function getParam(name: string): boolean | string {
    const url = new URL(window.location.href);
    const param = url.searchParams.get(name);
    if (param == null || param === "0" || param === "false") return false;
    if (param === "") return true;
    return param;
}

export function resolveUrl(source: string | undefined, uri: string): string {
    if (uri === undefined) {
        return uri;
    }
    if (uri.startsWith("./")) {
        return uri;
    }
    if (uri.startsWith("http")) {
        return uri;
    }
    if (source === undefined) {
        return uri;
    }
    const pathIndex = source.lastIndexOf("/");
    if (pathIndex >= 0) {
        // Take the source uri as the base path
        const basePath = source.substring(0, pathIndex + 1);
        // make sure we don't have double slashes
        while (basePath.endsWith("/") && uri.startsWith("/")) uri = uri.substring(1);
        // Append the relative uri
        const newUri = basePath + uri;
        // newUri = new URL(newUri, globalThis.location.href).href;
        return newUri;
    }
    return uri;
}

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
    }
}