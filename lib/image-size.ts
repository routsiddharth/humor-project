// Intrinsic pixel dimensions, read straight off the file header.
//
// A meme card is almost entirely picture, so it needs the shape before the
// bytes arrive: with width and height on the <img>, the browser reserves the
// right box and the grid holds still while images stream in. Without them
// every arrival reflows the page under the reader's thumb.
//
// Pure byte inspection — no decoding, no dependency, no network — so it runs
// inside the upload action without pulling in an image library. Only the four
// formats the upload accepts are handled; anything else returns null, and the
// card falls back to sizing itself once the image loads.

export type ImageSize = { width: number; height: number };

export function readImageSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 32) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // PNG: IHDR is required to be the first chunk, so the size is at a fixed spot.
  if (ascii(bytes, 1, 3) === "PNG") {
    return size(view.getUint32(16), view.getUint32(20));
  }

  // GIF: the logical screen descriptor follows the 6-byte header, little-endian.
  if (ascii(bytes, 0, 3) === "GIF") {
    return size(view.getUint16(6, true), view.getUint16(8, true));
  }

  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return webp(bytes, view);
  }

  // JPEG has no fixed offset — the size lives in a frame header somewhere in
  // the marker chain, so it has to be walked.
  if (view.getUint16(0) === 0xffd8) return jpeg(bytes, view);

  return null;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

// Guards against a header that parses but is nonsense, which would otherwise
// reach the <img> as width="0" and collapse the card.
function size(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

function jpeg(bytes: Uint8Array, view: DataView): ImageSize | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    // Segments are padded with 0xff bytes; step over them rather than giving up.
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];

    // Standalone markers carry no length field to skip past.
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    // SOF0-SOF15 hold the frame size. DHT (c4), JPG (c8) and DAC (cc) sit in
    // the same numeric range and do not.
    if (
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    ) {
      // Height precedes width here, unlike every other format below.
      return size(view.getUint16(offset + 7), view.getUint16(offset + 5));
    }

    const length = view.getUint16(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function webp(bytes: Uint8Array, view: DataView): ImageSize | null {
  switch (ascii(bytes, 12, 4)) {
    // Lossy: 14-bit dimensions after the 3-byte sync code.
    case "VP8 ":
      return bytes.length < 30
        ? null
        : size(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);

    // Lossless: 14 bits each, packed together right after the signature byte,
    // and stored one less than the real value.
    case "VP8L": {
      if (bytes.length < 25) return null;
      const packed = view.getUint32(21, true);
      return size((packed & 0x3fff) + 1, ((packed >> 14) & 0x3fff) + 1);
    }

    // Extended (animation, alpha): a 24-bit canvas size, also stored minus one.
    case "VP8X": {
      if (bytes.length < 30) return null;
      const at = (o: number) => bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16);
      return size(at(24) + 1, at(27) + 1);
    }

    default:
      return null;
  }
}
