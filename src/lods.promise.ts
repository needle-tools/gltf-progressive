import { debug } from "./lods.debug.js";

type PromiseType = "texture" | "mesh";

export type PromiseGroupOptions = {
    /** Name for debugging purposes */
    name?: string;
    /** Define how many frames new LOD promises will at least be captured and awaited. The group will resolve after all promises captured during this time have resolved (or when the abort signal is triggered).
     * @default 2 frames, which means the group will capture promises for 2 frames before resolving.
    */
    frames?: number;

    /** If set to true at least one LOD loading promise must be captured before this promise will resolve.   
     *  After the first promise has been captured the group will wait for the amount of frames specified in the `frames` option. 
     */
    waitForFirstCapture?: boolean;

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


    readonly ready: Promise<PromiseGroupResolveResult>;

    /** The number of promises that have been added to this group so far */
    get awaitedCount() {
        return this._addedCount;
    }
    /** The number of promises that have been resolved */
    get resolvedCount() {
        return this._resolvedCount;
    }
    /** The number of promises that are in-flight */
    get currentlyAwaiting() {
        return this._awaiting.length;
    }

    
    private _resolve!: ((result: PromiseGroupResolveResult) => void);
    private readonly _signal?: AbortSignal;

    /** start frame can be undefined if the user configured this group to wait for the first promise.
     * Then the start frame will be set when the first promise has been added to the group */
    private _frame_start: number | undefined;
    /** How many frames to capture since the start frame */
    private _frames_to_capture: number;

    private _resolved = false;
    private _addedCount: number = 0;
    private _resolvedCount: number = 0;
    /** These promises are currently being awaited */
    private readonly _awaiting: Array<Promise<any>> = [];

    private _maxPromisesPerObject: number = 1;

    constructor(frame: number, options: PromiseGroupOptions) {
        const minFrames = 2; // wait at least 2 frames to capture promises
        const framesToCapture = Math.max(options.frames ?? minFrames, minFrames); // default to 2 frames and make sure it's at least 2 frames
        this._frame_start = options.waitForFirstCapture ? undefined : frame;
        this._frames_to_capture = framesToCapture;
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

        // Check if start frame is not defined yet but we have added objects since the last update
        if(this._frame_start === undefined && this._addedCount > 0) {
            this._frame_start = frame;
        }

        // If we've passes the frame capture end frame and didn't add any promises, we resolve immediately
        if (this._signal?.aborted || (this._awaiting.length === 0 && (this._frame_start !== undefined && (frame > this._frame_start + this._frames_to_capture)))) {
            this.resolveNow();
        }
    }

    private readonly _seen = new WeakMap<object, number>();

    private add(_type: PromiseType, object: object, promise: Promise<any>) {
        if (this._resolved) {
            if (debug) console.warn("PromiseGroup: Trying to add a promise to a resolved group, ignoring.");
            return;
        }
        if (this._frame_start !== undefined && this._currentFrame > this._frame_start + this._frames_to_capture) {
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