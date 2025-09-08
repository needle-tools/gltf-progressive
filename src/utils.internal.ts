
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



export type SlotReturnValue<T = any> = { use?: ((promise: Promise<T>) => void) };


/**
 * A promise queue that limits the number of concurrent promises.
 * Use the `slot` method to request a slot for a promise with a specific key. The returned promise resolves to an object with a `use` method that can be called to add the promise to the queue.
 */
export class PromiseQueue<T = any> {

    private readonly _running: Map<string, Promise<T>> = new Map();
    private readonly _queue: Array<{ key: string, resolve: (value: SlotReturnValue<T>) => void }> = [];
    public debug: boolean = false;

    constructor(public readonly maxConcurrent: number = 100, opts: { debug?: boolean } = {}) {
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