type NEEDLE_progressive_model_LOD = {
    /** path */
    path: string,
    hash?: string
}

/** Base NEEDLE_progressive extension format. */
export type NEEDLE_progressive_ext = {
    /** id of the asset the lods belong to */
    guid: string,
    /** available lod level */
    lods: Array<NEEDLE_progressive_model_LOD>
}

/** Texture LOD extension */
export type NEEDLE_ext_progressive_texture = NEEDLE_progressive_ext & {
    lods: Array<NEEDLE_progressive_model_LOD & {
        width: number,
        height: number,
    }>,
}

/** Mesh LOD extension */
export type NEEDLE_ext_progressive_mesh = NEEDLE_progressive_ext & {

    lods: Array<NEEDLE_progressive_model_LOD & {
        indexCount: number;
        vertexCount: number;

        // The undefined flag can be removed after a few versions
        /** Density per primitive */
        densities: number[] | undefined,

        /** @deprecated Use densities with the primitive index */
        density: number,
    }>,
    
    /** @deprecated Removed */
    density: number,
}