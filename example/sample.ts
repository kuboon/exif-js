import { getBufFromImgElem } from "../src/frontend.ts";
import { exif, getXMPinJPEG } from "../src/mod.ts";

function getExif() {
  {
    const img = document.getElementById("img1") as HTMLImageElement;
    const buf = getBufFromImgElem(img);
    const ret = exif.getEXIFminimalTagsInJPEG(buf);
    if (ret === null) {
      console.error("Failed to get buffer from img1");
      return;
    }
    const kv1 = exif.buildKeyValue(ret.tags);
    document.getElementById("makeAndModel")!.innerText = kv1["Make"] + " " +
      kv1["Model"];
  }
  {
    const img = document.getElementById("img2") as HTMLImageElement;
    const buf = getBufFromImgElem(img);
    const ret = exif.getEXIFminimalTagsInJPEG(buf);
    if (ret === null) {
      console.error("Failed to get buffer from img2");
      return;
    }
    const kv1 = exif.buildKeyValue(ret.tags);
    document.getElementById("allMetaDataSpan")!.innerText = JSON.stringify(
      kv1,
      null,
      "\t",
    );
  }
  {
    const img = document.getElementById("img3") as HTMLImageElement;
    const buf = getBufFromImgElem(img);
    const xmp = getXMPinJPEG(buf);
    if (xmp === null) {
      console.error("Failed to get buffer from img2");
      return;
    }
    document.getElementById("img3WithXmpMetaData")!.innerText = xmp;
  }
}
getExif();
