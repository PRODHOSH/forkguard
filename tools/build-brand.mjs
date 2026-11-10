// Generates the logo kit into <outDir>. Needs opentype.js (npm i opentype.js in any scratch folder, run from there)
// and a static Bricolage Grotesque ExtraBold .ttf for the wordmark outlines.
//   node build-brand.mjs ../site/assets/brand ./bricolage-800.ttf
import fs from 'node:fs';
import opentype from 'opentype.js';

const [OUT, TTF] = process.argv.slice(2);
const INK = '#0B1B33', BLUE = '#2F5BFF', DEEP = '#1B3DB8', ORANGE = '#FF7A2F', PAPER = '#F7F8FC', SKY = '#8FA9FF';

// A shield, drawn as two halves so the right side can sit a shade deeper (flat colour, no gradient).
const LEFT = 'M128 16 C104 36 64 46 36 46 V120 C36 178 76 216 128 244 Z';
const RIGHT = 'M128 16 C152 36 192 46 220 46 V120 C220 178 180 216 128 244 Z';
const WHOLE = 'M128 16 C152 36 192 46 220 46 V120 C220 178 180 216 128 244 C76 216 36 178 36 120 V46 C64 46 104 36 128 16 Z';
// A fork: one stem, three tines, round nodes. The middle node is orange.
const glyph = (stem, orange, sw = 13) => `<g fill="none" stroke="${stem}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="M128 190 V150"/><path d="M128 150 C128 124 92 130 92 104"/><path d="M128 150 C128 124 164 130 164 104"/><path d="M128 150 V104"/></g><circle cx="92" cy="94" r="14" fill="${stem}"/><circle cx="164" cy="94" r="14" fill="${stem}"/><circle cx="128" cy="94" r="14" fill="${orange}"/><circle cx="128" cy="196" r="14" fill="${stem}"/>`;

const svg = (vb, body, title = 'forkguard') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img"><title>${title}</title>\n${body}\n</svg>\n`;
const write = (name, s) => { fs.writeFileSync(`${OUT}/${name}`, s); console.log('wrote', name); };
const markBody = `<path d="${LEFT}" fill="${BLUE}"/><path d="${RIGHT}" fill="${DEEP}"/>${glyph('#fff', ORANGE)}`;

write('mark.svg', svg('0 0 256 256', markBody));
write('favicon.svg', svg('20 4 216 248', `<path d="${LEFT}" fill="${BLUE}"/><path d="${RIGHT}" fill="${DEEP}"/>${glyph('#fff', ORANGE, 18)}`));
write('mark-ink.svg', svg('0 0 256 256', `<path d="${WHOLE}" fill="${INK}"/>${glyph(PAPER, PAPER)}`));
write('mark-paper.svg', svg('0 0 256 256', `<path d="${WHOLE}" fill="${PAPER}"/>${glyph(INK, INK)}`));

// Wordmark as outlines, glyph by glyph (opentype.js cannot read this font's GSUB tables).
const buf = fs.readFileSync(TTF);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const SIZE = 150, TRACK = -0.02;
const text = 'forkguard';
function layout(x, y) {
  const glyphs = [...text].map((c) => font.charToGlyph(c));
  const k = SIZE / font.unitsPerEm;
  let pen = x; const paths = [];
  glyphs.forEach((g, i) => { paths.push(g.getPath(pen, y, SIZE)); pen += g.advanceWidth * k + (glyphs[i + 1] ? font.getKerningValue(g, glyphs[i + 1]) * k : 0) + TRACK * SIZE; });
  return paths;
}
const box = (ps) => ps.reduce((b, p) => { const q = p.getBoundingBox(); return { x1: Math.min(b.x1, q.x1), y1: Math.min(b.y1, q.y1), x2: Math.max(b.x2, q.x2), y2: Math.max(b.y2, q.y2) }; }, { x1: 1e9, y1: 1e9, x2: -1e9, y2: -1e9 });
const b0 = box(layout(0, 0));
const x0 = 256 + 26 - b0.x1;
const y0 = 130 - (b0.y1 + b0.y2) / 2 + 4;
const ps = layout(x0, y0);
const fork = ps.slice(0, 4).map((p) => p.toPathData(2)).join(' ');
const guard = ps.slice(4).map((p) => p.toPathData(2)).join(' ');
const right = Math.ceil(box(ps).x2) + 6;
const lock = (a, b) => svg(`0 0 ${right} 256`, `${markBody}\n<path d="${fork}" fill="${a}"/>\n<path d="${guard}" fill="${b}"/>`);
write('logo.svg', lock(INK, BLUE));
write('logo-on-dark.svg', lock('#fff', SKY));
