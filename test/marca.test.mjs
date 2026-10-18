// Guarda da marca Kuvê: impede que a identidade volte atrás sem ninguém reparar.
// Só lê ficheiros (não arranca o servidor). Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LETRAS } from '../web/js/temas.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Páginas da ferramenta Kuvê (o menu do cliente e o pedido usam a identidade do restaurante)
const PAGINAS_KUVE = ['web/index.html', 'web/studio.html', 'web/plataforma.html', 'web/equipa.html'];
// CSS da ferramenta: não pode voltar à paleta antiga nem a cores soltas de estado
const CSS_KUVE = ['web/css/base.css', 'web/css/studio.css', 'web/css/plataforma.css', 'web/css/equipa.css', 'web/css/identidade.css'];

test('páginas da ferramenta: título, ícone, letra e marca Kuvê', () => {
  for (const f of PAGINAS_KUVE) {
    const html = ler(f);
    assert.match(html, /<title>[^<]*Kuvê[^<]*<\/title>/, `${f}: título sem "Kuvê"`);
    assert.match(html, /rel="icon" href="\/img\/kuve\.svg"/, `${f}: falta o favicon`);
    assert.match(html, /\/vendor\/letras\/sora\.css/, `${f}: falta a letra Sora`);
    assert.match(html, /#acento/, `${f}: falta o acento-cubo da palavra Kuvê`);
    assert.doesNotMatch(html.replace(/<!--[\s\S]*?-->/g, ''), />[^<]*\bMenu 3D\b(?! por| para)[^<]*</, `${f}: ainda diz "Menu 3D" como marca`);
  }
});

test('menu do cliente: "Menu 3D por Kuvê" no rodapé, desligável pelo tema', () => {
  const html = ler('web/menu.html');
  assert.match(html, /id="marca-menu3d"[^>]*href="\/"/);
  assert.match(html, /Menu 3D por/);
  assert.match(ler('web/js/menu.js'), /#marca-menu3d'\)\.classList\.toggle\('oculto', tema\.marcaMenu3D === false\)/);
});

test('ícones: símbolo, acento e ficheiros de instalação existem', () => {
  const sprite = ler('web/img/icones.svg');
  assert.match(sprite, /<symbol id="marca"/);
  assert.match(sprite, /<symbol id="acento"/);
  for (const f of ['kuve.svg', 'kuve-180.png', 'kuve-192.png', 'kuve-512.png']) assert.ok(fs.existsSync(path.join(ROOT, 'web/img', f)), f);
  for (const f of ['equipa', 'estudio']) {
    const m = JSON.parse(ler(`web/${f}.webmanifest`));
    assert.equal(m.theme_color, '#0E2A33');
    for (const i of m.icons) assert.ok(fs.existsSync(path.join(ROOT, 'web', i.src)), i.src);
  }
});

test('letra da marca: a Sora passa pelo mesmo caminho das outras letras', () => {
  assert.equal(LETRAS.titulo.sora?.nome, 'Sora');
  assert.ok(fs.existsSync(path.join(ROOT, 'web/vendor/letras/sora.css')), 'corre: node scripts/letras.mjs');
});

test('CSS da ferramenta: sem a paleta antiga e sem cores de estado soltas', () => {
  const antigas = [/#18201D/i, /rgba\(\s*24\s*,\s*32\s*,\s*29/, /#C8322B/i, /#E3A532/i, /#FFF6E2/i, /#FDEEEC/i, /#E8F3EC/i];
  for (const f of CSS_KUVE) {
    // base.css define os tokens: as cores de estado podem aparecer lá, uma vez, como valor
    const css = f.endsWith('base.css') ? ler(f).replace(/^\s*--[\w-]+:[^;]+;/gm, '') : ler(f);
    for (const r of antigas) assert.doesNotMatch(css, r, `${f}: encontrei ${r}`);
  }
});

// ---------- contraste (WCAG 2.1) dos pares da marca ----------
const tokens = Object.fromEntries([...ler('web/css/base.css').matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(m => [m[1], m[2]]));
const cor = n => {
  let v = tokens[n];
  assert.ok(v, `token --${n} em falta`);
  return v;
};
function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a, b) => { const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('contraste: os pares da marca passam AA', () => {
  const pares = [
    ['kuve-petroleo', 'kuve-nevoa', 4.5, 'texto sobre o fundo'],
    ['kuve-nevoa', 'kuve-petroleo', 4.5, 'texto claro nas barras escuras'],
    ['kuve-petroleo', 'kuve-laranja', 4.5, 'texto dos botões laranja'],
    ['kuve-laranja-forte', 'kuve-nevoa', 4.5, 'laranja usado como texto'],
    ['ok-texto', 'ok-fundo', 4.5, 'estado ok'],
    ['dende-escuro', 'aviso-fundo', 4.5, 'estado aviso'],
    ['info-texto', 'info-fundo', 4.5, 'estado informativo'],
    ['erro', 'erro-fundo', 4.5, 'estado erro'],
    ['musgo', 'kuve-nevoa', 4.5, 'texto secundário'],
    ['kuve-laranja', 'kuve-petroleo', 3, 'laranja sobre petróleo (elementos gráficos)'],
  ];
  for (const [t, f, min, papel] of pares) {
    const c = contraste(cor(t), cor(f));
    assert.ok(c >= min, `${papel}: --${t} sobre --${f} = ${c.toFixed(2)}:1 (mínimo ${min}:1)`);
  }
});
