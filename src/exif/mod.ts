import type { TagsGroup } from "../types.ts";
import {
  addTagNames,
  getReadableData,
  type ReadableTagEntry,
} from "./readable.ts";
import { buildTagDataKv, minimalizeTagEntry } from "./minimal.ts";
import { getEXIFrawTagsInJPEG } from "./raw.ts";

export { getEXIFrawTagsInJPEG };

export function getEXIFenrichedTagsInJPEG(buf: ArrayBufferLike) {
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

export function getEXIFminimalTagsInJPEG(buf: ArrayBufferLike) {
  const enrichedTags = getEXIFenrichedTagsInJPEG(buf);
  if (!enrichedTags) return null;
  const { tags } = enrichedTags;
  const minimalTags = tags.map((tagGroup) => {
    const { type, rows } = tagGroup;
    const minimized = rows.map(minimalizeTagEntry);
    return { type, rows: minimized };
  });
  return { tags: minimalTags, thumbnailBlob: enrichedTags.thumbnailBlob };
}

export function getEXIFflatKVInJPEG(buf: ArrayBufferLike) {
  const minimalTags = getEXIFminimalTagsInJPEG(buf);
  if (!minimalTags) return null;
  const { tags } = minimalTags;
  // use buildTagDataKv
  const kv = buildTagDataKv(tags.flatMap((x) => x.rows));
  return { kv, thumbnailBlob: minimalTags.thumbnailBlob };
}
