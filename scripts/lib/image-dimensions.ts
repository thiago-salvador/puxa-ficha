/**
 * Leitura de dimensões de imagem sem dependência nativa (sharp etc.).
 * Cobre os formatos presentes em public/candidates: JPEG, PNG, WebP e AVIF.
 * Usado pelo gate de resolução de fotos (G5-02 do master review 2026-08-04).
 */

export interface ImageDimensions {
  width: number
  height: number
  format: "jpeg" | "png" | "webp" | "avif"
}

export function readImageDimensions(buf: Buffer): ImageDimensions | null {
  return readPng(buf) ?? readJpeg(buf) ?? readWebp(buf) ?? readAvif(buf)
}

function readPng(buf: Buffer): ImageDimensions | null {
  if (buf.length < 24) return null
  if (buf.readUInt32BE(0) !== 0x89504e47) return null
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: "png" }
}

function readJpeg(buf: Buffer): ImageDimensions | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = buf[offset + 1]
    // SOF0-SOF15, exceto DHT (C4), JPG (C8) e DAC (CC), carregam as dimensões.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        width: buf.readUInt16BE(offset + 7),
        height: buf.readUInt16BE(offset + 5),
        format: "jpeg",
      }
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2
      continue
    }
    offset += 2 + buf.readUInt16BE(offset + 2)
  }
  return null
}

function readWebp(buf: Buffer): ImageDimensions | null {
  if (buf.length < 30) return null
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null
  const chunk = buf.toString("ascii", 12, 16)
  if (chunk === "VP8X") {
    return {
      width: 1 + buf.readUIntLE(24, 3),
      height: 1 + buf.readUIntLE(27, 3),
      format: "webp",
    }
  }
  if (chunk === "VP8 ") {
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
      format: "webp",
    }
  }
  if (chunk === "VP8L") {
    const bits = buf.readUInt32LE(21)
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
      format: "webp",
    }
  }
  return null
}

/** AVIF é ISOBMFF: procura o box `ispe` (image spatial extents) dentro de meta/iprp/ipco. */
function readAvif(buf: Buffer): ImageDimensions | null {
  if (buf.length < 16 || buf.toString("ascii", 4, 8) !== "ftyp") return null
  const brand = buf.toString("ascii", 8, 12)
  if (brand !== "avif" && brand !== "avis" && brand !== "mif1") return null
  const idx = buf.indexOf("ispe")
  if (idx < 0 || idx + 16 > buf.length) return null
  return {
    width: buf.readUInt32BE(idx + 8),
    height: buf.readUInt32BE(idx + 12),
    format: "avif",
  }
}
