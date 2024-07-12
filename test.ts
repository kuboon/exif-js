import { assert, assertEquals } from "@std/assert";
import { getEXIFrawTagsInJPEG } from "./src/exif/raw.ts";
import { getEXIFinJPEG, type NumberWithRational } from "./src/exif/prettify.ts";
import { getIPTCinJPEG } from "./src/iptc.ts";
import { getXMPinJPEG } from "./src/xmp.ts";

const testjpg = new URL("./spec/test.jpg", import.meta.url);
const bin = await Deno.readFile(testjpg);

Deno.test({
  name: "getEXIFrawTagsInJPEG",
  fn: () => {
    const ret = getEXIFrawTagsInJPEG(bin.buffer)!;
    // assertEquals(Object.keys(ret).length, 45)
    // assertEquals(ret["ExifVersion"], "0230");
    console.log(ret);
  }
})
Deno.test({
  name: "getEXIFinJPEG",
  fn: () => {
    const ret = getEXIFinJPEG(bin.buffer)!;
    assert(ret)

    const { tags } = ret;

    assert(tags.tiff)
    assert(Object.keys(tags.exif).length > 0);
    assert(Object.keys(tags.gps).length > 0);
    assert(Object.keys(tags.thumbnail).length > 0);
    assert(ret.thumbnailBlob)
    assertEquals((tags.tiff["XResolution"] as NumberWithRational).number, 300);
    console.log(ret);
  }
});
Deno.test("getIPTCinJPEG", () => {
  const ret = getIPTCinJPEG(bin.buffer)!;
  assertEquals(Object.keys(ret).length, 10)
  console.log(ret);
});
Deno.test("getXMPinJPEG", () => {
  const ret = getXMPinJPEG(bin.buffer)?.toString()!
  assertEquals(ret.length, 25712);
  console.log(ret.slice(0, 300));
  console.log("...")
  console.log(ret.slice(-300));
});
