import { FileLoader } from "three";



export function loadKTX2Header(url: string) {
    const loader = new FileLoader();
    const range = { start: 0, end: 63 };
    loader.setCrossOrigin('anonymous');
    loader.setResponseType('arraybuffer');
    loader.setPath('');
    loader.setRequestHeader({ 'Range': `bytes=${range.start}-${range.end}` });
    return new Promise((resolve, _reject) => {
        loader.load(url,
            (_buffer) => {
                // this won't be invoked at the moment due to the range request
                // see https://github.com/mrdoob/three.js/issues/24485
            },
            undefined,
            async (err: any) => {
                const error = err as Error & { response?: Response }
                const response = error?.response;
                if (response?.ok && response.status === 206) {
                    console.log(response);
                    const buffer = await response.arrayBuffer();
                    const header = readKTX2Header(buffer);
                    console.log(header);
                    resolve(header);
                }
            });
    });
}

export function readKTX2Header(buffer: ArrayBuffer): any {
    /*
Byte[12] identifier
UInt32 vkFormat
UInt32 typeSize
UInt32 pixelWidth
UInt32 pixelHeight
UInt32 pixelDepth
UInt32 layerCount
UInt32 faceCount
UInt32 levelCount
UInt32 supercompressionScheme
*/
    const view = new DataView(buffer);
    const header = {
        identifier: new Uint8Array(buffer, 0, 12),
        vkFormat: view.getUint32(12, true),
        typeSize: view.getUint32(16, true),
        pixelWidth: view.getUint32(20, true),
        pixelHeight: view.getUint32(24, true),
        pixelDepth: view.getUint32(28, true),
        layerCount: view.getUint32(32, true),
        faceCount: view.getUint32(36, true),
        levelCount: view.getUint32(40, true),
        supercompressionScheme: view.getUint32(44, true),
    };
    return header;
}