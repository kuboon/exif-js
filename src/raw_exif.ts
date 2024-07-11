// https://www.media.mit.edu/pia/Research/deepview/exif.html
import { ExifTags, TiffTags } from "./constants.ts";
import { getPartialString, partialDataView, getJpegDataView } from "./dataview.ts";

let debug = false;
export function enableDebug() {
  debug = true;
}

export type Rational = {
  numerator: number;
  denominator: number;
}

export function getEXIFrawTagsInJPEG(buf: ArrayBufferLike) {
  const jpeg = getJpegDataView(buf);
  if (!jpeg) return false

  for (const { marker, segment } of eachJfifSegments(jpeg.v)) {
    // we could implement handling for other markers here,
    // but we're only looking for 0xFFE1 for EXIF data
    if (marker == 0xFFE1) {
      if (debug) console.log("Found 0xFFE1 marker");
      const keyword = getPartialString(segment, { offset: 0, length: 4 })
      if (keyword !== "Exif") {
        throw new Error("'Exif' marker not found. was " + keyword);
      }
      return readRawTags(partialDataView(segment, 6));
    }
  }
}

function readRawTags(ifd: DataView) {
  const endianMarker = ifd.getUint16(0);
  const littleEndian =
    endianMarker == 0x4949 ? true :
    endianMarker == 0x4D4D ? false :
    null;
  if(littleEndian === null) {
    throw new Error("Invalid byte align (no 0x4949 or 0x4D4D)");
  }

  if (ifd.getUint16(2, littleEndian) != 0x002A) {
    throw new Error("Invalid TIFF Header (No 0x002A)");
  }
  const firstIFDOffset = ifd.getUint32(4, littleEndian);
  if (firstIFDOffset < 0x00000008) {
    throw new Error("Invalid TIFF Header (First offset less than 8)");
  }

  const ifdIter = eachIFDoffset(ifd, firstIFDOffset, littleEndian);
  const ifd0offset = ifdIter.next().value!;
  const rawTags = [...eachEntryInIFD(ifd, ifd0offset, littleEndian)]
    .map(x => ({ ...x, tagHex: x.tag.toString(16), tagName: TiffTags[x.tag] }));

  const ifd1offset = ifdIter.next().value!; // thumbnail IFD
  const thumbnail = readThumbnail(ifd, ifd1offset, littleEndian);
  return { rawTags, thumbnail };
}

function* eachJfifSegments(dataview: DataView) {
  const length = dataview.byteLength
  let offset = 2

  while (offset < length) {
    const marker = dataview.getUint16(offset)
    const size = dataview.getUint16(offset + 2);
    const segment = partialDataView(dataview, offset + 4, size - 2)
    yield { marker, segment }
    offset += size;
  }
}

function* eachIFDoffset(dataview: DataView, offset: number, littleEndian: boolean) {
  while (offset < dataview.byteLength) {
    yield offset;
    const entries = dataview.getUint16(offset, littleEndian);
    const offsetToNext = dataview.getUint32(offset + 2 + 12 * entries, littleEndian)
    offset = offsetToNext;
  }
}
const formatByteLength: Record<number, number> = {
  1: 1, // unsigned byte
  2: 1, // ascii strings
  3: 2, // unsigned short
  4: 4, // unsigned long
  5: 8, // unsigned rational
  6: 1, // signed byte
  7: 1, // undefined
  8: 2, // signed short
  9: 4, // signed long
  10: 8, // signed rational
  11: 4, // single float
  12: 8, // double float
}
function* eachEntryInIFD(ifd: DataView, offset: number, littleEndian: boolean) {
  const entries = ifd.getUint16(offset, littleEndian);
  for (let i = 0; i < entries; i++) {
    const entryOffset = offset + 2 + i * 12;
    const entryView = partialDataView(ifd, entryOffset, 12);
    const tag = entryView.getUint16(0, littleEndian);
    const format = entryView.getUint16(2, littleEndian);
    const numValues = entryView.getUint32(4, littleEndian);
    let dataView = partialDataView(entryView, 8, 4)
    if (numValues * formatByteLength[format] > 4) {
      const dataOffset = dataView.getUint32(0, littleEndian);
      dataView = partialDataView(ifd, dataOffset, numValues * formatByteLength[format]);
    }
    if (format === 2) { // ascii string
      const data = getPartialString(dataView, { offset: 0, length: numValues - 1});
      yield { tag, format: 2 as const, numValues, data }
    }
    const data: (number | Rational)[] = [];
    for(let i=0; i<numValues; i++){
      switch(format){
        case 1: case 6: // unsigned byte, signed byte
          data.push(dataView.getUint8(i));
          break;
        case 3: case 8: // unsigned short, signed short
          data.push(dataView.getUint16(i * 2, littleEndian));
          break;
        case 4: case 9: // unsigned long, signed long
          data.push(dataView.getUint32(i * 4, littleEndian));
          break;
        case 5: case 10: // unsigned rational, signed rational
          data.push({ numerator: dataView.getUint32(i * 8, littleEndian), denominator: dataView.getUint32(i * 8 + 4, littleEndian) });
          break;
        case 7: // undefined
          data.push(dataView.getUint8(i));
          break;
        case 11: // single float
          data.push(dataView.getFloat32(i * 4, littleEndian));
          break;
        case 12: // double float
          data.push(dataView.getFloat64(i * 8, littleEndian));
          break;
      }
    }
    yield { tag, format, numValues, data }
  }
}

function readThumbnail(ifd1: DataView, offset: number, littleEndian: boolean) {
  const rawTags = [...eachEntryInIFD(ifd1, offset, littleEndian)];
  const compressionTag = rawTags.find(e => e.tag === 0x0103);
  if (!compressionTag) throw new Error("No compression tag found in thumbnail IFD");
  const compression = (compressionTag.data as number[])[0];
  let blob: Blob | undefined;
  if (compression == 1) { // uncompressed TIFF
    const offsetTag = rawTags.find(e => e.tag === 0x0111); // StripOffset
    const byteCountTag = rawTags.find(e => e.tag === 0x0117); // StripByteCounts
    if (!offsetTag || !byteCountTag) throw new Error("No offset or byte count tag found in uncompressed TIFF thumbnail IFD");
    const offset = (offsetTag.data as number[])[0];
    const byteCount = (byteCountTag.data as number[])[0];
    blob = new Blob([new Uint8Array(ifd1.buffer, offset, byteCount)], { type: 'image/tiff' });
  }
  if (compression == 6) { // JPEG
    const offsetTag = rawTags.find(e => e.tag === 0x0201); // JpegIFOffset
    const byteCountTag = rawTags.find(e => e.tag === 0x0202); // JpegIFByteCount
    if (!offsetTag || !byteCountTag) throw new Error("No offset or byte count tag found in JPEG thumbnail IFD");
    const offset = (offsetTag.data as number[])[0];
    const byteCount = (byteCountTag.data as number[])[0];
    blob = new Blob([new Uint8Array(ifd1.buffer, offset, byteCount)], { type: 'image/jpeg' });
  }
  return { rawTags, blob };
}
