import { BufferGeometry, Intersection, Mesh, Object3D, Raycaster } from "three";

export const isSSR = typeof window === "undefined" && typeof document === "undefined";

const $raycastmesh = Symbol("needle:raycast-mesh");

/**
 * The raycast mesh is a low poly version of the mesh used for raycasting. It is set when a mesh that has LOD level with more vertices is discovered for the first time
 * @param obj the object to get the raycast mesh from
 * @returns the raycast mesh or null if not set
 */
export function getRaycastMesh(obj: Object3D) {
    if (obj?.[$raycastmesh] instanceof BufferGeometry) {
        return obj[$raycastmesh];
    }
    return null;
}
/**
 * Set the raycast mesh for an object.   
 * The raycast mesh is a low poly version of the mesh used for raycasting. It is set when a mesh that has LOD level with more vertices is discovered for the first time  
 * @param obj the object to set the raycast mesh for
 * @param geom the raycast mesh
 */
export function registerRaycastMesh(obj: Object3D, geom: BufferGeometry) {
    if (obj.type === "Mesh" || obj.type === "SkinnedMesh") {
        const existing = getRaycastMesh(obj);
        if (!existing) {
            const clone = shallowCloneGeometry(geom);
            // remove LODs userdata to not update the geometry if the raycast mesh is rendered in the scene
            clone.userData = { isRaycastMesh: true };
            obj[$raycastmesh] = clone;
        }
    }
}

/**
 * Call this method to enable raycasting with the lowpoly raycast meshes (if available) for all meshes in the scene.  
 * This is useful for performance optimization when the scene contains high poly meshes that are not visible to the camera.  
 * @example
 * ```ts
 * // call to enable raycasting with low poly raycast meshes
 * useRaycastMeshes();
 * 
 * // then use the raycaster as usual
 * const raycaster = new Raycaster();
 * raycaster.setFromCamera(mouse, camera);
 * const intersects = raycaster.intersectObjects(scene.children, true);
 * ```
 */
export function useRaycastMeshes(enabled: boolean = true) {

    if (enabled) {
        // if the method is already patched we don't need to do it again
        if (_originalRaycastMethod) return;
        const originalMethod = _originalRaycastMethod = Mesh.prototype.raycast;
        Mesh.prototype.raycast = function (raycaster, intersects) {
            const self = this as Mesh;
            const raycastMesh = getRaycastMesh(self);
            let prevGeomtry;
            if (raycastMesh && self.isMesh) {
                prevGeomtry = self.geometry;
                self.geometry = raycastMesh;
            }
            originalMethod.call(this, raycaster, intersects);
            if (prevGeomtry) {
                self.geometry = prevGeomtry;
            }
        };
    }
    else {
        if (!_originalRaycastMethod) return;
        Mesh.prototype.raycast = _originalRaycastMethod;
        _originalRaycastMethod = null;
    }

}
let _originalRaycastMethod: ((raycaster: Raycaster, intersects: Intersection[]) => void) | null = null;



/** Creates a clone without copying the data */
function shallowCloneGeometry(geom: BufferGeometry) {
    const clone = new BufferGeometry();
    for (const key in geom.attributes) {
        clone.setAttribute(key, geom.getAttribute(key));
    }
    clone.setIndex(geom.getIndex());
    return clone;
}






