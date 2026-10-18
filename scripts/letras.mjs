// Copia as letras dos temas para web/vendor/letras (servidas pelo próprio Menu 3D, sem Google Fonts)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LETRAS } from '../web/js/temas.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'web/vendor/letras');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const pesos = { titulo: [500, 600, 700, 800], texto: [400, 500, 600, 700] };
let todas = '', bytes = 0;
for (const [grupo, lista] of Object.entries(LETRAS)) {
  for (const [id, l] of Object.entries(lista)) {
    const pacote = l.nome.toLowerCase().replace(/\s+/g, '-');
    const dir = path.join(ROOT, 'node_modules/@fontsource', pacote, 'files');
    const disponiveis = fs.readdirSync(dir).map(f => f.match(new RegExp(`^${pacote}-latin-(\\d+)-normal\\.woff2$`))?.[1]).filter(Boolean).map(Number);
    let escolhidos = pesos[grupo].filter(p => disponiveis.includes(p));
    if (!escolhidos.length) escolhidos = [disponiveis.includes(400) ? 400 : disponiveis[0]];
    fs.mkdirSync(path.join(OUT, id), { recursive: true });
    let css = '';
    for (const p of escolhidos) {
      const f = `${pacote}-latin-${p}-normal.woff2`;
      fs.copyFileSync(path.join(dir, f), path.join(OUT, id, f));
      bytes += fs.statSync(path.join(dir, f)).size;
      css += `@font-face{font-family:"${l.nome}";font-style:normal;font-weight:${escolhidos.length === 1 ? '100 900' : p};font-display:swap;src:url(/vendor/letras/${id}/${f}) format("woff2")}\n`;
    }
    fs.writeFileSync(path.join(OUT, `${id}.css`), css);
    todas += css;
  }
}
fs.writeFileSync(path.join(OUT, 'todas.css'), todas);
console.log(`letras: ${Object.keys(LETRAS.titulo).length + Object.keys(LETRAS.texto).length} famílias, ${(bytes / 1e6).toFixed(1)} MB`);
