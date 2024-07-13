// https://www.media.mit.edu/pia/Research/deepview/exif.html
import {
  getJpegDataView,
  getPartialString,
  partialDataView,
} from "../dataview.ts";
import type { TagsGroup } from "../types.ts";

let debug = false;
export function setDebug(val = true) {
  debug = val;
}

export type Rational = {
  numerator: number;
  denominator: number;
};
export type RawData = string | (number | Rational)[];
export type RawTagEntry = {
  tag: number;
  format: number;
  numValues: number;
  rawData: RawData;
};
export type RawTagsGroup = TagsGroup<RawTagEntry>;

export function getEXIFrawTagsInJPEG(buf: ArrayBufferLike) {
  const jpeg = getJpegDataView(buf);
  if (!jpeg) return null;

  for (const { marker, segment } of eachJfifSegments(jpeg.v)) {
    // if (marker == 0xFFE0) {
    //   if (debug) console.log(`Found 0x${marker.toString(16)} marker`);
    //   const keyword = getPartialString(segment, { offset: 0, length: 4 });
    //   if (keyword !== "JFIF") {
    //     throw new Error("'JFIF' marker not found. was " + keyword);
    //   }
    //   do something?
    // }

    // we could implement handling for other markers here,
    // but we're only looking for 0xFFE1 for EXIF data
    if (marker == 0xFFE1) {
      if (debug) console.log(`Found 0x${marker.toString(16)} marker`);
      const keyword = getPartialString(segment, { offset: 0, length: 4 });
      if (keyword !== "Exif") {
        throw new Error("'Exif' marker not found. was " + keyword);
      }
      return readExifSegment(partialDataView(segment, 6));
    }
  }
  return null;
}

function readExifSegment(ifd: DataView) {
  const endianMarker = ifd.getUint16(0);
  const littleEndian = endianMarker == 0x4949
    ? true
    : endianMarker == 0x4D4D
    ? false
    : null;
  if (littleEndian === null) {
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
  const ifd0 = ifdIter.next();
  const ifd0offset = ifd0.value!; // main image IFD
  const iptc: RawTagEntry[] = [
    ...eachEntryInIFD(ifd, ifd0offset, littleEndian),
  ];

  const exif: RawTagEntry[] = getTagsByTagPointer(
    iptc,
    ifd,
    0x8769,
    littleEndian,
  ); // ExifIFDPointer
  const gps: RawTagEntry[] = getTagsByTagPointer(
    iptc,
    ifd,
    0x8825,
    littleEndian,
  ); // GPSInfoIFDPointer

  if (ifd0.done) { // no thumbnail
    return {
      tags: [
        { type: "iptc", rows: iptc },
        { type: "exif", rows: exif },
        { type: "gps", rows: gps },
      ] as RawTagsGroup[],
    };
  }
  const ifd1offset = ifdIter.next().value!; // thumbnail IFD
  const { rawTags: thumbnail, blob: thumbnailBlob } = readThumbnail(
    ifd,
    ifd1offset,
    littleEndian,
  );
  return {
    tags: [
      { type: "iptc", rows: iptc },
      { type: "exif", rows: exif },
      { type: "gps", rows: gps },
      { type: "thumbnail", rows: thumbnail },
    ] as RawTagsGroup[],
    thumbnailBlob,
  };
}

function getTagsByTagPointer(
  ifdEntries: { tag: number; rawData: unknown }[],
  ifd: DataView,
  tag: number,
  littleEndian: boolean,
) {
  const tagPointerTagIndex = ifdEntries.findIndex((e) => e.tag === tag);
  if (tagPointerTagIndex == -1) return [];
  const ret = [
    ...eachEntryInIFD(
      ifd,
      (ifdEntries[tagPointerTagIndex].rawData as number[])[0],
      littleEndian,
    ),
  ];
  ifdEntries.splice(tagPointerTagIndex, 1);
  return ret;
}

function* eachJfifSegments(dataview: DataView) {
  const length = dataview.byteLength;
  let offset = 2;

  while (offset < length) {
    const marker = dataview.getUint16(offset);
    const length = dataview.getUint16(offset + 2);
    if (length == 0) {
      offset += 4;
      continue;
    }
    const segment = partialDataView(dataview, offset + 4, length - 2);
    yield { marker, segment };
    offset += length - 2;
  }
}

function* eachIFDoffset(
  dataview: DataView,
  offset: number,
  littleEndian: boolean,
) {
  while (offset < dataview.byteLength) {
    const entries = dataview.getUint16(offset, littleEndian);
    const offsetToNext = dataview.getUint32(
      offset + 2 + 12 * entries,
      littleEndian,
    );
    if (debug) console.log("eachIFDoffset", { offset, entries, offsetToNext });
    if (offsetToNext == 0) return offset;
    yield offset;
    offset = offsetToNext;
  }
  throw new Error("offsetToNext == 0 not found");
}
function* eachEntryInIFD(ifd: DataView, offset: number, littleEndian: boolean) {
  const entries = ifd.getUint16(offset, littleEndian);
  if (debug) console.log("eachEntryInIFD", { entries });
  if (entries > 100) throw new Error("Too many entries");
  for (let i = 0; i < entries; i++) {
    const entryOffset = offset + 2 + i * 12;
    const entryView = partialDataView(ifd, entryOffset, 12);
    const tag = entryView.getUint16(0, littleEndian);
    const format = entryView.getUint16(2, littleEndian);
    const numValues = entryView.getUint32(4, littleEndian);
    // console.log({ tag: tag.toString(16), format, numValues });
    let dataView = partialDataView(entryView, 8, 4);
    const { size, getData } = sizeAndFnForFormat(format, littleEndian);
    if (numValues * size > 4) {
      const dataOffset = dataView.getUint32(0, littleEndian);
      dataView = partialDataView(ifd, dataOffset, numValues * size);
    }
    const rawData = getData(dataView, numValues) as RawData;
    yield { tag, format, numValues, rawData };
  }
}

function sizeAndFnForFormat(format: number, littleEndian: boolean) {
  function buildArray(
    numValues: number,
    getOne: (count: number) => number | Rational,
  ) {
    const ret: ReturnType<typeof getOne>[] = new Array(numValues);
    for (let count = 0; count < numValues; count++) {
      ret[count] = getOne(count);
    }
    return ret;
  }

  switch (format) {
    case 0:
    case 1:
    case 6:
    case 7: { // BYTE, signed byte (obsolete), UNDEFINED
      const size = 1;
      const getData = (dataView: DataView, numValues: number) =>
        buildArray(numValues, (count: number) => dataView.getUint8(count));
      return { size, getData };
    }
    case 2: { // ASCII
      const size = 1;
      const getData = (dataView: DataView, numValues: number) =>
        getPartialString(dataView, { length: numValues - 1 })!; // strip last null
      return { size, getData };
    }
    case 3:
    case 8: { // SHORT, signed short (obsolete)
      const size = 2;
      const getData = (dataView: DataView, numValues: number) =>
        buildArray(
          numValues,
          (count: number) => dataView.getUint16(count * size, littleEndian),
        );
      return { size, getData };
    }
    case 4:
    case 9: { // LONG, SLONG
      const size = 4;
      const getData = (dataView: DataView, numValues: number) =>
        buildArray(
          numValues,
          (count: number) => dataView.getUint32(count * size, littleEndian),
        );
      return { size, getData };
    }
    case 5: { // RATIONAL
      const size = 8;
      const getData = (dataView: DataView, numValues: number) =>
        buildArray(
          numValues,
          (count: number) => ({
            numerator: dataView.getUint32(count * size, littleEndian),
            denominator: dataView.getUint32(count * size + 4, littleEndian),
          }),
        );
      return { size, getData };
    }
    case 10: { // SRATIONAL
      const size = 8;
      const getData = (dataView: DataView, numValues: number) =>
        buildArray(
          numValues,
          (count: number) => ({
            numerator: dataView.getInt32(count * size, littleEndian),
            denominator: dataView.getInt32(count * size + 4, littleEndian),
          }),
        );
      return { size, getData };
    }
    case 11: { // single float (obsolete)
      const size = 4;
      const getData = (dataView: DataView, numValues: number) =>
        buildArray(
          numValues,
          (count: number) => dataView.getFloat32(count * size, littleEndian),
        );
      return { size, getData };
    }
    case 12: { // double float (obsolete)
      const size = 8;
      const getData = (dataView: DataView, numValues: number) =>
        buildArray(
          numValues,
          (count: number) => dataView.getFloat64(count * size, littleEndian),
        );
      return { size, getData };
    }
    case 129: { // UTF-8
      const size = 1;
      const getData = (dataView: DataView, numValues: number) =>
        getPartialString(dataView, { length: numValues - 1 })!; // strip last null
      return { size, getData };
    }
  }
  throw new Error("Invalid format: " + format);
}

function readThumbnail(ifd1: DataView, offset: number, littleEndian: boolean) {
  const rawTags = [
    ...eachEntryInIFD(ifd1, offset, littleEndian),
  ] as RawTagEntry[];
  const compressionTag = rawTags.find((e) => e.tag === 0x0103);
  if (!compressionTag) {
    throw new Error("No compression tag found in thumbnail IFD");
  }
  const compression = compressionTag.rawData![0] as number;
  let blob: Blob | undefined;
  if (compression == 1) { // uncompressed TIFF
    const offsetTag = rawTags.find((e) => e.tag === 0x0111); // StripOffset
    const byteCountTag = rawTags.find((e) => e.tag === 0x0117); // StripByteCounts
    if (!offsetTag || !byteCountTag) {
      throw new Error(
        "No offset or byte count tag found in uncompressed TIFF thumbnail IFD",
      );
    }
    const offset = (offsetTag.rawData as number[])[0];
    const byteCount = (byteCountTag.rawData as number[])[0];
    blob = new Blob([new Uint8Array(ifd1.buffer, offset, byteCount)], {
      type: "image/tiff",
    });
  }
  if (compression == 6) { // JPEG
    const offsetTag = rawTags.find((e) => e.tag === 0x0201); // JpegIFOffset
    const byteCountTag = rawTags.find((e) => e.tag === 0x0202); // JpegIFByteCount
    if (!offsetTag || !byteCountTag) {
      throw new Error(
        "No offset or byte count tag found in JPEG thumbnail IFD",
      );
    }
    const offset = (offsetTag.rawData as number[])[0];
    const byteCount = (byteCountTag.rawData as number[])[0];
    blob = new Blob([new Uint8Array(ifd1.buffer, offset, byteCount)], {
      type: "image/jpeg",
    });
  }
  return { rawTags, blob };
}
