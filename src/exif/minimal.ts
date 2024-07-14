import type { ReadableData, ReadableTagEntry } from "./readable.ts";
import type { RawData } from "./raw.ts";
import { equal } from "@std/assert";

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
    const existing = kv[tagName];
    if (existing && !equal(existing.rawData, rawData)) {
      throw new Error(`Duplicate tag name has defferent rawData: ${tagName}`);
    }
    kv[tagName] = { data, rawData };
  });
  return kv;
}
