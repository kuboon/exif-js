let debug = false;
export function enableDebug() {
  debug = true;
}

interface BrandedDataView {
  type: string;
  v: DataView;
};

export const Types = {
  JpegDataView: "JpegDataView",
} as const;

export interface JpegDataView extends BrandedDataView {
  type: typeof Types.JpegDataView;
}

export function getJpegDataView(buf: ArrayBufferLike): JpegDataView | null {
  if (debug) console.log("Got file of length " + buf.byteLength);

  const dataView = new DataView(buf);
  if (dataView.getUint16(0) != 0xFFD8) {
    if (debug) console.log("JFIF SOI marker 0xFFD8 not found");
    return null;
  }
  return { type: Types.JpegDataView, v: dataView }
}


function scanBinInDataView(dataView: DataView, bin: Uint8Array, startFrom = 0) {
  const first2bytes = bin[0] * 0x100 + bin[1];
  const binLen = bin.length;
  const maxOffset = dataView.byteLength - binLen;
  let matched = 1;
  for (let i = startFrom; i < maxOffset; i++) {
    if (dataView.getUint16(i) === first2bytes) {
      for (let j = 2; j < binLen; j++) {
        if (dataView.getUint8(i + j) !== bin[j]) break
        matched = j;
      }
      if (matched === binLen - 1) return i;
    }
  }
  return -1;
}

export function partialDataView(dataView: DataView, offset: number, length?: number) {
  return new DataView(dataView.buffer, dataView.byteOffset + offset, length);
}
export function scanPartialDataView(dataView: DataView, from: Uint8Array, to?: Uint8Array) {
  const fromIdx = scanBinInDataView(dataView, from);
  if (fromIdx < 0) return null;
  if (!to) return new DataView(dataView.buffer, fromIdx);
  const toIdx = scanBinInDataView(dataView, to, fromIdx + from.length);
  if (toIdx < 0) return null;
  return new DataView(dataView.buffer, fromIdx, toIdx - fromIdx);
}
type PartialStringOptions = { from: string, to: string } | { offset?: number, length: number };
export function getPartialString(dataView: DataView, opts: PartialStringOptions) {
  let offset: number, length: number;
  if ('from' in opts) {
    const encodedFrom = new TextEncoder().encode(opts.from);
    offset = scanBinInDataView(dataView, encodedFrom);
    if (offset < 0) return null;
    const encodedTo = new TextEncoder().encode(opts.to);
    length = scanBinInDataView(dataView, encodedTo, offset + encodedFrom.length) - offset + encodedTo.length;
    if (length < 0) return null;
  } else {
    offset = opts.offset || 0;
    length = opts.length;
  }
  return new TextDecoder().decode(partialDataView(dataView, offset, length))
}
