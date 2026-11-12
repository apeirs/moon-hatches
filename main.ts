// coolest-art-01 entry: copies the artwork beside this script (art.png, else art.jpg) unchanged to entry.png in
// $MAKEFUN_OUTPUT_DIR (default /output). It first checks the contest's file rules (PNG or JPEG signature, at most
// 1 MiB, at most 1024x1024 pixels) and exits non-zero without writing anything if they fail.
//
// Run locally:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = new URL('.', import.meta.url);
const source = ['art.png', 'art.jpg'].map((name) => new URL(name, here)).find((url) => existsSync(url));
if (!source) {
  console.error('main.ts: no art.png or art.jpg next to this script');
  process.exit(1);
}

const MAX_BYTES = 1024 * 1024;
const MAX_SIDE = 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fail(reason: string): never {
  console.error(`main.ts: ${fileURLToPath(source!)} is not a valid entry: ${reason}`);
  process.exit(1);
}

// Width and height of a PNG, from the IHDR chunk that must follow the signature.
function pngSize(buf: Buffer): [number, number] {
  if (buf.length < 24 || buf.toString('latin1', 12, 16) !== 'IHDR') fail('PNG has no IHDR chunk');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

// Width and height of a JPEG, from its first SOFn segment (C0-CF, except DHT C4, JPG C8 and DAC CC).
function jpegSize(buf: Buffer): [number, number] {
  let i = 2;
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) fail(`JPEG segment marker expected at byte ${i}`);
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; } // fill byte
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; } // no length field
    if (marker === 0xd9 || marker === 0xda) break; // end of image, or scan data before any frame header
    const length = buf.readUInt16BE(i + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 9 > buf.length) fail('JPEG frame header is truncated');
      return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    }
    i += 2 + length;
  }
  fail('JPEG has no SOFn frame header');
}

const bytes = readFileSync(source);
if (bytes.length > MAX_BYTES) fail(`${bytes.length} bytes, over the ${MAX_BYTES}-byte limit`);
let width: number, height: number;
if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) [width, height] = pngSize(bytes);
else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) [width, height] = jpegSize(bytes);
else fail('signature is neither PNG nor JPEG');
if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) {
  fail(`${width}x${height} pixels, outside 1..${MAX_SIDE} on a side`);
}

const target = join(process.env.MAKEFUN_OUTPUT_DIR ?? '/output', 'entry.png');
writeFileSync(target, bytes);
console.log(`main.ts: wrote ${target} (${width}x${height}, ${bytes.length} bytes)`);
