// Generates the Android launcher icons from assets/icon/bahaba-symbol.svg.
//
// Run from the repo root (uses the root project's Playwright + Microsoft Edge):
//   node bahaba_app/tool/generate_launcher_icons.mjs
//
// The symbol's painted pixels are measured first, so any padding in the SVG is
// ignored and every icon is centred on the symbol's real bounding box.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const resDir = join(appDir, 'android/app/src/main/res');

// Logo tile gradient (top-left -> bottom-right), same as bahaba-app-icon.svg.
const GRADIENT_FROM = '#14B4CF';
const GRADIENT_TO = '#0A6B88';

// Adaptive icon: 108dp canvas, launchers show the middle 72dp and guarantee
// only a 66dp circle (radius 33dp) survives every mask shape.
const ADAPTIVE_CANVAS = 108;
const SAFE_RADIUS = 33;
// Legacy square tile: symbol's bounding box spans this fraction of the tile.
const SQUARE_FILL = 0.8;
// Legacy round tile: farthest painted pixel sits at this fraction of the radius.
const ROUND_FILL = 0.88;

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const symbolSvg = readFileSync(join(appDir, 'assets/icon/bahaba-symbol.svg'), 'utf8');
const symbolBody = symbolSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];
const symbolSize = Number(symbolSvg.match(/viewBox="0 0 (\d+) \d+"/)[1]);

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();

async function rasterize(svg, px) {
  return page.evaluate(
    async ({ svg, px }) => {
      const img = new Image(px, px);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = px;
      canvas.getContext('2d').drawImage(img, 0, 0, px, px);
      return canvas.toDataURL('image/png').split(',')[1];
    },
    { svg, px },
  );
}

// Bounding box, centre and farthest painted pixel of the symbol, in SVG units.
const measured = await page.evaluate(
  async ({ svg, size }) => {
    const scale = 4;
    const px = size * scale;
    const img = new Image(px, px);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, px, px);
    const { data } = ctx.getImageData(0, 0, px, px);
    let x0 = px, y0 = px, x1 = -1, y1 = -1;
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        if (data[(y * px + x) * 4 + 3] === 0) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    x1 += 1;
    y1 += 1;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let r2 = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (data[(y * px + x) * 4 + 3] === 0) continue;
        const dx = Math.max(Math.abs(x - cx), Math.abs(x + 1 - cx));
        const dy = Math.max(Math.abs(y - cy), Math.abs(y + 1 - cy));
        r2 = Math.max(r2, dx * dx + dy * dy);
      }
    }
    return {
      w: (x1 - x0) / scale, h: (y1 - y0) / scale,
      cx: cx / scale, cy: cy / scale, r: Math.sqrt(r2) / scale,
    };
  },
  { svg: symbolSvg, size: symbolSize },
);

// Symbol scaled by `s` with its centre placed at (at, at).
const symbol = (s, at) =>
  `<g transform="translate(${at - s * measured.cx} ${at - s * measured.cy}) scale(${s})">${symbolBody}</g>`;

const gradient = (from, to) =>
  `<defs><linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="${from}" y1="${from}" x2="${to}" y2="${to}">` +
  `<stop offset="0" stop-color="${GRADIENT_FROM}"/><stop offset="1" stop-color="${GRADIENT_TO}"/></linearGradient></defs>`;

const svgDoc = (view, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}">${body}</svg>`;

const T = 512; // design units for the legacy tiles
const squareScale = Math.min((SQUARE_FILL * T) / measured.w, (SQUARE_FILL * T) / measured.h);

const icons = {
  foreground: svgDoc(ADAPTIVE_CANVAS, symbol(SAFE_RADIUS / measured.r, ADAPTIVE_CANVAS / 2)),
  // Gradient spans the visible 72dp, so the masked tile matches the legacy icon.
  background: svgDoc(
    ADAPTIVE_CANVAS,
    gradient(18, 90) + `<rect width="${ADAPTIVE_CANVAS}" height="${ADAPTIVE_CANVAS}" fill="url(#bg)"/>`,
  ),
  square: svgDoc(T, gradient(0, T) + `<rect width="${T}" height="${T}" fill="url(#bg)"/>` + symbol(squareScale, T / 2)),
  round: svgDoc(
    T,
    gradient(0, T) + `<circle cx="${T / 2}" cy="${T / 2}" r="${T / 2}" fill="url(#bg)"/>` +
      symbol((ROUND_FILL * T) / 2 / measured.r, T / 2),
  ),
};

async function write(path, svg, px) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(await rasterize(svg, px), 'base64'));
  console.log(`${px}x${px}  ${path.slice(appDir.length + 1)}`);
}

for (const [density, k] of Object.entries(DENSITIES)) {
  await write(join(resDir, `mipmap-${density}/ic_launcher.png`), icons.square, 48 * k);
  await write(join(resDir, `mipmap-${density}/ic_launcher_round.png`), icons.round, 48 * k);
  await write(join(resDir, `drawable-${density}/ic_launcher_foreground.png`), icons.foreground, ADAPTIVE_CANVAS * k);
  await write(join(resDir, `drawable-${density}/ic_launcher_background.png`), icons.background, ADAPTIVE_CANVAS * k);
}
// Google Play listing icon (Play applies its own rounded mask).
await write(join(appDir, 'android/app/src/main/ic_launcher-playstore.png'), icons.square, 512);

await browser.close();
