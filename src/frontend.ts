export async function getArrayBufferFrom(
  something: HTMLImageElement | HTMLInputElement | URL | string | Blob,
): Promise<ArrayBuffer> {
  let blob: Blob | undefined;
  if (something instanceof HTMLImageElement) {
    blob = await fetch(something.src).then((x) => x.blob());
  } else if (something instanceof HTMLInputElement) {
    blob = something.files![0];
  } else if (something instanceof URL) {
    blob = await fetch(something.href).then((x) => x.blob());
  } else if (typeof something === "string") {
    const url = URL.parse(something);
    if (url) {
      blob = await fetch(url.href).then((x) => x.blob());
    }
  } else if (something instanceof Blob) {
    blob = something;
  }
  if (!blob) {
    throw new Error(
      "Invalid argument. Expected HTMLImageElement | HTMLInputElement(type=file) | URL | string | Blob",
    );
  }
  return blob.arrayBuffer();
}
