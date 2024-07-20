import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { getEXIFrawTagsInJPEG, type Rational } from "../src/exif/raw.ts";
import {
  buildKeyValue,
  getEXIFenrichedTagsInJPEG,
  getEXIFminimalTagsInJPEG,
  getRow,
} from "../src/exif/mod.ts";
import { getIPTCinJPEG } from "../src/iptc.ts";
import { getXMPinJPEG } from "../src/xmp.ts";

const testjpg = new URL("../spec/test.jpg", import.meta.url);
// const testjpg = new URL("./spec/cambodia-wheelchair.jpg", import.meta.url);
const bin = await Deno.readFile(testjpg);

Deno.test({
  name: "getEXIFrawTagsInJPEG",
  fn: () => {
    const ret = getEXIFrawTagsInJPEG(bin.buffer)!;
    assert(ret);

    const { tags, thumbnailBlob } = ret;
    assertEquals(tags.length, 4);
    const tiffRows = tags.find((x) => x.type === "tiff")!.rows;
    assertEquals(tiffRows.length, 10);
    const XResolutionRow = tiffRows.find((x) => x.tag === 282)!;
    assertEquals((XResolutionRow.rawData[0] as Rational).numerator, 300);

    const exifRows = tags.find((x) => x.type === "exif")!.rows;
    assertEquals(exifRows.length, 25);
    const gpsRows = tags.find((x) => x.type === "gps")!.rows;
    assertEquals(gpsRows.length, 7);
    const thumbnailRows = tags.find((x) => x.type === "thumbnail")!.rows;
    assertEquals(thumbnailRows.length, 4);

    assert(thumbnailBlob);
    // console.log(ret);
  },
});
Deno.test({
  name: "getEXIFenrichedTagsInJPEG",
  fn: () => {
    const ret = getEXIFenrichedTagsInJPEG(bin.buffer);
    assert(ret);

    const { tags, thumbnailBlob } = ret;
    assertEquals(tags.length, 4);
    const tiffRows = tags.find((x) => x.type === "tiff")!.rows;
    assertEquals(tiffRows.length, 10);
    const XResolutionRow = tiffRows.find((x) => x.tag === 282)!;
    assertEquals(XResolutionRow.data, 300);

    const exifRows = tags.find((x) => x.type === "exif")!.rows;
    assertEquals(exifRows.length, 25);
    const gpsRows = tags.find((x) => x.type === "gps")!.rows;
    assertEquals(gpsRows.length, 7);
    const thumbnailRows = tags.find((x) => x.type === "thumbnail")!.rows;
    assertEquals(thumbnailRows.length, 4);

    assert(thumbnailBlob);
    // console.log(ret);
  },
});
Deno.test({
  name: "getEXIFminimalTagsInJPEG",
  fn: () => {
    const ret = getEXIFminimalTagsInJPEG(bin.buffer);
    assert(ret);
    // console.log(getRow(ret.tags, "tiff", "XResolution"));
    // console.log(getRow(ret.tags, "thumbnail", "XResolution"));
  },
});
Deno.test({
  name: "buildKeyValue",
  fn: () => {
    const ret = getEXIFminimalTagsInJPEG(bin.buffer);
    assert(ret);
    const kv = buildKeyValue(ret.tags);
    assertEquals(Object.keys(kv).length, 42);
    // console.log(kv);
  },
});

Deno.test("getIPTCinJPEG", () => {
  const ret = getIPTCinJPEG(bin.buffer);
  assert(ret);
  assertEquals(Object.keys(ret).length, 10);
  assertStrictEquals(
    ret["copyright"],
    "© Copyright 2017 Carl Seibert  metadatamatters.blog (IIM)",
  );
  // console.log(ret);
});

Deno.test("getXMPinJPEG", () => {
  const ret = getXMPinJPEG(bin.buffer);
  assert(ret);
  assertEquals(ret.length, 25712);
  {
    const keyword = "<rdf:RDF xmlns:rdf=";
    assertStrictEquals(ret.slice(0, keyword.length), keyword);
  }
  {
    const keyword = "</rdf:RDF>";
    assertStrictEquals(ret.slice(-keyword.length), keyword);
  }
});
