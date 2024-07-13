import type { ReadableData, ReadableTagEntry } from "./readable.ts";
import type { RawData } from "./raw.ts";

export type MinimalTagEntry = {
  tagName: string;
  data: ReadableData;
  rawData: RawData;
};

export function minimalizeTagEntry(tag: ReadableTagEntry): MinimalTagEntry {
  const { tagName, data, rawData } = tag;
  return { tagName: tagName!, data: data!, rawData };
}

export function buildTagDataKv(rawTags: MinimalTagEntry[]) {
  const kv: Record<string, { data: ReadableData; rawData: RawData }> = {};
  rawTags.forEach((row) => {
    const { tagName, data, rawData } = row;
    if (Object.hasOwn(kv, tagName!)) {
      throw new Error("Duplicate tag name");
    } else {
      kv[tagName] = { data, rawData };
    }
  });
  return kv;
}
