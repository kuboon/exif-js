import { getJpegDataView, getPartialString, scanPartialDataView } from "./dataview.ts";

export function getXMPinJPEG(file: ArrayBufferLike, fixXmlNs = false) {
  const jpeg = getJpegDataView(file);
  if (!jpeg) return false

  const xpacketId = new TextEncoder().encode("W5M0MpCehiHzreSzNTczkc9d")
  const xpacketDataView = scanPartialDataView(jpeg.v, xpacketId)
  if (!xpacketDataView) return null;

  const rdfTag = { from: "<rdf:RDF ", to: "</rdf:RDF>" }
  const xmpString = getPartialString(xpacketDataView, rdfTag)
  if (!xmpString) return null;
  if (!fixXmlNs) { return xmpString; }

  return xmpString.replace(rdfTag.from, rdfTag.from +
    + 'xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/" '
    + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
    + 'xmlns:tiff="http://ns.adobe.com/tiff/1.0/" '
    + 'xmlns:plus="http://schemas.android.com/apk/lib/com.google.android.gms.plus" '
    + 'xmlns:ext="http://www.gettyimages.com/xsltExtension/1.0" '
    + 'xmlns:exif="http://ns.adobe.com/exif/1.0/" '
    + 'xmlns:stEvt="http://ns.adobe.com/xap/1.0/sType/ResourceEvent#" '
    + 'xmlns:stRef="http://ns.adobe.com/xap/1.0/sType/ResourceRef#" '
    + 'xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" '
    + 'xmlns:xapGImg="http://ns.adobe.com/xap/1.0/g/img/" '
    + 'xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" '
  )
}
