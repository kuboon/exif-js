import { assertEquals } from "@std/assert";
import { getEXIFinJPEG } from "./src/exif.ts";
import { getIPTCinJPEG } from "./src/iptc.ts";
import { getXMPinJPEG } from "./src/xmp.ts";

const testjpg = new URL("./spec/test.jpg", import.meta.url);
const bin = await Deno.readFile(testjpg);
Deno.test("findEXIFinJPEG", () => {
  const ret = getEXIFinJPEG(bin.buffer)!;
  assertEquals(Object.keys(ret).length, 45)
  assertEquals(ret["ExifVersion"], "0230");
  console.log(ret);
});
Deno.test("findIPTCinJPEG", () => {
  const ret = getIPTCinJPEG(bin.buffer)!;
  assertEquals(Object.keys(ret).length, 10)
  console.log(ret);
});
Deno.test("findXMPinJPEG", () => {
  const ret = getXMPinJPEG(bin.buffer)?.toString()!
  assertEquals(ret.length, 25712);
  console.log(ret.slice(0, 300));
  console.log("...")
  console.log(ret.slice(-300));
});
