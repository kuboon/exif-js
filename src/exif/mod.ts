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

export function getRow<T extends { tagName: string }>(
  tagGroup: TagsGroup<T>[],
  type: string,
  tagName: string,
): T | undefined {
  return tagGroup.find((x) => x.type === type)!.rows.find((x) =>
    x.tagName === tagName
  );
}

export function buildKeyValue<T extends MinimalTagEntry>(
  tags: TagsGroup<T>[],
  ...types: string[]
): Record<string, { data: ReadableData; rawData: RawData }> {
  if (types.length === 0) types = ["exif", "gps", "iptc"];
  const rows: T[] = tags.filter((x) => types.includes(x.type)).flatMap((x) =>
    x.rows
  );
  return buildTagDataKv(rows);
}
