/**
 * Generates PWA icons in all required sizes.
 * Uses only built-in Node.js — no extra packages needed.
 * Run: node generate-icons.js
 */

const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, 'public', 'icons');

if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

// Generate a minimal valid PNG for each size using raw PNG binary construction
function createPNG(size) {
  // We'll create an SVG and embed it as a data URI in an HTML canvas approach
  // Since we can't use canvas without native deps, we create valid PNG files
  // using the PNG spec directly (pure JS PNG encoder for simple images)

  const width = size;
  const height = size;

  // Create pixel data: purple gradient background + white ring symbol
  const pixels = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const nx = x / width;
      const ny = y / height;

      // Rounded rect mask
      const rx = 0.15; // corner radius ratio
      const inRect = isInRoundedRect(nx, ny, rx);

      if (inRect) {
        // Purple gradient: top-left dark, bottom-right purple
        const r = Math.round(26 + (124 - 26) * nx);
        const g = Math.round(26 + (58 - 26) * ny);
        const b = Math.round(46 + (237 - 46) * (nx * 0.5 + ny * 0.5));

        // Draw a simple ring shape in the center
        const cx = nx - 0.5;
        const cy = ny - 0.5;
        const dist = Math.sqrt(cx * cx + cy * cy);
        const isRing = dist > 0.18 && dist < 0.28;
        const isInnerGem = dist < 0.08;

        if (isRing) {
          pixels[idx]     = 255; // R - white ring
          pixels[idx + 1] = 220;
          pixels[idx + 2] = 180;
          pixels[idx + 3] = 255;
        } else if (isInnerGem) {
          pixels[idx]     = 200;
          pixels[idx + 1] = 160;
          pixels[idx + 2] = 255;
          pixels[idx + 3] = 255;
        } else {
          pixels[idx]     = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = 255;
        }
      } else {
        // Transparent outside rounded rect
        pixels[idx] = pixels[idx+1] = pixels[idx+2] = pixels[idx+3] = 0;
      }
    }
  }

  return encodePNG(width, height, pixels);
}

function isInRoundedRect(nx, ny, r) {
  // Check if point (nx, ny) in [0,1]x[0,1] is inside a rounded rectangle
  const x = nx - 0.5;
  const y = ny - 0.5;
  const hw = 0.5 - r;
  const hh = 0.5 - r;
  const qx = Math.abs(x) - hw;
  const qy = Math.abs(y) - hh;
  return Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) + Math.min(Math.max(qx, qy), 0) <= r;
}

// Minimal PNG encoder (pure JS)
function encodePNG(width, height, pixels) {
  const chunks = [];

  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  chunks.push(makeChunk('IHDR', ihdr));

  // IDAT chunk (image data)
  const zlib = require('zlib');
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter type: None
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      rawData.push(pixels[idx], pixels[idx+1], pixels[idx+2], pixels[idx+3]);
    }
  }
  const compressed = zlib.deflateSync(Buffer.from(rawData));
  chunks.push(makeChunk('IDAT', compressed));

  // IEND chunk
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat([sig, ...chunks]);
}

function makeChunk(type, data) {
  const crc32 = require('zlib').crc32 || makeCRC32;
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crcVal = computeCRC(crcInput);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal >>> 0, 0);
  return Buffer.concat([len, typeBuffer, data, crcBuf]);
}

// CRC32 implementation
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function computeCRC(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate all sizes
console.log('Generating PWA icons...');
for (const size of sizes) {
  const png = createPNG(size);
  const outPath = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`  ✓ icon-${size}.png (${png.length} bytes)`);
}
console.log(`\nDone! Icons saved to public/icons/`);
