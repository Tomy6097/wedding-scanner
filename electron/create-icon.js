/**
 * Creates a simple PNG icon for the app using pure Node.js (no canvas needed).
 * Generates a minimal valid PNG with a ring emoji background.
 * Run once: node electron/create-icon.js
 */

const fs = require('fs');
const path = require('path');

// Minimal 256x256 purple square PNG (base64 encoded)
// This is a valid PNG file that electron-builder will use as the app icon.
// For a real icon, replace icon.png with your own 256x256 image.

const { createCanvas } = (() => {
  try { return require('canvas'); } catch { return null; }
})() || {};

if (createCanvas) {
  // If canvas is available, draw a nice icon
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(1, '#7c3aed');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(0, 0, 256, 256, 40);
  ctx.fill();

  // Ring emoji
  ctx.font = '140px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('💍', 128, 128);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(__dirname, 'icon.png'), buffer);
  console.log('Icon created with canvas.');
} else {
  // Fallback: write a minimal valid 1x1 purple PNG
  // This is enough for electron to not crash; replace with real icon later
  const PNG_1x1_PURPLE = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
    '2e00000000c4944415478016360f8cfc00000000200016b0017b000000000049454e44ae426082',
    'hex'
  );
  fs.writeFileSync(path.join(__dirname, 'icon.png'), PNG_1x1_PURPLE);
  console.log('Minimal icon created. Replace electron/icon.png with a real 256x256 PNG for best results.');
}
