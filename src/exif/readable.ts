import { FlashDict, TagsDict, ValuesDict } from "./constants.ts";
import type { NumDict } from "../types.ts";
import type { Rational, RawTagEntry, RawTagsGroup } from "./raw.ts";

export type ReadableData =
  | null
  | number
  | number[]
  | string
  | string[];

export type ReadableTagEntry = RawTagEntry & {
  tagName?: string;
  data?: ReadableData;
};

function addTagName(rows: ReadableTagEntry[], dict: NumDict) {
  for (const row of rows) {
    const { tag } = row;
    const tagName = dict[tag] ||
      `UnknownTag_0x${tag.toString(16).padStart(4, "0")}`;
    row.tagName = tagName;
  }
  return rows;
}
export function addTagNames(tagsGroup: RawTagsGroup) {
  const { type, rows } = tagsGroup as RawTagsGroup;
  return addTagName(rows, TagsDict[type]);
}
const groups: RawTagsGroup[] = [];
groups.forEach((x) => x.rows.forEach((y) => y.rawData));

export function getReadableData(row: ReadableTagEntry): ReadableData {
  const { tagName, rawData } = row;
  if (tagName === "ExifVersion" || tagName === "FlashpixVersion") {
    return String.fromCharCode(...(rawData as number[]));
  }
  if (tagName === "Flash") {
    const flashBits = (rawData as number[])[0];
    const flashRows = [
      { tagName: "FlashFired", rawData: flashBits & 0x0001 },
      { tagName: "FlashReturn", rawData: (flashBits & 0x0006) >>> 1 },
      { tagName: "FlashMode", rawData: (flashBits & 0x0018) >>> 3 },
      { tagName: "FlashFunction", rawData: (flashBits & 0x0020) >>> 5 },
      { tagName: "FlashRedEyeMode", rawData: (flashBits & 0x0040) >>> 6 },
    ];
    return flashRows.map((x) => {
      const valDict = FlashDict[x.tagName];
      return Object.hasOwn(valDict, x.rawData)
        ? valDict[x.rawData]
        : `UnknownValue_${x.rawData}`;
    });
  }
  if (tagName === "GPSVersionID") {
    return (rawData as number[]).join(".");
  }
  if (typeof rawData === "string") {
    if (
      tagName === "DateTime" || tagName === "DateTimeOriginal" ||
      tagName === "DateTimeDigitized"
    ) {
      const [date, time] = rawData.split(" ");
      const [year, month, day] = date.split(":");
      const [hour, min, sec] = time.split(":");
      const dateObj = new Date(Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(min),
        parseInt(sec),
      ));
      // todo process datetimeoffset
      return dateObj.toISOString().slice(0, -1); // remove 'Z'
    }
    if (tagName === "GPSDateStamp") {
      return rawData.replaceAll(":", "-");
    }
    return rawData;
  }
  if (isRationalArray(rawData)) {
    if (tagName === "GPSLatitude" || tagName === "GPSLongitude") {
      const deg = rawData[0].numerator / rawData[0].denominator;
      const min = rawData[1].numerator / rawData[1].denominator;
      const sec = rawData[2].numerator / rawData[2].denominator;
      return deg + min / 100 + sec / 10000;
    }
    if (tagName === "GPSTimeStamp") {
      const hour = rawData[0].numerator / rawData[0].denominator;
      const hourStr = hour.toString().padStart(2, "0");
      const min = rawData[1].numerator / rawData[1].denominator;
      const minStr = min.toString().padStart(2, "0");
      const sec = rawData[2].numerator / rawData[2].denominator;
      const secStrSplit = sec.toString().split(".");
      const secStr = secStrSplit[0].padStart(2, "0") +
        (secStrSplit[1] ? "." + secStrSplit[1] : "");
      return `${hourStr}:${minStr}:${secStr}`;
    }
    const data = rawData.map((x) => x.numerator / x.denominator);
    return data.length === 1 ? data[0] : data;
  }
  const nums = rawData as number[];
  for (const key in ValuesDict) {
    if (tagName === key) {
      const valDict = ValuesDict[key];
      const data = nums.map((x) =>
        Object.hasOwn(valDict, x) ? valDict[x] : `UnknownValue_${x}`
      );
      return data.length === 1 ? data[0] : data;
    }
  }
  return nums.length === 1 ? nums[0] : null;
}

function isRational(data: unknown): data is Rational {
  return data instanceof Object && Object.hasOwn(data, "numerator") &&
    Object.hasOwn(data, "denominator");
}
function isRationalArray(data: unknown): data is Rational[] {
  return data instanceof Array && data.every(isRational);
}
