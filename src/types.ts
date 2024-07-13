export type NumDict = Record<number, string>;

export type TagsGroup<T> = {
  type: "iptc" | "exif" | "gps" | "thumbnail";
  rows: T[];
};
