import type { TagsGroup } from "../types.ts";
import {
  addTagNames,
  getReadableData,
  type ReadableData,
  type ReadableTagEntry,
} from "./readable.ts";
import {
  buildTagDataKv,
  minimalizeTagEntry,
  type MinimalTagEntry,
} from "./minimal.ts";
import { getEXIFrawTagsInJPEG, type RawData } from "./raw.ts";

export { getEXIFrawTagsInJPEG };

/**
 * Run `getEXIFrawTagsInJPEG` then tagName: string and data for easy reading.
 * `data` is human-frendly but type is a little complicated `ReadableData`.
 * Any raw data remains.
 *
 * @param buf
 * @returns
 */
export function getEXIFenrichedTagsInJPEG(
  buf: ArrayBufferLike,
): { tags: TagsGroup<ReadableTagEntry>[]; thumbnailBlob: Blob | null } | null {
  const rawTags = getEXIFrawTagsInJPEG(buf);
  if (!rawTags) return null;
  const { tags, thumbnailBlob } = rawTags;
  for (const tagGroup of tags) {
    const tagNamedRows = addTagNames(tagGroup);
    for (const tag of tagNamedRows) {
      const data = getReadableData(tag);
      tag.data = data;
    }
  }
  return { tags: tags as TagsGroup<ReadableTagEntry>[], thumbnailBlob };
}

/**
 * Run `getEXIFenrichedTagsInJPEG` then remove some columns.
 * @param buf
 * @returns
 */
export function getEXIFminimalTagsInJPEG(
  buf: ArrayBufferLike,
): { tags: TagsGroup<MinimalTagEntry>[]; thumbnailBlob: Blob | null } | null {
  const enrichedTags = getEXIFenrichedTagsInJPEG(buf);
  if (!enrichedTags) return null;
  const { tags } = enrichedTags;
  const minimalTags = tags.map((tagGroup) => {
    const { type, rows } = tagGroup;
    const minimized = rows.map(minimalizeTagEntry);
    return { type, rows: minimized };
  });
  return {
    tags: minimalTags as TagsGroup<MinimalTagEntry>[],
    thumbnailBlob: enrichedTags.thumbnailBlob,
  };
}

/**
 * Get a row from `tags` by `type` and `tagName`.
 * @example
 * ```ts
 * const ret = getEXIFminimalTagsInJPEG(buf);
 * const row = getRow(ret.tags, "exif", "DateTimeOriginal");
 * console.log(row.data, row.rawData);
 * ```
 * @param tagGroup
 * @param type
 * @param tagName
 * @returns
 */
export function getRow<T extends { tagName: string }>(
  tagGroup: TagsGroup<T>[],
  type: string,
  tagName: string,
): T | undefined {
  return tagGroup.find((x) => x.type === type)!.rows.find((x) =>
    x.tagName === tagName
  );
}

/**
 * Build basic JS object by key = `tagName` and value = { data, rawData }.
 *
 * By default, 'iptc', 'exif', 'gps' TagGroup are all included.
 *
 * 'thumbnail' TagGroup is not included by default because some tags
 * like `XResolution` conflicts with `iptc` TagGroup.
 *
 * @example Basic usage
 * ```ts
 * const ret = getEXIFminimalTagsInJPEG(buf);
 * const kv = buildKeyValue(ret.tags);
 * ```
 *
 * @example Get only 'exif' and 'gps' TagGroup
 * ```ts
 * const kv = buildKeyValue(ret.tags, "exif", "gps");
 * ```
 *
 * @example Get thumbnail tags
 * ```ts
 * const kv = buildKeyValue(ret.tags, "thumbnail");
 * ```
 * @param tags
 * @param types
 * @returns
 */
export function buildKeyValue<T extends MinimalTagEntry>(
  tags: TagsGroup<T>[],
  ...types: string[]
): Record<string, { data: ReadableData; rawData: RawData }> {
  if (types.length === 0) types = ["iptc", "exif", "gps"];
  const rows: T[] = tags.filter((x) => types.includes(x.type)).flatMap((x) =>
    x.rows
  );
  return buildTagDataKv(rows);
}
