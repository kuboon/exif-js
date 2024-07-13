import type { ReadableTagEntry } from "./readable.ts";

export function extractFlashBits(
  exifTags: ReadableTagEntry[],
) {
  const flashTagIndex = exifTags.findIndex((e) => e.tagName === "Flash");
  if (flashTagIndex == -1) return;
  const flash = exifTags[flashTagIndex].rawData as number[];
  const flashBits = flash[0];
  const flashRows = [
    { tagName: "FlashFired", rawData: [flashBits & 0x0001] },
    { tagName: "FlashReturn", rawData: [(flashBits & 0x0006) >>> 1] },
    { tagName: "FlashMode", rawData: [(flashBits & 0x0018) >>> 3] },
    { tagName: "FlashFunction", rawData: [(flashBits & 0x0020) >>> 5] },
    { tagName: "FlashRedEyeMode", rawData: [(flashBits & 0x0040) >>> 6] },
  ];
  return flashRows;
}
