export type NumDict = Record<number, string>;

export type TagsGroup<T> = {
  type: "tiff" | "exif" | "gps" | "thumbnail";
  rows: T[];
};
