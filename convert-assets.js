/**
 * TGA to PNG Converter (Pure JavaScript - No Dependencies)
 *
 * Run: node convert-assets.js
 *
 * This script converts all TGA files in the assets folder to PNG format.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

async function convertTgaToPng() {
  const assetsDir = path.join(__dirname, 'assets');
  const files = fs.readdirSync(assetsDir);

  const tgaFiles = files.filter(f => f.toLowerCase().endsWith('.tga'));

  if (tgaFiles.length === 0) {
    console.log('No TGA files found in assets folder.');
    return;
  }

  console.log(`Found ${tgaFiles.length} TGA files to convert...`);

  for (const tgaFile of tgaFiles) {
    const inputPath = path.join(assetsDir, tgaFile);
    const outputPath = path.join(assetsDir, tgaFile.replace(/\.tga$/i, '.png'));

    try {
      const buffer = fs.readFileSync(inputPath);
      const tga = parseTGA(buffer);
      const png = createPNG(tga.width, tga.height, tga.pixels, tga.channels);
      fs.writeFileSync(outputPath, png);
      console.log(`Converted: ${tgaFile} -> ${path.basename(outputPath)}`);
    } catch (err) {
      console.error(`Failed to convert ${tgaFile}: ${err.message}`);
    }
  }

  console.log('Done!');
}

function parseTGA(buffer) {
  const idLength = buffer[0];
  const colorMapType = buffer[1];
  const imageType = buffer[2];
  const width = buffer.readUInt16LE(12);
  const height = buffer.readUInt16LE(14);
  const bitsPerPixel = buffer[16];
  const descriptor = buffer[17];

  const channels = bitsPerPixel / 8;
  const headerSize = 18 + idLength;

  if (imageType !== 2 && imageType !== 10) {
    throw new Error(`Unsupported TGA image type: ${imageType}`);
  }

  let pixelData;

  if (imageType === 2) {
    pixelData = buffer.slice(headerSize, headerSize + width * height * channels);
  } else if (imageType === 10) {
    pixelData = decompressRLE(buffer.slice(headerSize), width * height, channels);
  }

  // Convert BGR(A) to RGBA and flip vertically if needed
  const pixels = Buffer.alloc(width * height * 4);
  const flipVertical = (descriptor & 0x20) === 0;

  for (let y = 0; y < height; y++) {
    const srcY = flipVertical ? (height - 1 - y) : y;
    for (let x = 0; x < width; x++) {
      const srcIdx = (srcY * width + x) * channels;
      const dstIdx = (y * width + x) * 4;

      pixels[dstIdx] = pixelData[srcIdx + 2];     // R
      pixels[dstIdx + 1] = pixelData[srcIdx + 1]; // G
      pixels[dstIdx + 2] = pixelData[srcIdx];     // B
      pixels[dstIdx + 3] = channels === 4 ? pixelData[srcIdx + 3] : 255; // A
    }
  }

  return { width, height, channels: 4, pixels };
}

function decompressRLE(data, pixelCount, channels) {
  const output = Buffer.alloc(pixelCount * channels);
  let srcIdx = 0;
  let dstIdx = 0;

  while (dstIdx < output.length && srcIdx < data.length) {
    const packet = data[srcIdx++];
    const count = (packet & 0x7F) + 1;

    if (packet & 0x80) {
      const pixel = data.slice(srcIdx, srcIdx + channels);
      srcIdx += channels;
      for (let i = 0; i < count && dstIdx < output.length; i++) {
        pixel.copy(output, dstIdx);
        dstIdx += channels;
      }
    } else {
      const bytes = count * channels;
      data.copy(output, dstIdx, srcIdx, srcIdx + bytes);
      srcIdx += bytes;
      dstIdx += bytes;
    }
  }

  return output;
}

function createPNG(width, height, pixels, channels) {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type (RGBA)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk - prepare raw image data with filter bytes
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter type: None
    pixels.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 lookup table
const crcTable = (function() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i++) {
    crc = crcTable[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

convertTgaToPng().catch(console.error);
