// Bundles web/ into one self-contained HTML file: dist/ohrguss.html.
// The stylesheet, the geometry engine and the interface are inlined. three.js is
// inlined too when it is installed (npm install), so the file also works offline;
// otherwise it keeps loading three.js from the CDN.
//
// Usage: node scripts/build-single.mjs [output path]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = (p) => readFileSync(join(root, 'web', p), 'utf8');
const out = process.argv[2] || join(root, 'dist', 'ohrguss.html');

function inlineScript(code, attrs = '') {
  if (/<\/script/i.test(code)) throw new Error('script contains "</script" and cannot be inlined');
  return `<script${attrs}>${code}</script>`;
}

let html = web('index.html');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error('not found in index.html: ' + from);
  html = html.replace(from, () => to);
};

swap('<link rel="stylesheet" href="css/ohrguss.css">', `<style>\n${web('css/ohrguss.css')}</style>`);
swap('<script id="core" src="js/core.js"></script>', inlineScript(web('js/core.js'), ' id="core"'));
swap('<script src="js/app.js"></script>', inlineScript(web('js/app.js')));

const cdn = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>';
const local = join(root, 'node_modules', 'three', 'build', 'three.min.js');
if (existsSync(local)) swap(cdn, inlineScript(readFileSync(local, 'utf8')));
else console.warn('three.js is not installed, so the file loads it from the CDN. Run "npm install" for a fully offline file.');

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} kB)`);
