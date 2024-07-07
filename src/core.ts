import { ExifTags, GPSTags, IFD1Tags, IptcFieldMap, StringValues, TiffTags } from "./constants";

export let debug = false;
export let isXmpEnabled = false;

type Rational = {
  numerator: bigint;
  denominator: bigint;
}
function isRational(value: any): value is Rational {
  return typeof value.numerator === 'bigint' && typeof value.denominator === 'bigint';
}

function imageHasData(img) {
  return !!(img.exifdata);
}


function base64ToArrayBuffer(base64, contentType = null) {
  contentType = contentType || base64.match(/^data\:([^\;]+)\;base64,/mi)[1] || ''; // e.g. 'data:image/jpeg;base64,...' => 'image/jpeg'
  base64 = base64.replace(/^data\:([^\;]+)\;base64,/gmi, '');
  const binary = atob(base64);
  const len = binary.length;
  const buffer = new ArrayBuffer(len);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < len; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function objectURLToBlob(url, callback) {
  const http = new XMLHttpRequest();
  http.open("GET", url, true);
  http.responseType = "blob";
  http.onload = function (e) {
    if (this.status == 200 || this.status === 0) {
      callback(this.response);
    }
  };
  http.send();
}

function getImageData(img, callback) {
  function handleBinaryFile(binFile) {
    const data = findEXIFinJPEG(binFile);
    img.exifdata = data || {};
    const iptcdata = findIPTCinJPEG(binFile);
    img.iptcdata = iptcdata || {};
    if (isXmpEnabled) {
      const xmpdata = findXMPinJPEG(binFile);
      img.xmpdata = xmpdata || {};
    }
    if (callback) {
      callback.call(img);
    }
  }

  if (img.src) {
    if (/^data\:/i.test(img.src)) { // Data URI
      const arrayBuffer = base64ToArrayBuffer(img.src);
      handleBinaryFile(arrayBuffer);

    } else if (/^blob\:/i.test(img.src)) { // Object URL
      const fileReader = new FileReader();
      fileReader.onload = function (e) {
        handleBinaryFile(e.target!.result);
      };
      objectURLToBlob(img.src, function (blob) {
        fileReader.readAsArrayBuffer(blob);
      });
    } else {
      const http = new XMLHttpRequest();
      http.onload = function () {
        if (this.status == 200 || this.status === 0) {
          handleBinaryFile(http.response);
        } else {
          throw "Could not load image";
        }
      };
      http.open("GET", img.src, true);
      http.responseType = "arraybuffer";
      http.send(null);
    }
  } else if (self.FileReader && (img instanceof self.Blob || img instanceof self.File)) {
    const fileReader = new FileReader();
    fileReader.onload = function (e) {
      if (debug) {
        const result = e.target!.result;
        if(typeof(result) === 'string') {
          console.log("Got file of length " + result.length);
        } else if(result instanceof ArrayBuffer) {
          console.log("Got file of length " + result.byteLength);
        } else {
          console.log("Got file of unknown type");
        }
      }
      handleBinaryFile(e.target!.result);
    };

    fileReader.readAsArrayBuffer(img);
  }
}

function findEXIFinJPEG(file) {
  const dataView = new DataView(file);

  if (debug) console.log("Got file of length " + file.byteLength);
  if ((dataView.getUint8(0) != 0xFF) || (dataView.getUint8(1) != 0xD8)) {
    if (debug) console.log("Not a valid JPEG");
    return false; // not a valid jpeg
  }

  const length = file.byteLength
  let offset = 2

  while (offset < length) {
    if (dataView.getUint8(offset) != 0xFF) {
      if (debug) console.log("Not a valid marker at offset " + offset + ", found: " + dataView.getUint8(offset));
      return false; // not a valid marker, something is wrong
    }

    const marker = dataView.getUint8(offset + 1);
    if (debug) console.log(marker);

    // we could implement handling for other markers here,
    // but we're only looking for 0xFFE1 for EXIF data

    if (marker == 225) {
      if (debug) console.log("Found 0xFFE1 marker");

      return readEXIFData(dataView, offset + 4);

      // offset += 2 + file.getShortAt(offset+2, true);

    } else {
      offset += 2 + dataView.getUint16(offset + 2);
    }

  }

}

function findIPTCinJPEG(file) {
  const dataView = new DataView(file);

  if (debug) console.log("Got file of length " + file.byteLength);
  if ((dataView.getUint8(0) != 0xFF) || (dataView.getUint8(1) != 0xD8)) {
    if (debug) console.log("Not a valid JPEG");
    return false; // not a valid jpeg
  }

  const length = file.byteLength;
  let offset = 2

  const isFieldSegmentStart = function (dataView, offset) {
    return (
      dataView.getUint8(offset) === 0x38 &&
      dataView.getUint8(offset + 1) === 0x42 &&
      dataView.getUint8(offset + 2) === 0x49 &&
      dataView.getUint8(offset + 3) === 0x4D &&
      dataView.getUint8(offset + 4) === 0x04 &&
      dataView.getUint8(offset + 5) === 0x04
    );
  };

  while (offset < length) {

    if (isFieldSegmentStart(dataView, offset)) {

      // Get the length of the name header (which is padded to an even number of bytes)
      let nameHeaderLength = dataView.getUint8(offset + 7);
      if (nameHeaderLength % 2 !== 0) nameHeaderLength += 1;
      // Check for pre photoshop 6 format
      if (nameHeaderLength === 0) {
        // Always 4
        nameHeaderLength = 4;
      }

      const startOffset = offset + 8 + nameHeaderLength;
      const sectionLength = dataView.getUint16(offset + 6 + nameHeaderLength);

      return readIPTCData(file, startOffset, sectionLength);
    }

    // Not the marker, continue searching
    offset++;
  }
}
function readIPTCData(file, startOffset, sectionLength) {
  const dataView = new DataView(file);
  const data = {};
  let segmentStartPos = startOffset;
  while (segmentStartPos < startOffset + sectionLength) {
    if (dataView.getUint8(segmentStartPos) === 0x1C && dataView.getUint8(segmentStartPos + 1) === 0x02) {
      const segmentType = dataView.getUint8(segmentStartPos + 2);
      if (segmentType in IptcFieldMap) {
        const dataSize = dataView.getInt16(segmentStartPos + 3);
        const fieldName = IptcFieldMap[segmentType];
        const fieldValue = getStringFromDB(dataView, segmentStartPos + 5, dataSize);
        // Check if we already stored a value with this name
        if (data.hasOwnProperty(fieldName)) {
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



function readTags(file, tiffStart, dirStart, strings, bigEnd) {
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

    case 2: // ascii, 8-bit byte
      const offset = numValues > 4 ? valueOffset : (entryOffset + 8);
      return getStringFromDB(file, offset, numValues - 1);

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
function getNextIFDOffset(dataView, dirStart, bigEnd) {
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

function getStringFromDB(buffer, start, length) {
  const outstr: string[] = [];
  for (let n = start; n < start + length; n++) {
    outstr.push(String.fromCharCode(buffer.getUint8(n)));
  }
  return outstr.join("");
}

function readEXIFData(file, start) {
  if (getStringFromDB(file, start, 4) != "Exif") {
    if (debug) console.log("Not valid EXIF data! " + getStringFromDB(file, start, 4));
    return false;
  }

  const tiffOffset = start + 6;
  let bigEnd

  // test for TIFF validity and endianness
  if (file.getUint16(tiffOffset) == 0x4949) {
    bigEnd = false;
  } else if (file.getUint16(tiffOffset) == 0x4D4D) {
    bigEnd = true;
  } else {
    if (debug) console.log("Not valid TIFF data! (no 0x4949 or 0x4D4D)");
    return false;
  }

  if (file.getUint16(tiffOffset + 2, !bigEnd) != 0x002A) {
    if (debug) console.log("Not valid TIFF data! (no 0x002A)");
    return false;
  }

  const firstIFDOffset = file.getUint32(tiffOffset + 4, !bigEnd);

  if (firstIFDOffset < 0x00000008) {
    if (debug) console.log("Not valid TIFF data! (First offset less than 8)", file.getUint32(tiffOffset + 4, !bigEnd));
    return false;
  }

  const tags = readTags(file, tiffOffset, tiffOffset + firstIFDOffset, TiffTags, bigEnd);

  if (tags.ExifIFDPointer) {
    const exifData = readTags(file, tiffOffset, tiffOffset + tags.ExifIFDPointer, ExifTags, bigEnd);
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
    const gpsData = readTags(file, tiffOffset, tiffOffset + tags.GPSInfoIFDPointer, GPSTags, bigEnd);
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
  tags['thumbnail'] = readThumbnailImage(file, tiffOffset, firstIFDOffset, bigEnd);

  return tags;
}

function findXMPinJPEG(file) {

  if (!('DOMParser' in self)) {
    // console.warn('XML parsing not supported without DOMParser');
    return;
  }
  const dataView = new DataView(file);

  if (debug) console.log("Got file of length " + file.byteLength);
  if ((dataView.getUint8(0) != 0xFF) || (dataView.getUint8(1) != 0xD8)) {
    if (debug) console.log("Not a valid JPEG");
    return false; // not a valid jpeg
  }

  let offset = 2
  const length = file.byteLength,
    dom = new DOMParser();

  while (offset < (length - 4)) {
    if (getStringFromDB(dataView, offset, 4) == "http") {
      const startOffset = offset - 1;
      const sectionLength = dataView.getUint16(offset - 2) - 1;
      let xmpString = getStringFromDB(dataView, startOffset, sectionLength)
      const xmpEndIndex = xmpString.indexOf('xmpmeta>') + 8;
      xmpString = xmpString.substring(xmpString.indexOf('<x:xmpmeta'), xmpEndIndex);

      const indexOfXmp = xmpString.indexOf('x:xmpmeta') + 10
      //Many custom written programs embed xmp/xml without any namespace. Following are some of them.
      //Without these namespaces, XML is thought to be invalid by parsers
      xmpString = xmpString.slice(0, indexOfXmp)
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
        + xmpString.slice(indexOfXmp)

      const domDocument = dom.parseFromString(xmpString, 'text/xml');
      return xml2Object(domDocument);
    } else {
      offset++;
    }
  }
}

function xml2json(xml) {
  const json = {};

  if (xml.nodeType == 1) { // element node
    if (xml.attributes.length > 0) {
      json['@attributes'] = {};
      for (const attribute of xml.attributes) {
        json['@attributes'][attribute.nodeName] = attribute.nodeValue;
      }
    }
  } else if (xml.nodeType == 3) { // text node
    return xml.nodeValue;
  }

  // deal with children
  if (xml.hasChildNodes()) {
    for (const child of xml.childNodes) {
      const nodeName = child.nodeName;
      if (json[nodeName] == null) {
        json[nodeName] = xml2json(child);
      } else {
        if (json[nodeName].push == null) {
          const old = json[nodeName];
          json[nodeName] = [];
          json[nodeName].push(old);
        }
        json[nodeName].push(xml2json(child));
      }
    }
  }

  return json;
}

function xml2Object(xml) {
  try {
    const obj = {};
    if (xml.children.length > 0) {
      for (const item of xml.children) {
        const attributes = item.attributes;
        for (const idx in attributes) {
          const itemAtt = attributes[idx];
          const dataKey = itemAtt.nodeName;
          const dataValue = itemAtt.nodeValue;

          if (dataKey !== undefined) {
            obj[dataKey] = dataValue;
          }
        }
        const nodeName = item.nodeName;

        if (typeof (obj[nodeName]) == "undefined") {
          obj[nodeName] = xml2json(item);
        } else {
          if (typeof (obj[nodeName].push) == "undefined") {
            const old = obj[nodeName];

            obj[nodeName] = [];
            obj[nodeName].push(old);
          }
          obj[nodeName].push(xml2json(item));
        }
      }
    } else {
      return xml.textContent;
    }
    return obj;
  } catch (e) {
    console.log(e.message);
  }
}

export const getData = function (img, callback) {
  if (((self.Image && img instanceof self.Image)
    || (self.HTMLImageElement && img instanceof self.HTMLImageElement))
    && !img.complete)
    return false;

  if (!imageHasData(img)) {
    getImageData(img, callback);
  } else {
    if (callback) {
      callback.call(img);
    }
  }
  return true;
}

export const getTag = function (img, tag) {
  if (!imageHasData(img)) return;
  return img.exifdata[tag];
}

export const getIptcTag = function (img, tag) {
  if (!imageHasData(img)) return;
  return img.iptcdata[tag];
}

export const getAllTags = function (img) {
  if (!imageHasData(img)) return {};
  const
    data = img.exifdata,
    tags = {};
  for (const a in data) {
    if (data.hasOwnProperty(a)) {
      tags[a] = data[a];
    }
  }
  return tags;
}

export const getAllIptcTags = function (img) {
  if (!imageHasData(img)) return {};
  const
    data = img.iptcdata,
    tags = {};
  for (const a in data) {
    if (data.hasOwnProperty(a)) {
      tags[a] = data[a];
    }
  }
  return tags;
}

export const pretty = function (img) {
  if (!imageHasData(img)) return "";
  const
    data = img.exifdata,
    strPretty: string[] = [];
  for (const a in data) {
    if (data.hasOwnProperty(a)) {
      if (typeof data[a] == "object") {
        if (isRational(data[a])) {
          const num = data[a].numerator / data[a].denominator;
          strPretty.push(a + " : " + num + " [" + data[a].numerator + "/" + data[a].denominator + "]\r\n");
        } else {
          strPretty.push(a + " : [" + data[a].length + " values]\r\n");
        }
      } else {
        strPretty.push(a + " : " + data[a] + "\r\n");
      }
    }
  }
  return strPretty.join("");
}

export const readFromBinaryFile = function (file) {
  return findEXIFinJPEG(file);
}

