import { ExifTags, GPSTags, IFD1Tags, StringValues, TiffTags } from "./constants.ts";
import { type NumDict } from "../types.ts";
import { scanPartialDataView, getPartialString, partialDataView, getJpegDataView } from "../dataview.ts";

let debug = false;
export function enableDebug() {
  debug = true;
}

export type Rational = {
  numerator: number;
  denominator: number;
}

export function getEXIFinJPEG0(buf: ArrayBufferLike) {
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
      return readEXIFData(partialDataView(segment, 6));
    }
  }
}

function* eachJfifSegments(dataview: DataView) {
  const length = dataview.byteLength
  let offset = 2

  while (offset < length) {
    const marker = dataview.getUint16(offset)
    const size = dataview.getUint16(offset + 2);
    const segment = new DataView(dataview.buffer, dataview.byteOffset + offset + 4, size)
    yield { marker, segment }
    offset += 4 + size;
  }
}

function readTags(dataview: DataView, tiffStart: number, dirStart: number, numdict: NumDict, littleEndian: boolean) {
  const entries = dataview.getUint16(dirStart, littleEndian),
    tags: Record<string, ReturnType<typeof readTagValue>> = {}

  for (let i = 0; i < entries; i++) {
    const entryOffset = dirStart + i * 12 + 2;
    const tag = numdict[dataview.getUint16(entryOffset, littleEndian)];
    if (!tag && debug) console.log("Unknown tag: " + dataview.getUint16(entryOffset, littleEndian));
    tags[tag] = readTagValue(dataview, entryOffset, tiffStart, littleEndian);
  }
  return tags;
}

function readTagValue(dataview: DataView, entryOffset: number, tiffStart: number, littleEndian: boolean) {
  const type = dataview.getUint16(entryOffset + 2, littleEndian),
    numValues = dataview.getUint32(entryOffset + 4, littleEndian),
    valueOffset = dataview.getUint32(entryOffset + 8, littleEndian) + tiffStart

  switch (type) {
    case 1: // byte, 8-bit unsigned int
    case 7: // undefined, 8-bit byte, value depending on field
      if (numValues == 1) {
        return dataview.getUint8(entryOffset + 8);
      } else {
        const offset = numValues > 4 ? valueOffset : (entryOffset + 8);
        const vals: number[] = [];
        for (let n = 0; n < numValues; n++) {
          vals[n] = dataview.getUint8(offset + n);
        }
        return vals;
      }

    case 2: { // ascii, 8-bit byte
      const offset = numValues > 4 ? valueOffset : (entryOffset + 8);
      return getStringFromDB(dataview, offset, numValues - 1)!;
    }

    case 3: // short, 16 bit int
      if (numValues == 1) {
        return dataview.getUint16(entryOffset + 8, littleEndian);
      } else {
        const offset = numValues > 2 ? valueOffset : (entryOffset + 8);
        const vals: number[] = [];
        for (let n = 0; n < numValues; n++) {
          vals[n] = dataview.getUint16(offset + 2 * n, littleEndian);
        }
        return vals;
      }

    case 4: // long, 32 bit int
      if (numValues == 1) {
        return dataview.getUint32(entryOffset + 8, littleEndian);
      } else {
        const vals: number[] = [];
        for (let n = 0; n < numValues; n++) {
          vals[n] = dataview.getUint32(valueOffset + 4 * n, littleEndian);
        }
        return vals;
      }

    case 5:    // rational = two long values, first is numerator, second is denominator
      if (numValues == 1) {
        const numerator = dataview.getUint32(valueOffset, littleEndian);
        const denominator = dataview.getUint32(valueOffset + 4, littleEndian);
        return { numerator, denominator } as Rational;
      } else {
        const vals: Rational[] = [];
        for (let n = 0; n < numValues; n++) {
          const numerator = dataview.getUint32(valueOffset + 8 * n, littleEndian);
          const denominator = dataview.getUint32(valueOffset + 4 + 8 * n, littleEndian);
          vals[n] = { numerator, denominator }
        }
        return vals;
      }

    case 9: // slong, 32 bit signed int
      if (numValues == 1) {
        return dataview.getInt32(entryOffset + 8, littleEndian);
      } else {
        const vals: number[] = [];
        for (let n = 0; n < numValues; n++) {
          vals[n] = dataview.getInt32(valueOffset + 4 * n, littleEndian);
        }
        return vals;
      }

    case 10: // signed rational, two slongs, first is numerator, second is denominator
      if (numValues == 1) {
        return dataview.getInt32(valueOffset, littleEndian) / dataview.getInt32(valueOffset + 4, littleEndian);
      } else {
        const vals: number[] = [];
        for (let n = 0; n < numValues; n++) {
          vals[n] = dataview.getInt32(valueOffset + 8 * n, littleEndian) / dataview.getInt32(valueOffset + 4 + 8 * n, littleEndian);
        }
        return vals;
      }
  }
}

/**
* Given an IFD (Image File Directory) start offset
* returns an offset to next IFD or 0 if it's the last IFD.
*/
function getNextIFDOffset(dataView: DataView, dirStart: number, littleEndian: boolean) {
  //the first 2bytes means the number of directory entries contains in this IFD
  const entries = dataView.getUint16(dirStart, littleEndian);

  // After last directory entry, there is a 4bytes of data,
  // it means an offset to next IFD.
  // If its value is '0x00000000', it means this is the last IFD and there is no linked IFD.

  return dataView.getUint32(dirStart + 2 + entries * 12, littleEndian); // each entry is 12 bytes long
}

function readThumbnailImage(dataView: DataView,firstIFDOffset: number, littleEndian: boolean) {
  // get the IFD1 offset
  const IFD1OffsetPointer = getNextIFDOffset(dataView, firstIFDOffset, littleEndian);

  if (!IFD1OffsetPointer) {
    console.log('******** IFD1Offset is empty, image thumb not found ********');
    return {};
  }
  else if (IFD1OffsetPointer > dataView.byteLength) { // this should not happen
    // console.log('******** IFD1Offset is outside the bounds of the DataView ********');
    return {};
  }
  // console.log('*******  thumbnail IFD offset (IFD1) is: %s', IFD1OffsetPointer);

  const thumbTags = readTags(dataView, 0, IFD1OffsetPointer, IFD1Tags, littleEndian)

  // EXIF 2.3 specification for JPEG format thumbnail

  // If the value of Compression(0x0103) Tag in IFD1 is '6', thumbnail image format is JPEG.
  // Most of Exif image uses JPEG format for thumbnail. In that case, you can get offset of thumbnail
  // by JpegIFOffset(0x0201) Tag in IFD1, size of thumbnail by JpegIFByteCount(0x0202) Tag.
  // Data format is ordinary JPEG format, starts from 0xFFD8 and ends by 0xFFD9. It seems that
  // JPEG format and 160x120pixels of size are recommended thumbnail format for Exif2.1 or later.

  if (thumbTags['Compression']) {
    // console.log('Thumbnail image found!');

    switch (thumbTags['Compression']) {
      case 6:
        // console.log('Thumbnail image format is JPEG');
        if (thumbTags.JpegIFOffset && thumbTags.JpegIFByteCount) {
          // extract the thumbnail
          const tOffset = thumbTags.JpegIFOffset;
          const tLength = thumbTags.JpegIFByteCount;
          thumbTags['blob'] = new Blob([new Uint8Array(dataView.buffer, tOffset, tLength)], {
            type: 'image/jpeg'
          });
        }
        break;

      case 1:
        console.log("Thumbnail image format is TIFF, which is not implemented.");
        break;
      default:
        console.log("Unknown thumbnail image format '%s'", thumbTags['Compression']);
    }
  }
  else if (thumbTags['PhotometricInterpretation'] == 2) {
    console.log("Thumbnail image format is RGB, which is not implemented.");
  }
  return thumbTags;
}

function getStringFromDB(buffer: DataView, offset: number, length: number) {
  return getPartialString(buffer, { offset, length });
}

function readEXIFData(segment: DataView) {
  const endianMarker = segment.getUint16(0);
  const littleEndian =
    endianMarker == 0x4949 ? true :
    endianMarker == 0x4D4D ? false :
    null;
  if(littleEndian === null) {
    if (debug) console.log("Not valid TIFF data! (no 0x4949 or 0x4D4D)");
    return false;
  }

  if (segment.getUint16(2, littleEndian) != 0x002A) {
    if (debug) console.log("Not valid TIFF data! (no 0x002A)");
    return false;
  }

  const firstIFDOffset = segment.getUint32(4, littleEndian);

  if (firstIFDOffset < 0x00000008) {
    if (debug) console.log("Not valid TIFF data! (First offset less than 8)", segment.getUint32(0 + 4, littleEndian));
    return false;
  }

  const tags = readTags(segment, 0, 0 + firstIFDOffset, TiffTags, littleEndian);

  if (tags.ExifIFDPointer) {
    const exifData = readTags(segment, 0, tags.ExifIFDPointer as number, ExifTags, littleEndian);
    for (const tag in exifData) {
      switch (tag) {
        case "LightSource":
        case "Flash":
        case "MeteringMode":
        case "ExposureProgram":
        case "SensingMethod":
        case "SceneCaptureType":
        case "SceneType":
        case "CustomRendered":
        case "WhiteBalance":
        case "GainControl":
        case "Contrast":
        case "Saturation":
        case "Sharpness":
        case "SubjectDistanceRange":
        case "FileSource":
          exifData[tag] = StringValues[tag][exifData[tag]];
          break;

        case "ExifVersion":
        case "FlashpixVersion":
          exifData[tag] = String.fromCharCode(exifData[tag][0], exifData[tag][1], exifData[tag][2], exifData[tag][3]);
          break;

        case "ComponentsConfiguration":
          exifData[tag] =
            StringValues.Components[exifData[tag][0]] +
            StringValues.Components[exifData[tag][1]] +
            StringValues.Components[exifData[tag][2]] +
            StringValues.Components[exifData[tag][3]];
          break;
      }
      tags[tag] = exifData[tag];
    }
  }

  if (tags.GPSInfoIFDPointer) {
    const gpsData = readTags(segment, 0, 0 + tags.GPSInfoIFDPointer, GPSTags, littleEndian);
    for (const tag in gpsData) {
      switch (tag) {
        case "GPSVersionID":
          gpsData[tag] = gpsData[tag][0] +
            "." + gpsData[tag][1] +
            "." + gpsData[tag][2] +
            "." + gpsData[tag][3];
          break;
      }
      tags[tag] = gpsData[tag];
    }
  }

  // extract thumbnail
  tags['thumbnail'] = readThumbnailImage(segment, firstIFDOffset, littleEndian);

  return tags;
}

