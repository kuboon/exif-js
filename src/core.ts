import { ExifTags, GPSTags, IFD1Tags, IptcFieldMap, StringValues, TiffTags } from "./constants.ts";
import { getPartialDataView, getPartialString } from "./dataview.ts";

let debug = false;
export function enableDebug() {
  debug = true;
}

export type Rational = {
  numerator: bigint;
  denominator: bigint;
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


export function findEXIFinJPEG(file: ArrayBufferLike) {
  const jpeg = getJpegDataView(file);
  if(!jpeg) return false

  for(const { marker, segment } of eachJfifSegments(jpeg.v)) {
    // we could implement handling for other markers here,
    // but we're only looking for 0xFFE1 for EXIF data
    if (marker == 0xFFE1) {
      if (debug) console.log("Found 0xFFE1 marker");
      return readEXIFData(segment);
    }
  }
}

export function findIPTCinJPEG(file: ArrayBufferLike) {
  const jpeg = getJpegDataView(file);
  if(!jpeg) return false

  const iptc = getPartialDataView(jpeg.v, new Uint8Array([0x38, 0x42, 0x49, 0x4D, 0x04, 0x04]));
  if (!iptc) return false;
  let nameHeaderLength = iptc.getUint8(7);
  if (nameHeaderLength % 2 !== 0) nameHeaderLength += 1;
  // Check for pre photoshop 6 format
  if (nameHeaderLength === 0) {
    // Always 4
    nameHeaderLength = 4;
  }

  const startOffset = 8 + nameHeaderLength + 8;
  const sectionLength = iptc.getUint16(nameHeaderLength + 6);

  return readIPTCData(new DataView(iptc.buffer, iptc.byteOffset + startOffset, sectionLength));
}

export function findXMPinJPEG(file: ArrayBufferLike, fixXmlNs = false) {

  const jpeg = getJpegDataView(file);
  if(!jpeg) return false

  const xpacketId = new TextEncoder().encode("W5M0MpCehiHzreSzNTczkc9d")
  const xpacketDataView = getPartialDataView(jpeg.v, xpacketId)
  if (!xpacketDataView) return null;

  const rdfTag = { from: "<rdf:RDF ", to: "</rdf:RDF>" }
  const xmpString = getPartialString(xpacketDataView, rdfTag)
  if (!xmpString) return null;
  if (!fixXmlNs) { return xmpString; }

  return xmpString.replace(rdfTag.from, rdfTag.from +
    + 'xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/" '
    + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
    + 'xmlns:tiff="http://ns.adobe.com/tiff/1.0/" '
    + 'xmlns:plus="http://schemas.android.com/apk/lib/com.google.android.gms.plus" '
    + 'xmlns:ext="http://www.gettyimages.com/xsltExtension/1.0" '
    + 'xmlns:exif="http://ns.adobe.com/exif/1.0/" '
    + 'xmlns:stEvt="http://ns.adobe.com/xap/1.0/sType/ResourceEvent#" '
    + 'xmlns:stRef="http://ns.adobe.com/xap/1.0/sType/ResourceRef#" '
    + 'xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" '
    + 'xmlns:xapGImg="http://ns.adobe.com/xap/1.0/g/img/" '
    + 'xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" '
  )
}

type JpegDataView = {
  type: "JpegDataView",
  v: DataView
}

function getJpegDataView(buf: ArrayBufferLike): JpegDataView | false {
  if (debug) console.log("Got file of length " + buf.byteLength);

  const dataView = new DataView(buf);
  if (dataView.getUint16(0) != 0xFFD8) {
    if (debug) console.log("Not a valid JPEG");
    return false;
  }
  return { type: "JpegDataView", v: dataView }
}

function readIPTCData(dataView: DataView) {
  const data: Record<string, any> = {};
  let segmentStartPos = 0;
  while (segmentStartPos < dataView.byteLength) {
    if (dataView.getUint8(segmentStartPos) === 0x1C && dataView.getUint8(segmentStartPos + 1) === 0x02) {
      const segmentType = dataView.getUint8(segmentStartPos + 2);
      if (segmentType in IptcFieldMap) {
        const dataSize = dataView.getInt16(segmentStartPos + 3);
        const fieldName = IptcFieldMap[segmentType];
        const fieldValue = getStringFromDB(dataView, segmentStartPos + 5, dataSize);
        // Check if we already stored a value with this name
        if (Object.hasOwn(data, fieldName)) {
          // Value already stored with this name, create multivalue field
          if (data[fieldName] instanceof Array) {
            data[fieldName].push(fieldValue);
          }
          else {
            data[fieldName] = [data[fieldName], fieldValue];
          }
        }
        else {
          data[fieldName] = fieldValue;
        }
      }

    }
    segmentStartPos++;
  }
  return data;
}

function readTags(file: DataView, tiffStart: number, dirStart: number, strings, bigEnd) {
  const entries = file.getUint16(dirStart, !bigEnd),
    tags: Record<string, any> = {}

  for (let i = 0; i < entries; i++) {
    const entryOffset = dirStart + i * 12 + 2;
    const tag = strings[file.getUint16(entryOffset, !bigEnd)];
    if (!tag && debug) console.log("Unknown tag: " + file.getUint16(entryOffset, !bigEnd));
    tags[tag] = readTagValue(file, entryOffset, tiffStart, dirStart, bigEnd);
  }
  return tags;
}

function readTagValue(file, entryOffset, tiffStart, dirStart, bigEnd) {
  const type = file.getUint16(entryOffset + 2, !bigEnd),
    numValues = file.getUint32(entryOffset + 4, !bigEnd),
    valueOffset = file.getUint32(entryOffset + 8, !bigEnd) + tiffStart

  switch (type) {
    case 1: // byte, 8-bit unsigned int
    case 7: // undefined, 8-bit byte, value depending on field
      if (numValues == 1) {
        return file.getUint8(entryOffset + 8, !bigEnd);
      } else {
        const offset = numValues > 4 ? valueOffset : (entryOffset + 8);
        const vals: any[] = [];
        for (let n = 0; n < numValues; n++) {
          vals[n] = file.getUint8(offset + n);
        }
        return vals;
      }

    case 2: { // ascii, 8-bit byte
      const offset = numValues > 4 ? valueOffset : (entryOffset + 8);
      return getStringFromDB(file, offset, numValues - 1);
    }

    case 3: // short, 16 bit int
      if (numValues == 1) {
        return file.getUint16(entryOffset + 8, !bigEnd);
      } else {
        const offset = numValues > 2 ? valueOffset : (entryOffset + 8);
        const vals: any[] = [];
        for (let n = 0; n < numValues; n++) {
          vals[n] = file.getUint16(offset + 2 * n, !bigEnd);
        }
        return vals;
      }

    case 4: // long, 32 bit int
      if (numValues == 1) {
        return file.getUint32(entryOffset + 8, !bigEnd);
      } else {
        const vals: any[] = [];
        for (let n = 0; n < numValues; n++) {
          vals[n] = file.getUint32(valueOffset + 4 * n, !bigEnd);
        }
        return vals;
      }

    case 5:    // rational = two long values, first is numerator, second is denominator
      if (numValues == 1) {
        const numerator = file.getUint32(valueOffset, !bigEnd);
        const denominator = file.getUint32(valueOffset + 4, !bigEnd);
        return { numerator, denominator } as Rational;
      } else {
        const vals: Rational[] = [];
        for (let n = 0; n < numValues; n++) {
          const numerator = file.getUint32(valueOffset + 8 * n, !bigEnd);
          const denominator = file.getUint32(valueOffset + 4 + 8 * n, !bigEnd);
          vals[n] = { numerator, denominator }
        }
        return vals;
      }

    case 9: // slong, 32 bit signed int
      if (numValues == 1) {
        return file.getInt32(entryOffset + 8, !bigEnd);
      } else {
        const vals: any[] = [];
        for (let n = 0; n < numValues; n++) {
          vals[n] = file.getInt32(valueOffset + 4 * n, !bigEnd);
        }
        return vals;
      }

    case 10: // signed rational, two slongs, first is numerator, second is denominator
      if (numValues == 1) {
        return file.getInt32(valueOffset, !bigEnd) / file.getInt32(valueOffset + 4, !bigEnd);
      } else {
        const vals: any[] = [];
        for (let n = 0; n < numValues; n++) {
          vals[n] = file.getInt32(valueOffset + 8 * n, !bigEnd) / file.getInt32(valueOffset + 4 + 8 * n, !bigEnd);
        }
        return vals;
      }
  }
}

/**
* Given an IFD (Image File Directory) start offset
* returns an offset to next IFD or 0 if it's the last IFD.
*/
function getNextIFDOffset(dataView: DataView, dirStart, bigEnd) {
  //the first 2bytes means the number of directory entries contains in this IFD
  const entries = dataView.getUint16(dirStart, !bigEnd);

  // After last directory entry, there is a 4bytes of data,
  // it means an offset to next IFD.
  // If its value is '0x00000000', it means this is the last IFD and there is no linked IFD.

  return dataView.getUint32(dirStart + 2 + entries * 12, !bigEnd); // each entry is 12 bytes long
}

function readThumbnailImage(dataView, tiffStart, firstIFDOffset, bigEnd) {
  // get the IFD1 offset
  const IFD1OffsetPointer = getNextIFDOffset(dataView, tiffStart + firstIFDOffset, bigEnd);

  if (!IFD1OffsetPointer) {
    // console.log('******** IFD1Offset is empty, image thumb not found ********');
    return {};
  }
  else if (IFD1OffsetPointer > dataView.byteLength) { // this should not happen
    // console.log('******** IFD1Offset is outside the bounds of the DataView ********');
    return {};
  }
  // console.log('*******  thumbnail IFD offset (IFD1) is: %s', IFD1OffsetPointer);

  const thumbTags = readTags(dataView, tiffStart, tiffStart + IFD1OffsetPointer, IFD1Tags, bigEnd)

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
          const tOffset = tiffStart + thumbTags.JpegIFOffset;
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
  if (getStringFromDB(segment, 0, 4) != "Exif") {
    if (debug) console.log("Not valid EXIF data! " + getStringFromDB(file, start, 4));
    return false;
  }

  const tiffOffset = 6;
  let bigEnd

  // test for TIFF validity and endianness
  if (segment.getUint16(tiffOffset) == 0x4949) {
    bigEnd = false;
  } else if (segment.getUint16(tiffOffset) == 0x4D4D) {
    bigEnd = true;
  } else {
    if (debug) console.log("Not valid TIFF data! (no 0x4949 or 0x4D4D)");
    return false;
  }

  if (segment.getUint16(tiffOffset + 2, !bigEnd) != 0x002A) {
    if (debug) console.log("Not valid TIFF data! (no 0x002A)");
    return false;
  }

  const firstIFDOffset = segment.getUint32(tiffOffset + 4, !bigEnd);

  if (firstIFDOffset < 0x00000008) {
    if (debug) console.log("Not valid TIFF data! (First offset less than 8)", segment.getUint32(tiffOffset + 4, !bigEnd));
    return false;
  }

  const tags = readTags(segment, tiffOffset, tiffOffset + firstIFDOffset, TiffTags, bigEnd);

  if (tags.ExifIFDPointer) {
    const exifData = readTags(segment, tiffOffset, tiffOffset + tags.ExifIFDPointer, ExifTags, bigEnd);
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
    const gpsData = readTags(segment, tiffOffset, tiffOffset + tags.GPSInfoIFDPointer, GPSTags, bigEnd);
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
  tags['thumbnail'] = readThumbnailImage(segment, tiffOffset, firstIFDOffset, bigEnd);

  return tags;
}

