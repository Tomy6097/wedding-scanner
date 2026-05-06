/**
 * Generates a simple app icon as an SVG then saves as PNG placeholder.
 * Run: node electron/make-icon.js
 */
const fs = require('fs');
const path = require('path');

// Write an SVG icon (used as source for builds that support it)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="40" fill="url(#bg)"/>
  <text x="128" y="155" font-size="130" text-anchor="middle" font-family="serif">💍</text>
</svg>`;

fs.writeFileSync(path.join(__dirname, 'icon.svg'), svg);
console.log('SVG icon written to electron/icon.svg');
console.log('For a proper .ico file, convert icon.svg to icon.ico using https://convertio.co/svg-ico/');
console.log('Place the result at electron/icon.ico');
