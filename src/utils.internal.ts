
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


let _ismobile: boolean | undefined;
/** @returns `true` if it's a phone or tablet */
export function isMobileDevice() {
    if (_ismobile !== undefined) return _ismobile;
    _ismobile = /iPhone|iPad|iPod|Android|IEMobile/i.test(navigator.userAgent);
    if (getParam("debugprogressive")) console.log("[glTF Progressive]: isMobileDevice", _ismobile);
    return _ismobile;
}

export function isDevelopmentServer() {
    if (typeof window === "undefined") return false;
    const url = new URL(window.location.href);
    const isLocalhostOrIpAddress = url.hostname === "localhost" || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(url.hostname);
    const isDevelopment = url.hostname === "127.0.0.1" || isLocalhostOrIpAddress;
    return isDevelopment;
}



type SlotReturnValue = { use?: ((promise: Promise<any>) => void) };

export class PromiseQueue {

    private readonly _running: Map<string, Promise<any>> = new Map();
    private readonly _queue: Array<{ key: string, resolve: (value: SlotReturnValue) => void }> = [];
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
    slot(key: string): Promise<SlotReturnValue> {
        if (this.debug) console.debug(`[PromiseQueue]: Requesting slot for key ${key}, running: ${this._running.size}, waiting: ${this._queue.length}`);
        return new Promise<SlotReturnValue>((resolve) => {
            this._queue.push({ key, resolve });
        });
    }

    private add(key: string, promise: Promise<any>) {
        if (this._running.has(key)) return;
        this._running.set(key, promise);
        promise.finally(() => {
            this._running.delete(key);
            if(this.debug) console.debug(`[PromiseQueue]: Promise for key ${key} finished, running: ${this._running.size}, waiting: ${this._queue.length}`);
        });

        if (this.debug) console.debug(`[PromiseQueue]: Adding promise for key ${key}, running: ${this._running.size}, waiting: ${this._queue.length}`);
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