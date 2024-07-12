import type { NumDict } from "./types.ts";
import {
  getJpegDataView,
  getPartialString,
  scanPartialDataView,
} from "./dataview.ts";

export const IptcFieldMap: NumDict = {
  0x78: "caption",
  0x6E: "credit",
  0x19: "keywords",
  0x37: "dateCreated",
  0x50: "byline",
  0x55: "bylineTitle",
  0x7A: "captionWriter",
  0x69: "headline",
  0x74: "copyright",
  0x0F: "category",
};

export function getIPTCinJPEG(file: ArrayBufferLike) {
  const jpeg = getJpegDataView(file);
  if (!jpeg) return null;

  const iptc = scanPartialDataView(
    jpeg.v,
    new Uint8Array([0x38, 0x42, 0x49, 0x4D, 0x04, 0x04]),
  );
  if (!iptc) return null;
  let nameHeaderLength = iptc.getUint8(7);
  if (nameHeaderLength % 2 !== 0) nameHeaderLength += 1;
  // Check for pre photoshop 6 format
  if (nameHeaderLength === 0) {
    // Always 4
    nameHeaderLength = 4;
  }

  const startOffset = 8 + nameHeaderLength + 8;
  const sectionLength = iptc.getUint16(nameHeaderLength + 6);

  return readIPTCData(
    new DataView(iptc.buffer, iptc.byteOffset + startOffset, sectionLength),
  );
}

function readIPTCData(dataView: DataView) {
  const data: Record<string, string | string[]> = {};
  let segmentStartPos = 0;
  while (segmentStartPos < dataView.byteLength) {
    if (
      dataView.getUint8(segmentStartPos) === 0x1C &&
      dataView.getUint8(segmentStartPos + 1) === 0x02
    ) {
      const segmentType = dataView.getUint8(segmentStartPos + 2);
      if (segmentType in IptcFieldMap) {
        const dataSize = dataView.getInt16(segmentStartPos + 3);
        const fieldName = IptcFieldMap[segmentType];
        const fieldValue = getPartialString(dataView, {
          offset: segmentStartPos + 5,
          length: dataSize,
        })!;
        // Check if we already stored a value with this name
        if (Object.hasOwn(data, fieldName)) {
          // Value already stored with this name, create multivalue field
          const val = data[fieldName];
          if (val instanceof Array) {
            val.push(fieldValue);
          } else {
            data[fieldName] = [val, fieldValue];
          }
        } else {
          data[fieldName] = fieldValue;
        }
      }
    }
    segmentStartPos++;
  }
  return data;
}
