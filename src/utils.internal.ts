import { RedFormat, RedIntegerFormat, RGFormat, RGIntegerFormat, RGBFormat, RGBAFormat, RGBAIntegerFormat, Texture } from "three";

/** Represents the possible shapes of texture image/source data in three.js.
 * Source.data is typed as `{}` in r183 but at runtime can be ImageBitmap, HTMLImageElement, etc. */
export type TextureImageData = {
    width?: number;
    height?: number;
    depth?: number;
    data?: ArrayBufferView | null;
};

/** Check if a value has image-like dimensions (width/height) */
export function hasImageDimensions(value: unknown): value is { width: number; height: number } {
    return value != null && typeof (value as any).width === 'number' && typeof (value as any).height === 'number';
}

/** Check if a value has pixel data (e.g. typed array from a DataTexture) */
export function hasPixelData(value: unknown): value is { data: ArrayBufferView } {
    return value != null && (value as any).data != null;
}

/** Get the source data of a texture, typed for dimension/data access */
export function getSourceData(tex: Texture): TextureImageData | null {
    const data = tex.source?.data;
    return data != null && typeof data === 'object' ? data as TextureImageData : null;
}

/** Get the image of a texture, typed for dimension/data access.
 * In r183, Texture.image is typed as `{}` but at runtime is an ImageBitmap, HTMLImageElement, etc. */
export function getTextureImage(tex: Texture): TextureImageData | null {
    const img = tex.image;
    return img != null && typeof img === 'object' ? img as TextureImageData : null;
}

/** Get width/height of a texture from image or source data */
export function getTextureDimensions(tex: Texture): { width: number; height: number } {
    const img = getTextureImage(tex);
    const src = getSourceData(tex);
    return {
        width: img?.width || src?.width || 0,
        height: img?.height || src?.height || 0,
    };
}

const debug = getParam("debugprogressive");

export function isDebugMode() {
    return debug;
}

export function getParam(name: string): boolean | string {
    if (typeof window === "undefined") return false;
    const url = new URL(window.location.href);
    const param = url.searchParams.get(name);
    if (param == null || param === "0" || param === "false") return false;
    if (param === "") return true;
    return param;
}

export function resolveUrl(source: string | undefined, uri: string): string {
    if (uri === undefined || source === undefined) {
        return uri;
    }
    if (uri.startsWith("./") ||
        uri.startsWith("http") ||
        uri.startsWith("data:") ||
        uri.startsWith("blob:")
    ) {
        return uri;
    }
    // TODO: why not just use new URL(uri, source).href ?
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


/** Check if the current device is a mobile device. 
 * @returns `true` if it's a phone or tablet 
 */
export function isMobileDevice() {
    if (_ismobile !== undefined) return _ismobile;
    _ismobile = /iPhone|iPad|iPod|Android|IEMobile/i.test(navigator.userAgent);
    if (getParam("debugprogressive")) console.log("[glTF Progressive]: isMobileDevice", _ismobile);
    return _ismobile;
}
let _ismobile: boolean | undefined;

/**
 * Check if we are running in a development server (localhost or ip address).
 * @returns `true` if we are running in a development server (localhost or ip address).
 */
export function isDevelopmentServer() {
    if (typeof window === "undefined") return false;
    const url = new URL(window.location.href);
    const isLocalhostOrIpAddress = url.hostname === "localhost" || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(url.hostname);
    const isDevelopment = url.hostname === "127.0.0.1" || isLocalhostOrIpAddress;
    return isDevelopment;
}




// #region Promise Queue

export type SlotReturnValue<T = any> = { use?: ((promise: Promise<T>) => void) };


/**
 * A promise queue that limits the number of concurrent promises.
 * Use the `slot` method to request a slot for a promise with a specific key. The returned promise resolves to an object with a `use` method that can be called to add the promise to the queue.
 */
export class PromiseQueue<T = any> {

    private readonly _running: Map<string, Promise<T>> = new Map();
    private readonly _queue: Array<{ key: string, resolve: (value: SlotReturnValue<T>) => void }> = [];
    public debug: boolean = false;

    constructor(public maxConcurrent: number, opts: { debug?: boolean } = {}) {
        this.debug = opts.debug ?? false;
        window.requestAnimationFrame(this.tick)
    }

    private tick = () => {
        this.internalUpdate();
        setTimeout(this.tick, 10);
    }

    /**
     * Request a slot for a promise with a specific key. This function returns a promise with a `use` method that can be called to add the promise to the queue.
     */
    slot(key: string): Promise<SlotReturnValue<T>> {
        if (this.debug) console.debug(`[PromiseQueue]: Requesting slot for key ${key}, running: ${this._running.size}, waiting: ${this._queue.length}`);
        return new Promise<SlotReturnValue<T>>((resolve) => {
            this._queue.push({ key, resolve });
        });
    }

    private add(key: string, promise: Promise<T>) {
        if (this._running.has(key)) return;
        this._running.set(key, promise);
        promise.finally(() => {
            this._running.delete(key);
            if (this.debug) console.debug(`[PromiseQueue]: Promise finished now running: ${this._running.size}, waiting: ${this._queue.length}. (finished ${key})`);
        });

        if (this.debug) console.debug(`[PromiseQueue]: Added new promise, now running: ${this._running.size}, waiting: ${this._queue.length}. (added ${key})`);
    }

    private internalUpdate() {
        // Run for as many free slots as we can
        const diff = this.maxConcurrent - this._running.size;
        for (let i = 0; i < diff && this._queue.length > 0; i++) {
            if (this.debug) console.debug(`[PromiseQueue]: Running ${this._running.size} promises, waiting for ${this._queue.length} more.`);
            const { key, resolve } = this._queue.shift()!;
            resolve({
                use: (promise) => this.add(key, promise)
            })
        }
    }

}



// #region Texture Memory

export function determineTextureMemoryInBytes(texture: Texture): number {
    const img = texture.image as TextureImageData | null;
    const width = img?.width ?? 0;
    const height = img?.height ?? 0;
    const depth = img?.depth ?? 1;
    const mipLevels = Math.floor(Math.log2(Math.max(width, height, depth))) + 1;
    const bytesPerPixel = getBytesPerPixel(texture);
    const totalBytes = (width * height * depth * bytesPerPixel * (1 - Math.pow(0.25, mipLevels))) / (1 - 0.25);
    return totalBytes;
}

function getBytesPerPixel(texture: Texture): number {
    // Determine channel count from format
    let channels = 4; // Default RGBA
    const format = texture.format as number;
    if (format === RedFormat) channels = 1;
    else if (format === RedIntegerFormat) channels = 1;
    else if (format === RGFormat) channels = 2;
    else if (format === RGIntegerFormat) channels = 2;
    else if (format === RGBFormat) channels = 3;
    else if (format === 1029) channels = 3; // RGBIntegerFormat (not exported in r183)
    else if (format === RGBAFormat) channels = 4;
    else if (format === RGBAIntegerFormat) channels = 4;

    // Determine bytes per channel from type
    let bytesPerChannel = 1; // UnsignedByteType default
    const type = texture.type;
    if (type === 1009) bytesPerChannel = 1; // UnsignedByteType
    else if (type === 1010) bytesPerChannel = 1; // ByteType
    else if (type === 1011) bytesPerChannel = 2; // ShortType
    else if (type === 1012) bytesPerChannel = 2; // UnsignedShortType
    else if (type === 1013) bytesPerChannel = 4; // IntType
    else if (type === 1014) bytesPerChannel = 4; // UnsignedIntType
    else if (type === 1015) bytesPerChannel = 4; // FloatType
    else if (type === 1016) bytesPerChannel = 2; // HalfFloatType

    const bytesPerPixel = channels * bytesPerChannel;
    return bytesPerPixel;
}


// #region GPU

let rendererInfo: undefined | null | {
    vendor?: string,
    renderer?: string,
    estimatedMemory: number
};

/**
 * Detect the GPU memory of the current device. This is a very rough estimate based on the renderer information, and may not be accurate. It returns the estimated memory in MB, or `undefined` if it cannot be detected.
 */
export function detectGPUMemory(): number | undefined {
    if (rendererInfo !== undefined) {
        return rendererInfo?.estimatedMemory;
    }

    const canvas = document.createElement('canvas');
    const powerPreference = "high-performance";
    const gl = canvas.getContext('webgl', { powerPreference }) || canvas.getContext('experimental-webgl', { powerPreference });
    if (!gl) {
        return undefined;
    }
    if ("getExtension" in gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            // Estimate memory based on renderer information (this is a very rough estimate)
            let estimatedMemory = 512;
            if (/NVIDIA/i.test(renderer)) {
                estimatedMemory = 2048;
            } else if (/AMD/i.test(renderer)) {
                estimatedMemory = 1024;
            } else if (/Intel/i.test(renderer)) {
                estimatedMemory = 512;
            }
            rendererInfo = { vendor, renderer, estimatedMemory };
            return estimatedMemory;
        }
    }
    else {
        rendererInfo = null;
    }

    return undefined;
}