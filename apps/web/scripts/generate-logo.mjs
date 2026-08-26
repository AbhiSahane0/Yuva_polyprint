/**
 * Generates the YUVA brand assets from the client's logo.
 *
 *   node apps/web/scripts/generate-logo.mjs
 *
 * Geometry and colour were measured off the printed letterhead
 * (`apps/api/assets/quotation/header.png`) rather than eyeballed: four
 * 118 x 204 tiles, 10 apart, 14 corner radius, letters 104 tall on a 13 stroke.
 * The generated mark measures within 1.4% of the original on every letter.
 *
 * This is a script rather than two hand-written files because the long shadow
 * is a few hundred offset copies of each letter. That is unreadable as source
 * and impossible to adjust by hand, but trivial to regenerate.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const TILE_W = 118;
const TILE_H = 204;
const GAP = 10;
const RADIUS = 14;
const STROKE = 13;
const BOT = 154;

/**
 * Letter centrelines, tile-local.
 *
 * The V and A vertices sit inside the cap height on purpose. A mitered stroke
 * projects past its vertex at a sharp point — 14 to 16 units at these angles —
 * so putting a vertex on the cap line would throw the painted tip that far
 * past it. Pulling the vertex back by the overshoot lands the tip on the line.
 */
const PATHS = {
  Y: `M28,52 L59,104 L90,52 M59,104 L59,${BOT}`,
  U: 'M26.5,49 V115 A32.5,32.5 0 0 0 91.5,115 V49',
  V: 'M23,53 L59,138.3 L95,53',
  A: `M23.5,${BOT} L59,64 L94.5,${BOT}`,
};

/** Sampled from the letterhead: tile fill, then its long-shadow tone. */
const TILES = [
  ['Y', '#892F7F', '#5E1E58'],
  ['U', '#44984B', '#2C6835'],
  ['V', '#C74F2C', '#84371B'],
  ['A', '#553F8A', '#3A2B5F'],
];

const STROKE_ATTRS = `fill="none" stroke-width="${STROKE}" stroke-linecap="butt" stroke-linejoin="miter"`;

/**
 * The full wordmark, with the long shadows.
 *
 * The shadow is the letter repeated diagonally until it leaves the tile, one
 * unit at a time. Two units apart leaves a visible stair-step on the shadow's
 * edge; one is smooth, and the repetition compresses to almost nothing.
 */
function wordmark() {
  const width = TILES.length * TILE_W + (TILES.length - 1) * GAP;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${TILE_H}" role="img" aria-label="Yuva">`,
  ];

  TILES.forEach(([key, fill, shade], i) => {
    const x = i * (TILE_W + GAP);
    const offsets = [];
    for (let k = 1; k < TILE_H + TILE_W; k += 1) {
      offsets.push(`<use href="#l${i}" x="${k}" y="${k}"/>`);
    }
    parts.push(
      // Tile-local: this clip is applied inside the translated group below.
      `<clipPath id="c${i}"><rect width="${TILE_W}" height="${TILE_H}" rx="${RADIUS}"/></clipPath>`,
      `<rect x="${x}" width="${TILE_W}" height="${TILE_H}" rx="${RADIUS}" fill="${fill}"/>`,
      `<g transform="translate(${x} 0)">`,
      `<defs><path id="l${i}" d="${PATHS[key]}"/></defs>`,
      `<g clip-path="url(#c${i})">`,
      `<g stroke="${shade}" ${STROKE_ATTRS}>${offsets.join('')}</g>`,
      `<use href="#l${i}" stroke="#FFFFFF" ${STROKE_ATTRS}/>`,
      '</g></g>',
    );
  });

  parts.push('</svg>');
  return parts.join('');
}

/**
 * The favicon: one tile, flat.
 *
 * A tab icon is 16px. Rendered at that size the four letters of the full mark
 * collapse into an unreadable smear, and the long shadow is invisible detail —
 * both were checked side by side before settling on this. A single letter in
 * the brand purple stays legible and still reads as the same logo.
 */
function favicon() {
  const size = 256;
  const w = 148;
  const h = Math.round((w * TILE_H) / TILE_W);
  const x = (size - w) / 2;
  const y = (size - h) / 2;
  const scale = w / TILE_W;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Yuva Polyprint">` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${(RADIUS * scale).toFixed(1)}" fill="#892F7F"/>` +
    `<g transform="translate(${x} ${y}) scale(${scale.toFixed(4)})">` +
    `<path d="${PATHS.Y}" stroke="#FFFFFF" ${STROKE_ATTRS}/>` +
    '</g></svg>'
  );
}

for (const [name, svg] of [
  ['logo.svg', wordmark()],
  ['favicon.svg', favicon()],
]) {
  writeFileSync(join(OUT, name), `${svg}\n`);
  console.log(`  ${name.padEnd(12)} ${svg.length} bytes`);
}
