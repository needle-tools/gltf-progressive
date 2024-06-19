



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


let _ismobile: boolean | undefined;
/** @returns `true` if it's a phone or tablet */
export function isMobileDevice() {
    if (_ismobile !== undefined) return _ismobile;
    _ismobile = /iPhone|iPad|iPod|Android|IEMobile/i.test(navigator.userAgent);
    if (getParam("debugprogressive")) console.log("[glTF Progressive]: isMobileDevice", _ismobile);
    return _ismobile;
}