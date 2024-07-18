# @kuboon/exif

A JavaScript library for reading
[EXIF meta data](https://en.wikipedia.org/wiki/Exchangeable_image_file_format)
from image files.

This repo is forked from [Exif.js](https://github.com/exif-js/exif-js) but
almost all codes are rewritten. There is no API compatibility with the original
exif-js. (PullRequest of `exif-js.compat.js` is welcome.)

## Overview

### `frontend` module

- `getArrayBufferFrom`: Get ArrayBuffer from various sources.

### `exif` module
Extracts EXIF metadata from JPEG ArrayBuffer,
including 4 TagGroups: 'tiff', 'exif', 'gps', 'thumbnail' and `thumbnailBlob`.

- `getEXIFrawTagsInJPEG`: Get raw EXIF data from ArrayBuffer of JPEG image.
  Includes 4 `RawTagsGroup` and a `thumbnailBlob`.
- `getEXIFenrichedTagsInJPEG`: Add human-readable values to
  `getEXIFrawTagsInJPEG`.
- `getEXIFminimalTagsInJPEG`: Get minimal EXIF tags from ArrayBuffer of JPEG
  image.
- `buildKeyValue`: Build key-value object from minimal EXIF tags.

**Note**: The EXIF standard applies only to `.jpg` and `.tiff` images. EXIF
logic in this package is based on the EXIF standard v2.2
([JEITA CP-3451, included in this repo](/spec/Exif2-2.pdf)).


@example Basic exif access by key-value
```ts
import { exif } from "@kuboon/exif";
const buf = await Deno.readFile("image.jpg");

// `tags` contains 4 groups: 'tiff', 'exif', 'gps', 'thumbnail'
const {tags, thumbnailBlob} = exif.getEXIFenrichedTagsInJPEG(buf)!;

// By default, 'tiff', 'exif', 'gps' TagGroup are all included.
const kv = exif.buildKeyValue(tags);
console.log(kv["DateTimeOriginal"]!.data);
```

@example Get 'thumbnail' key-value
Because some tags like `XResolution` conflicts with `tiff` TagGroup,
You can get 'thumbnail' TagGroup separately.
```ts
const kv = exif.buildKeyValue(tags, 'thumbnail');
console.log(kv["XResolution"]!.data);
```

@example Low-level row access
```ts
import { exif } from "@kuboon/exif";
const buf = await Deno.readFile("image.jpg");
const {tags, thumbnailBlob} = exif.getEXIFenrichedTagsInJPEG(buf)!;
console.log(exif.getRow(tags, "exif", "DateTimeOriginal")!.data);
```

### `getIPTCinJPEG`

Find "IPTC header" in jpeg binary and extract key-value pairs.

https://en.wikipedia.org/wiki/International_Press_Telecommunications_Council

### `getXMPinJPEG`

Scan `<?xpacket begin="?" id="W5M0MpCehiHzreSzNTczkc9d"?>` in jpeg binary and
return XML string. (Not parsed)

https://en.wikipedia.org/wiki/Extensible_Metadata_Platform

## Install and use on server

Totally different from the original exif-js. see https://jsr.io/@kuboon/exif for
more details.

Install `@kuboon/exif` through [jsr.io](https://jsr.io/@kuboon/exif).

    # deno
    deno add @kuboon/exif

    # node.js
    npx jsr add @kuboon/exif

## For browser

You can import frontend module from `esm.sh/jsr` (not documented on released
version yet,
[but it works](https://github.com/esm-dev/esm.sh/commit/32cd2bd931f33118cbc96ee89583f20718c58fbf)).

`getArrayBufferFrom` accepts one of `HTMLImageElement`, `HTMLInputElement` (with
type="file"), `URL`, url `string`, `Blob` (or `File`) and returns ArrayBuffer.
Then you can do same as server side.

```html
<script type="module">
  import { getArrayBufferFrom } from "https://esm.sh/jsr/@kuboon/exif@0.1.2/frontend";
  import { exif } from "https://esm.sh/jsr/@kuboon/exif@0.1.2?exports=exif";

  const fileInput = document.getElementById("file-input");
  fileInput.addEventListener("change", async (e) => {
    const buf = await getArrayBufferFrom(fileInput);
    const ret = exif.getEXIFminimalTagsInJPEG(buf);
    if (ret === null) {
      /** @type {FileList} */
      const files = e.target.files;
      alert("No EXIF data found in image '" + files[0].name + "'.");
      return;
    }
    const kv = exif.buildKeyValue(ret.tags);
    alert(JSON.stringify(kv, null, "\t"));
  });
</script>
<input type="file" id="file-input" />
```

## Contributions

Please feel free to open an issue or submit a pull request. I'm happy to review
and merge them (until I lose interest for this repo).

You need `deno test` for local testing. https://deno.com
