
type PromiseType = "texture" | "mesh";

export type PromiseGroupOptions = {
    name?: string;
    /** How many renderer frames can requests be captured to be awaited */
    frames?: number;
    signal?: AbortSignal;
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

    static readonly addPromise = (type: PromiseType, promise: Promise<any>, groups: PromiseGroup[]) => {
        groups.forEach(group => {
            group.add(type, promise);
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
    }

    private _currentFrame: number = 0;

    update(frame: number) {
        this._currentFrame = frame;
        // If we've passes the frame capture end frame and didn't add any promises, we resolve immediately
        if (this._signal?.aborted || (this._currentFrame > this.frame_capture_end && this._awaiting.length === 0)) {
            this.resolveNow();
        }
    }

    private add(_type: PromiseType, promise: Promise<any>) {
        if (this._resolved) {
            console.warn("PromiseGroup: Trying to add a promise to a resolved group, ignoring.");
            return;
        }
        if (this._currentFrame > this.frame_capture_end) {
            return; // we are not capturing any more promises
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