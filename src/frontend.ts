import { type Rational, findEXIFinJPEG, findIPTCinJPEG, findXMPinJPEG } from "./core";

export let isXmpEnabled = false;
export let debug = false;

export const getData = function (img, callback) {
  if (((self.Image && img instanceof self.Image)
    || (self.HTMLImageElement && img instanceof self.HTMLImageElement))
    && !img.complete)
    return false;

  if (!imageHasData(img)) {
    getImageData(img, callback);
  } else {
    if (callback) {
      callback.call(img);
    }
  }
  return true;
}

export const getTag = function (img, tag) {
  if (!imageHasData(img)) return;
  return img.exifdata[tag];
}

export const getIptcTag = function (img, tag) {
  if (!imageHasData(img)) return;
  return img.iptcdata[tag];
}

export const getAllTags = function (img) {
  if (!imageHasData(img)) return {};
  const
    data = img.exifdata,
    tags = {};
  for (const a in data) {
    if (data.hasOwnProperty(a)) {
      tags[a] = data[a];
    }
  }
  return tags;
}

export const getAllIptcTags = function (img) {
  if (!imageHasData(img)) return {};
  const
    data = img.iptcdata,
    tags = {};
  for (const a in data) {
    if (data.hasOwnProperty(a)) {
      tags[a] = data[a];
    }
  }
  return tags;
}

export const pretty = function (img) {
  if (!imageHasData(img)) return "";
  const
    data = img.exifdata,
    strPretty: string[] = [];
  for (const a in data) {
    if (data.hasOwnProperty(a)) {
      if (typeof data[a] == "object") {
        if (isRational(data[a])) {
          const num = data[a].numerator / data[a].denominator;
          strPretty.push(a + " : " + num + " [" + data[a].numerator + "/" + data[a].denominator + "]\r\n");
        } else {
          strPretty.push(a + " : [" + data[a].length + " values]\r\n");
        }
      } else {
        strPretty.push(a + " : " + data[a] + "\r\n");
      }
    }
  }
  return strPretty.join("");
}

function isRational(value: any): value is Rational {
  return typeof value.numerator === 'bigint' && typeof value.denominator === 'bigint';
}

function imageHasData(img) {
  return !!(img.exifdata);
}
function base64ToArrayBuffer(base64, contentType = null) {
  contentType = contentType || base64.match(/^data\:([^\;]+)\;base64,/mi)[1] || ''; // e.g. 'data:image/jpeg;base64,...' => 'image/jpeg'
  base64 = base64.replace(/^data\:([^\;]+)\;base64,/gmi, '');
  const binary = atob(base64);
  const len = binary.length;
  const buffer = new ArrayBuffer(len);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < len; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function objectURLToBlob(url, callback) {
  const http = new XMLHttpRequest();
  http.open("GET", url, true);
  http.responseType = "blob";
  http.onload = function (e) {
    if (this.status == 200 || this.status === 0) {
      callback(this.response);
    }
  };
  http.send();
}

function getImageData(img, callback) {
  function handleBinaryFile(binFile) {
    const data = findEXIFinJPEG(binFile);
    img.exifdata = data || {};
    const iptcdata = findIPTCinJPEG(binFile);
    img.iptcdata = iptcdata || {};
    if (isXmpEnabled) {
      const xmpdata = findXMPinJPEG(binFile);
      img.xmpdata = xmpdata || {};
    }
    if (callback) {
      callback.call(img);
    }
  }

  if (img.src) {
    if (/^data\:/i.test(img.src)) { // Data URI
      const arrayBuffer = base64ToArrayBuffer(img.src);
      handleBinaryFile(arrayBuffer);

    } else if (/^blob\:/i.test(img.src)) { // Object URL
      const fileReader = new FileReader();
      fileReader.onload = function (e) {
        handleBinaryFile(e.target!.result);
      };
      objectURLToBlob(img.src, function (blob) {
        fileReader.readAsArrayBuffer(blob);
      });
    } else {
      const http = new XMLHttpRequest();
      http.onload = function () {
        if (this.status == 200 || this.status === 0) {
          handleBinaryFile(http.response);
        } else {
          throw "Could not load image";
        }
      };
      http.open("GET", img.src, true);
      http.responseType = "arraybuffer";
      http.send(null);
    }
  } else if (self.FileReader && (img instanceof self.Blob || img instanceof self.File)) {
    const fileReader = new FileReader();
    fileReader.onload = function (e) {
      if (debug) {
        const result = e.target!.result;
        if(typeof(result) === 'string') {
          console.log("Got file of length " + result.length);
        } else if(result instanceof ArrayBuffer) {
          console.log("Got file of length " + result.byteLength);
        } else {
          console.log("Got file of unknown type");
        }
      }
      handleBinaryFile(e.target!.result);
    };

    fileReader.readAsArrayBuffer(img);
  }
}
