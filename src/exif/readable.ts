import { TagsDict, ValuesDict } from "./constants.ts";
import type { NumDict } from "../types.ts";
import type { Rational, RawTagEntry, RawTagsGroup } from "./raw.ts";

export type ReadableData =
  | null
  | number
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
  if (tagName === "ComponentsConfiguration") {
    const valDict = ValuesDict["Components"];
    const data_ = (rawData as number[]).map((val) =>
      valDict[val] || `UnknownValue_${val}`
    );
    return data_;
  }
  if (tagName === "GPSVersionID") {
    return (rawData as number[]).join(".");
  }
  if (typeof rawData === "string") {
    // todo process dates and datetimeoffset
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
      const min = rawData[1].numerator / rawData[1].denominator;
      const sec = rawData[2].numerator / rawData[2].denominator;
      return `${hour}:${min}:${sec}`;
    }
    return rawData.map((x) => x.numerator / x.denominator).reduce((a, b) =>
      a + b
    );
  }
  const nums = rawData as number[];
  for (const key in ValuesDict) {
    if (tagName === key) {
      const valDict = ValuesDict[key];
      const data = nums.map((x) => valDict[x] || `UnknownValue_${x}`);
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
