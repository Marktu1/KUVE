// Gera web/vendor/: bibliotecas abertas servidas pelo nosso servidor (sem CDNs de terceiros).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = path.join(ROOT, 'node_modules');
const OUT = path.join(ROOT, 'web', 'vendor');
fs.mkdirSync(OUT, { recursive: true });

const copy = (from, to) => {
  const src = path.join(NM, from);
  if (!fs.existsSync(src)) { console.warn('em falta (mantém-se a versão já em web/vendor):', from); return; }
  const dst = path.join(OUT, to);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
};

// Visualizador 3D + AR nativo (Android Scene Viewer / iPhone Quick Look)
copy('@google/model-viewer/dist/model-viewer.min.js', 'model-viewer.min.js');

// Image AR (menu impresso) — MindAR 1.2.5 precisa do three r150
const mindDir = path.join(NM, 'mind-ar/dist');
if (fs.existsSync(mindDir)) {
  for (const f of fs.readdirSync(mindDir)) {
    if (/^(mindar-image(-three)?\.prod|controller-|ui-).*\.js$/.test(f)) copy(`mind-ar/dist/${f}`, `mindar/${f}`);
  }
}
copy('three150/build/three.module.js', 'three150/three.module.js');
copy('three150/examples/jsm/loaders/GLTFLoader.js', 'three150/addons/loaders/GLTFLoader.js');
copy('three150/examples/jsm/utils/BufferGeometryUtils.js', 'three150/addons/utils/BufferGeometryUtils.js');
copy('three150/examples/jsm/renderers/CSS3DRenderer.js', 'three150/addons/renderers/CSS3DRenderer.js');
copy('three150/examples/jsm/controls/OrbitControls.js', 'three150/addons/controls/OrbitControls.js');

// Ferramentas GLB do estúdio
await build({
  entryPoints: [path.join(ROOT, 'src/glb-tools.js')],
  bundle: true, format: 'esm', minify: true, target: 'es2020', platform: 'browser',
  external: ['node:fs', 'node:path'], // só usados pelo NodeIO, nunca carregados no browser
  outfile: path.join(OUT, 'glb-tools.js'),
  logLevel: 'warning',
});

console.log('web/vendor pronto');
await import('./letras.mjs');
