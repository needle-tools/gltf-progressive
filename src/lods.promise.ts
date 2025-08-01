import { debug } from "./lods.debug";

type PromiseType = "texture" | "mesh";

export type PromiseGroupOptions = {
    /** Name for debugging purposes */
    name?: string;
    /** Define many frames new LOD promises will be captured and awaited. The group will resolve after all promises captured during this time have resolved (or when the abort signal is triggered).
     * @default 2 frames, which means the group will capture promises for 2 frames before resolving.
    */
    frames?: number;
    /** An optional signal to abort the promise */
    signal?: AbortSignal;

    /**
     * If set to true, the group will only await one promise per object.
     * @default 1
     */
    maxPromisesPerObject?: number;
}

type PromiseGroupResolveResult = {
    /**
     * `true` if the group was cancelled, `false` if it was resolved normally.
     */
    cancelled: boolean;
    /**
     * The number of promises that started to being awaited
     */
    awaited_count: number;
    /**
     * The number of promises that were resolved
    */
    resolved_count: number;
}

/**
 * A group of promises that can be awaited together.  
 * This is used for awaiting LOD 
 */
export class PromiseGroup {

    static readonly addPromise = (type: PromiseType, object: object, promise: Promise<any>, groups: PromiseGroup[]) => {
        groups.forEach(group => {
            group.add(type, object, promise);
        });
    }


    readonly frame_start: number;
    readonly frame_capture_end: number;

    readonly ready: Promise<PromiseGroupResolveResult>;
    private _resolve!: ((result: PromiseGroupResolveResult) => void);
    private readonly _signal?: AbortSignal;

    /**
     * The number of promises that have been added to this group so far.
     */
    get awaitedCount() {
        return this._addedCount;
    }
    get resolvedCount() {
        return this._resolvedCount;
    }
    get currentlyAwaiting() {
        return this._awaiting.length;
    }

    private _resolved = false;
    private _addedCount: number = 0;
    private _resolvedCount: number = 0;
    /** These promises are currently being awaited */
    private readonly _awaiting: Array<Promise<any>> = [];

    private _maxPromisesPerObject: number = 1;

    constructor(frame: number, options: PromiseGroupOptions) {
        const minFrames = 2; // wait at least 2 frames to capture promises
        const framesToCapture = Math.max(options.frames ?? minFrames, minFrames); // default to 2 frames and make sure it's at least 2 frames

        this.frame_start = frame;
        this.frame_capture_end = frame + framesToCapture;
        this.ready = new Promise<PromiseGroupResolveResult>((resolve) => {
            this._resolve = resolve;
        })
        this.ready.finally(() => {
            this._resolved = true;
            this._awaiting.length = 0;
        });
        this._signal = options.signal;
        this._signal?.addEventListener("abort", () => {
            this.resolveNow();
        });

        this._maxPromisesPerObject = Math.max(1, options.maxPromisesPerObject ?? 1);
    }

    private _currentFrame: number = 0;

    update(frame: number) {
        this._currentFrame = frame;
        // If we've passes the frame capture end frame and didn't add any promises, we resolve immediately
        if (this._signal?.aborted || (this._currentFrame > this.frame_capture_end && this._awaiting.length === 0)) {
            this.resolveNow();
        }
    }

    private readonly _seen = new WeakMap<object, number>();

    private add(_type: PromiseType, object: object, promise: Promise<any>) {
        if (this._resolved) {
            if (debug) console.warn("PromiseGroup: Trying to add a promise to a resolved group, ignoring.");
            return;
        }
        if (this._currentFrame > this.frame_capture_end) {
            return; // we are not capturing any more promises
        }
        if (this._maxPromisesPerObject >= 1) {
            if (this._seen.has(object)) {
                let count = this._seen.get(object)!;
                if (count >= this._maxPromisesPerObject) {
                    if (debug) console.warn(`PromiseGroup: Already awaiting object ignoring new promise for it.`);
                    return;
                }
                this._seen.set(object, count + 1);
            }
            else {
                this._seen.set(object, 1);
            }
        }

        this._awaiting.push(promise);
        this._addedCount++;
        promise.finally(() => {
            this._resolvedCount++;
            this._awaiting.splice(this._awaiting.indexOf(promise), 1);
        });
    }

    private resolveNow() {
        if (this._resolved) return;
        this._resolve?.({
            awaited_count: this._addedCount,
            resolved_count: this._resolvedCount,
            cancelled: this._signal?.aborted ?? false,
        });
    }

}