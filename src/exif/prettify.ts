import { ExifTags, GPSTags, TiffTags, IFD1Tags, StringValues } from "./constants.ts";
import { type NumDict } from "../types.ts";
import { type Rational, type RawData, type RawTagEntry, getEXIFrawTagsInJPEG } from "./raw.ts";

export type NumberWithRational = Rational & { number: number };
export type PrettifyedData = string | number | NumberWithRational | (number | NumberWithRational)[];
export type PrettifyedTagEntry = { tagName: string, data: PrettifyedData };

export function addNumberToRational(data: RawData) {
  if (typeof data === "string") return data;
  for (const val of data) {
    if (typeof val === "number") continue;
    if (isRational(val)) {
      Object.assign(val, { number: val.numerator / val.denominator })
    }
  }
  return data as (number | NumberWithRational)[]
}

export function stringifyTags(rows: RawTagEntry[], dict: NumDict) {
  return rows.map((row) => {
    const { tag, data } = row;
    const tagName = dict[tag] || `UnknownTag_0x${tag.toString(16).padStart(4, "0")}`;
    return { tagName, data }
  })
}
export function extractFlashBits(exifTags: { tagName: string, data: RawData }[]) {
  const flashTagIndex = exifTags.findIndex(e => e.tagName === 'Flash')
  if (flashTagIndex == -1) return;
  const flash = exifTags[flashTagIndex].data as number[];
  const flashBits = flash[0];
  const flashRows = [
    { tagName: 'FlashFired', data: (flashBits & 0x0001) ? 'No' : 'Yes' },
    { tagName: 'FlashReturn', data: [(flashBits & 0x0006) >> 1] },
    { tagName: 'FlashMode', data: [(flashBits & 0x0018) >> 3] },
    { tagName: 'FlashFunction', data: (flashBits & 0x0020) ? 'Yes' : 'No' },
    { tagName: 'FlashRedEyeMode', data: (flashBits & 0x0040) ? 'No' : 'Yes' },
  ]
  exifTags.splice(flashTagIndex, 1, ...flashRows);
}
export function stringifySomeData(rows: { tagName: string, data: RawData }[], dict: NumDict) {
  return rows.map((row) => {
    const { tagName, data } = row;
    if (tagName === 'ExifVersion' || tagName === 'FlashpixVersion') {
      return { tagName, data: String.fromCharCode(...(data as number[])) };
    }
    // if (tagName === 'ComponentsConfiguration') {
    //   const valDict = StringValues['Components'];
    //   const data_ = (data as number[]).map((val) => valDict[val] || `UnknownValue_${val}`);
    //   return { tagName, data: data_ };
    // }
    if (tagName === 'GPSVersionID') {
      return { tagName, data: (data as number[]).join('.') };
    }
    for (const key in StringValues) {
      if (tagName === key) {
        const valDict = StringValues[key];
        return { tagName, data: valDict[data[0] as number] || `UnknownValue_${data[0]}` };
      }
    }
    return { tagName, data }
  })
}

export function flattenOneElemArray(data: string | (number | NumberWithRational)[]): PrettifyedData {
  if (data instanceof Array) {
    if (data.length === 1) return data[0]
  }
  return data
}

export function buildTagDataKv(rawTags: PrettifyedTagEntry[]) {
  const kv: Record<string, PrettifyedData> = {};
  rawTags.forEach((row) => {
    const { tagName, data } = row;
    if (Object.hasOwn(kv, tagName)) {
      throw new Error("Duplicate tag name")
    } else {
      kv[tagName] = data;
    }
  });
  return kv;
}
export function prettifyAllData(rows_: RawTagEntry[], dict: NumDict): PrettifyedTagEntry[] {
  const nameTaggedRows = stringifyTags(rows_, dict);
  extractFlashBits(nameTaggedRows);
  const stringifiedRows = stringifySomeData(nameTaggedRows, dict);
  return stringifiedRows.map((row) => {
    const { tagName, data } = row;

    const dataWithNumber = addNumberToRational(data);
    return { tagName, data: flattenOneElemArray(dataWithNumber) };
  })
}
export function getEXIFinJPEG(buf: ArrayBufferLike) {
  const rawTags = getEXIFrawTagsInJPEG(buf);
  if (!rawTags) return false;
  const { tiffTags, exifTags, gpsTags, thumbnailTags, thumbnailBlob } = rawTags;

  const tiffTagsKv = buildTagDataKv(prettifyAllData(tiffTags, TiffTags))
  const exifTagsKv = buildTagDataKv(prettifyAllData(exifTags, ExifTags));
  const gpsTagsKv = buildTagDataKv(prettifyAllData(gpsTags, GPSTags));
  const thumbnailTagsKv = buildTagDataKv(prettifyAllData(thumbnailTags, IFD1Tags));
  return {
    tiffTags: tiffTagsKv,
    exifTags: exifTagsKv,
    gpsTags: gpsTagsKv,
    thumbnailTags: thumbnailTagsKv,
    thumbnailBlob
  }
}

function isRational(data: unknown): data is Rational {
  return data instanceof Object && Object.hasOwn(data, "numerator") && Object.hasOwn(data, "denominator");
}
