// Bundles the real front end + the in-browser fake API into one self-contained HTML file: node demo/build.mjs out.html
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const out = process.argv[2] || 'demo/dist/index.html';
const js = (await build({ entryPoints: ['demo/entry.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2022' })).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('public/css/app.css', 'utf8');
const html = `<title>YourCalories</title>
<style>
${css}
#demo-bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 10; display: flex; gap: 8px; align-items: center; justify-content: center; flex-wrap: wrap; padding: 8px 16px; background: var(--bar); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom: .5px solid var(--line); font-size: 13px; color: var(--mute); }
#demo-bar button { border: 0; border-radius: 99px; padding: 6px 12px; background: var(--fill); color: var(--ink); font-size: 13px; cursor: pointer; }
#demo-bar button.on { background: var(--blue); color: #fff; }
</style>
<div id="demo-bar"><span>Demo with sample data. Try as:</span><button data-as="1" class="on">Member (Maya)</button><button data-as="2">Coach (Sam)</button><button data-as="new">New sign-up</button></div>
<div id="app"></div>
<script>
try { window.__yc_ok = true; } catch (e) {}
${js}
</script>
`;
writeFileSync(out, html);
console.log(`wrote ${out} (${Math.round(html.length / 1024)} KB)`);
