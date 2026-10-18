// Editor de cena do menu impresso: itens livres sobre o papel + pré-visualização 3D com toques.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Cena, cenaDoRestaurante, novoId, luzes } from './cena.js';
import { esc } from './comum.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const ICONE = id => `<svg class="ic" aria-hidden="true"><use href="/img/icones.svg#${id}"/></svg>`;

let ctx = null;
let itens = [];
let selecionado = null;
let alterado = false;
let iniciado = false;
let imgMenuFicheiro = null;
let vista = 'planta';

const rest = () => ctx.obterRestaurante();
const pratos = () => ctx.obterPratos();
const prato = id => pratos().find(p => p.id === id);

export function abrir(contexto) {
  ctx = contexto;
  if (!iniciado) { ligarEventos(); iniciado = true; }
  if (!alterado) itens = structuredClone(cenaDoRestaurante(rest().print));
  pintarTudo();
}

// ---------------- estado geral ----------------
function pintarTudo() {
  const p = rest().print || {};
  const temImagem = Boolean(p.imageUrl || imgMenuFicheiro);
  $('#cena-vazia').classList.toggle('oculto', temImagem);
  $('#cena-editor').classList.toggle('oculto', !temImagem);
  $('#abrir-impresso').href = `/p/${rest().slug}`;
  $('#abrir-impresso').classList.toggle('oculto', !p.mindUrl);
  if (!imgMenuFicheiro && p.imageUrl && $('#img-menu').getAttribute('src') !== p.imageUrl) $('#img-menu').src = p.imageUrl;
  $('#compilar').classList.toggle('oculto', !imgMenuFicheiro);
  if (!imgMenuFicheiro) {
    $('#estado-impresso').textContent = p.mindUrl ? 'Reconhecimento do menu pronto.' : 'Falta preparar o reconhecimento do menu.';
  }
  marcarAlterado(alterado);
  pintarMarcadores();
  pintarCamadas();
  pintarPropriedades();
  if (vista === '3d') reconstruir3D();
}

function marcarAlterado(v) {
  alterado = v;
  $('#guardar-cena').disabled = !v || !rest().print?.imageUrl;
  $('#estado-cena').textContent = v ? 'Alterações por guardar' : (itens.length ? 'Tudo guardado' : '');
}

function mudou() {
  marcarAlterado(true);
  pintarMarcadores();
  pintarCamadas();
  agendar3D();
}

// ---------------- itens ----------------
function nomeItem(i) {
  if (i.tipo === 'prato') return prato(i.dishId)?.name || 'Prato removido';
  if (i.tipo === 'texto') return i.texto || 'Texto';
  return 'Imagem';
}

function adicionarItem(base) {
  const item = {
    id: novoId(), x: 0.5, y: 0.5, tamanho: 0.32, rotacao: 0, altura: 0,
    deitado: false, quando: 'sempre', animacao: 'nenhuma', fundo: '#1E2522', ...base,
  };
  // espalha os novos itens para não ficarem uns por cima dos outros
  const n = itens.length;
  item.x = Math.min(0.85, 0.3 + (n % 3) * 0.2);
  item.y = Math.min(0.85, 0.3 + Math.floor(n / 3) % 3 * 0.2);
  itens.push(item);
  selecionado = item.id;
  mudou();
  pintarPropriedades();
}

// ---------------- planta (2D) ----------------
function pintarMarcadores() {
  const folha = $('#folha');
  const largura = folha.clientWidth || 500;
  $('#marcadores').innerHTML = itens.map(i => {
    const w = i.tamanho * largura;
    const sel = i.id === selecionado ? ' selecionado' : '';
    const rot = `rotate(${i.rotacao}deg)`;
    let corpo = '';
    let estilo = `left:${i.x * 100}%;top:${i.y * 100}%;width:${w}px;`;
    if (i.tipo === 'prato') {
      const p = prato(i.dishId);
      estilo += `height:${w}px;`;
      corpo = `<span class="corpo" style="transform:${rot}">${p?.posterUrl ? `<img src="${esc(p.posterUrl)}" alt="">` : ICONE('pratos')}</span>`;
    } else if (i.tipo === 'imagem') {
      corpo = `<span class="corpo" style="transform:${rot}"><img src="${esc(i.url)}" alt=""></span>`;
    } else {
      const claro = parseInt(i.fundo.slice(1), 16) > 0x999999;
      // mesma proporção que a etiqueta 3D: o texto ocupa a largura toda
      const fonte = Math.max(7, w / (i.texto.length * 0.56 + 1.9));
      corpo = `<span class="corpo" style="transform:${rot};background:${i.fundo};color:${claro ? '#1E2522' : '#fff'};font-size:${fonte}px">${esc(i.texto)}</span>`;
    }
    return `<div class="marcador ${i.tipo}${sel}" data-id="${i.id}" style="${estilo}" title="${esc(nomeItem(i))}">
      ${corpo}${i.quando === 'toque' ? '<span class="gatilho" title="Aparece ao tocar"></span>' : ''}</div>`;
  }).join('');
}

function ligarArrastar() {
  const folha = $('#folha');
  let arrastar = null;
  folha.addEventListener('pointerdown', e => {
    const m = e.target.closest('.marcador');
    if (!m) { selecionado = null; pintarMarcadores(); pintarCamadas(); pintarPropriedades(); return; }
    const item = itens.find(i => i.id === m.dataset.id);
    selecionado = item.id;
    const box = folha.getBoundingClientRect();
    arrastar = { item, box, dx: e.clientX - (box.left + item.x * box.width), dy: e.clientY - (box.top + item.y * box.height), moveu: false };
    m.setPointerCapture(e.pointerId);
    pintarMarcadores(); pintarCamadas(); pintarPropriedades();
    e.preventDefault();
  });
  folha.addEventListener('pointermove', e => {
    if (!arrastar) return;
    const { item, box, dx, dy } = arrastar;
    item.x = Math.min(1, Math.max(0, (e.clientX - dx - box.left) / box.width));
    item.y = Math.min(1, Math.max(0, (e.clientY - dy - box.top) / box.height));
    arrastar.moveu = true;
    const el = $(`.marcador[data-id="${item.id}"]`);
    if (el) { el.style.left = `${item.x * 100}%`; el.style.top = `${item.y * 100}%`; }
  });
  const soltar = () => { if (arrastar?.moveu) mudou(); arrastar = null; };
  folha.addEventListener('pointerup', soltar);
  folha.addEventListener('pointercancel', soltar);
  new ResizeObserver(() => pintarMarcadores()).observe(folha);
}

// ---------------- camadas ----------------
function pintarCamadas() {
  $('#camadas').innerHTML = itens.length ? itens.map(i => {
    const p = i.tipo === 'prato' ? prato(i.dishId) : null;
    const ic = i.tipo === 'prato' ? (p?.posterUrl ? `<img src="${esc(p.posterUrl)}" alt="">` : ICONE('pratos'))
      : i.tipo === 'imagem' ? `<img src="${esc(i.url)}" alt="">` : ICONE('texto');
    return `<li class="camada" data-id="${i.id}" aria-current="${i.id === selecionado}">
      <span class="ic-tipo">${ic}</span>
      <span class="nome">${esc(nomeItem(i))}</span>
      <span class="quando ${i.quando}">${i.quando === 'toque' ? 'Ao tocar' : 'Sempre'}</span>
      <button type="button" data-rm="${i.id}" aria-label="Remover ${esc(nomeItem(i))}">${ICONE('lixo')}</button>
    </li>`;
  }).join('') : '<li class="vazio-camadas">A cena está vazia. Adiciona um prato, uma imagem ou um texto.</li>';
}

// ---------------- propriedades ----------------
function pintarPropriedades() {
  const painel = $('#propriedades');
  const i = itens.find(x => x.id === selecionado);
  painel.classList.toggle('oculto', !i);
  if (!i) return;
  const pct = v => `${Math.round(v * 100)}%`;
  const especificos = i.tipo === 'prato'
    ? `<label class="campo"><span>Prato</span><select data-p="dishId">${pratos().map(p =>
        `<option value="${p.id}" ${p.id === i.dishId ? 'selected' : ''}>${esc(p.name)}${p.modelUrl ? '' : ' (sem 3D)'}</option>`).join('')}</select></label>`
    : i.tipo === 'texto'
      ? `<label class="campo"><span>Texto</span><input type="text" maxlength="60" data-p="texto" value="${esc(i.texto)}"></label>
         <label class="campo"><span>Cor de fundo</span><input type="color" data-p="fundo" value="${i.fundo}"></label>`
      : '';
  const orientacao = i.tipo === 'prato' ? '' : `
    <div class="campo"><span>Posição</span>
      <div class="segmentado" role="group">
        <button type="button" data-set="deitado" data-v="false" aria-selected="${!i.deitado}">De pé</button>
        <button type="button" data-set="deitado" data-v="true" aria-selected="${i.deitado}">Deitado no papel</button>
      </div></div>`;
  painel.innerHTML = `
    <h3>${esc(nomeItem(i))}</h3>
    ${especificos}
    <label class="campo deslizante"><span>Tamanho <output>${pct(i.tamanho)} da largura</output></span>
      <input type="range" min="0.05" max="0.8" step="0.01" data-p="tamanho" data-n value="${i.tamanho}"></label>
    <label class="campo deslizante"><span>Rotação <output>${Math.round(i.rotacao)}°</output></span>
      <input type="range" min="-180" max="180" step="5" data-p="rotacao" data-n value="${i.rotacao}"></label>
    <label class="campo deslizante"><span>Altura sobre o papel <output>${pct(i.altura)}</output></span>
      <input type="range" min="0" max="0.4" step="0.01" data-p="altura" data-n value="${i.altura}"></label>
    ${orientacao}
    <div class="campo"><span>Quando aparece</span>
      <div class="segmentado" role="group">
        <button type="button" data-set="quando" data-v="sempre" aria-selected="${i.quando === 'sempre'}">Ao ver o menu</button>
        <button type="button" data-set="quando" data-v="toque" aria-selected="${i.quando === 'toque'}">Ao tocar no ponto</button>
      </div>
      <small>${i.quando === 'toque' ? 'Aparece um ponto dourado no papel. Tocar mostra este item e esconde os outros que também são "ao tocar".' : 'Aparece logo que a câmara reconhece o menu.'}</small>
    </div>
    <label class="campo"><span>Animação</span>
      <select data-p="animacao">
        ${[['nenhuma', 'Nenhuma'], ['girar', 'Girar devagar'], ['pulsar', 'Pulsar'], ['salto', 'Salto ao aparecer']]
          .map(([v, t]) => `<option value="${v}" ${i.animacao === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select></label>`;

  painel.querySelectorAll('[data-p]').forEach(el => el.addEventListener('input', () => {
    const v = el.dataset.n !== undefined ? Number(el.value) : el.value;
    i[el.dataset.p] = v;
    const out = el.closest('.deslizante')?.querySelector('output');
    if (out) out.textContent = el.dataset.p === 'rotacao' ? `${Math.round(v)}°` : `${pct(v)}${el.dataset.p === 'tamanho' ? ' da largura' : ''}`;
    if (el.dataset.p === 'dishId' || el.dataset.p === 'texto') painel.querySelector('h3').textContent = nomeItem(i);
    mudou();
  }));
  painel.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
    i[b.dataset.set] = b.dataset.v === 'true' ? true : b.dataset.v === 'false' ? false : b.dataset.v;
    mudou();
    pintarPropriedades();
  }));
}

// ---------------- pré-visualização 3D ----------------
let r3 = null;   // { renderer, scene, camera, controls, raiz, cena, menu }
let tempo3D = null;

function iniciar3D() {
  const el = $('#palco-3d');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  el.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 20);
  camera.up.set(0, 0, 1);
  camera.position.set(0, -1.12, 1.02);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, -0.04, 0.04);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 0.6; controls.maxDistance = 4;
  luzes(scene);
  const raiz = new THREE.Group();
  scene.add(raiz);
  r3 = { renderer, scene, camera, controls, raiz, cena: null, menu: null };

  const raio = new THREE.Raycaster();
  let inicio = null;
  renderer.domElement.addEventListener('pointerdown', e => { inicio = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!inicio || Math.hypot(e.clientX - inicio[0], e.clientY - inicio[1]) > 6) return;   // foi rotação, não toque
    const r = renderer.domElement.getBoundingClientRect();
    raio.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    r3.cena?.tocar(raio);
  });

  new ResizeObserver(() => {
    const w = el.clientWidth, h = el.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }).observe(el);

  renderer.setAnimationLoop(() => {
    if (vista !== '3d') return;
    controls.update();
    r3.cena?.atualizar();
    renderer.render(scene, camera);
  });
}

function agendar3D() {
  if (vista !== '3d') return;
  clearTimeout(tempo3D);
  tempo3D = setTimeout(reconstruir3D, 220);
}

async function reconstruir3D() {
  if (!r3) iniciar3D();
  const img = $('#img-menu');
  if (!img.complete) await new Promise(r => img.addEventListener('load', r, { once: true }));
  const aspeto = img.naturalHeight / img.naturalWidth || 1.4;
  if (!r3.menu || r3.menu.userData.src !== img.src) {
    if (r3.menu) r3.scene.remove(r3.menu);
    const tex = new THREE.Texture(img); tex.needsUpdate = true; tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = r3.renderer.capabilities.getMaxAnisotropy();
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(1, aspeto), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    const sombra = new THREE.Mesh(new THREE.PlaneGeometry(1.04, aspeto + 0.04), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 }));
    sombra.position.set(0.01, -0.015, -0.002);
    const g = new THREE.Group(); g.add(sombra, menu); g.userData.src = img.src;
    r3.scene.add(g); r3.menu = g;
  }
  if (!r3.cena) r3.cena = new Cena({ raiz: r3.raiz, aspeto, pratos: pratos() });
  r3.cena.aspeto = aspeto;
  r3.cena.pratos = pratos();
  await r3.cena.montar(itens);
  r3.cena.aoDetetar();
}

// ---------------- reconhecimento + guardar ----------------
async function compilar() {
  if (!imgMenuFicheiro) return;
  const btn = $('#compilar');
  const estado = $('#estado-impresso');
  btn.disabled = true;
  try {
    estado.textContent = 'A carregar o motor de reconhecimento…';
    await import('/vendor/mindar/mindar-image.prod.js');
    const img = $('#img-menu');
    if (!img.complete) await new Promise(r => img.addEventListener('load', r, { once: true }));
    const compiler = new window.MINDAR.IMAGE.Compiler();
    await compiler.compileImageTargets([img], prog => { estado.textContent = `A analisar o menu… ${Math.round(prog)}%`; });
    const dados = await compiler.exportData();
    estado.textContent = 'A guardar…';
    const [imgUp, mindUp] = await Promise.all([
      ctx.upload('image', imgMenuFicheiro),
      ctx.upload('target', new Blob([dados]), 'menu.mind'),
    ]);
    const r = await ctx.api(`/api/restaurants/${ctx.sess.id}`, {
      method: 'PUT', key: ctx.chave(),
      body: { print: { imageUrl: imgUp.url, mindUrl: mindUp.url, width: img.naturalWidth, height: img.naturalHeight, scene: itens } },
    });
    ctx.definirRestaurante(r.restaurant);
    imgMenuFicheiro = null;
    marcarAlterado(false);
    pintarTudo();
    estado.textContent = 'Reconhecimento pronto.';
    ctx.toast('Menu pronto para AR');
  } catch (err) {
    console.error(err);
    estado.textContent = `Não foi possível preparar o reconhecimento: ${err.message}`;
  }
  btn.disabled = false;
}

async function guardar() {
  const btn = $('#guardar-cena');
  btn.disabled = true;
  try {
    const r = await ctx.api(`/api/restaurants/${ctx.sess.id}`, { method: 'PUT', key: ctx.chave(), body: { print: { ...rest().print, scene: itens } } });
    ctx.definirRestaurante(r.restaurant);
    itens = structuredClone(r.restaurant.print.scene || []);
    marcarAlterado(false);
    pintarCamadas();
    ctx.toast('Cena guardada');
  } catch (err) { ctx.toast(err.message); btn.disabled = false; }
}

// ---------------- eventos ----------------
function ligarEventos() {
  ligarArrastar();

  $$('.in-menu-img').forEach(inp => inp.addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    imgMenuFicheiro = f;
    $('#img-menu').src = URL.createObjectURL(f);
    pintarTudo();
    $('#estado-impresso').textContent = 'Imagem nova. Prepara o reconhecimento para a usar.';
  }));
  $('#compilar').addEventListener('click', compilar);
  $('#guardar-cena').addEventListener('click', guardar);

  $('#add-prato').addEventListener('click', () => {
    const lista = pratos();
    if (!lista.length) return ctx.toast('Cria primeiro um prato no separador Pratos.');
    const usado = new Set(itens.map(i => i.dishId));
    const p = lista.find(x => x.modelUrl && !usado.has(x.id)) || lista.find(x => !usado.has(x.id)) || lista[0];
    adicionarItem({ tipo: 'prato', dishId: p.id, quando: 'toque', animacao: 'salto', tamanho: 0.34 });
  });
  $('#add-texto').addEventListener('click', () => adicionarItem({ tipo: 'texto', texto: 'Novo', tamanho: 0.22, deitado: true }));
  $('#add-imagem').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const up = await ctx.upload('image', f);
      adicionarItem({ tipo: 'imagem', url: up.url, tamanho: 0.3 });
    } catch (err) { ctx.toast(err.message); }
  });

  $('#camadas').addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      itens = itens.filter(i => i.id !== rm.dataset.rm);
      if (selecionado === rm.dataset.rm) selecionado = null;
      mudou(); pintarPropriedades();
      return;
    }
    const li = e.target.closest('.camada');
    if (li) { selecionado = li.dataset.id; pintarMarcadores(); pintarCamadas(); pintarPropriedades(); }
  });

  $$('[data-vista]').forEach(b => b.addEventListener('click', () => {
    vista = b.dataset.vista;
    $$('[data-vista]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $('#vista-planta').classList.toggle('oculto', vista !== 'planta');
    $('#vista-3d').classList.toggle('oculto', vista !== '3d');
    if (vista === '3d') reconstruir3D(); else pintarMarcadores();
  }));

  document.addEventListener('keydown', e => {
    if ($('#aba-impresso').classList.contains('oculto') || !selecionado) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      itens = itens.filter(i => i.id !== selecionado);
      selecionado = null; mudou(); pintarPropriedades();
    }
  });
  addEventListener('beforeunload', e => { if (alterado) e.preventDefault(); });
}
