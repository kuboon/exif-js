import { assertEquals } from "@std/assert";
import { findEXIFinJPEG, findIPTCinJPEG, findXMPinJPEG } from "./src/core.ts";

const testjpg = new URL("./spec/test.jpg", import.meta.url);
const bin = await Deno.readFile(testjpg);
Deno.test("findEXIFinJPEG", () => {
  const ret = findEXIFinJPEG(bin.buffer)!;
  assertEquals(Object.keys(ret).length, 45)
  console.log(ret);
});
Deno.test("findIPTCinJPEG", () => {
  const ret = findIPTCinJPEG(bin.buffer)!;
  assertEquals(Object.keys(ret).length, 10)
  console.log(ret);
});
Deno.test("findXMPinJPEG", () => {
  const ret = findXMPinJPEG(bin.buffer)?.toString()!
  assertEquals(ret.length, 25712);
  console.log(ret.slice(0, 300));
  console.log("...")
  console.log(ret.slice(-300));
});
