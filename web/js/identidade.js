// Editor de identidade (só a plataforma): dá a cada restaurante um menu com a sua cara.
import { esc } from './comum.js';
import {
  PREDEFINIDOS, LETRAS, OPCOES, PADRAO, TEXTOS_PADRAO, limparTema, comPredefinido,
  contraste, misturar, luminancia, textoSobre, variaveis,
} from './temas.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const ICONE = id => `<svg class="ic" aria-hidden="true"><use href="/img/icones.svg#${id}"/></svg>`;
const VISUAL = ['base', 'cores', 'letras', 'cantos', 'botoes', 'prato', 'disposicao', 'cabecalho', 'textura', 'luz', 'movimento', 'cssExtra'];
const NOMES_CORES = { fundo: 'Fundo', superficie: 'Cartões', texto: 'Texto', suave: 'Texto secundário', acento: 'Botões', destaque: 'Destaque do 3D' };
const DIAS = [[1, 'Segunda'], [2, 'Terça'], [3, 'Quarta'], [4, 'Quinta'], [5, 'Sexta'], [6, 'Sábado'], [0, 'Domingo']];

let ctx = null, rid = null, estado = null, t = null, modelos = [];
let temporizador = null, ligado = false, iframePronto = false, quadro = 0;
const clonar = o => JSON.parse(JSON.stringify(o));

// ---------------- abrir / fechar ----------------
export async function abrir(contexto, id) {
  ctx = contexto; rid = id;
  if (!ligado) { ligar(); ligado = true; }
  carregarLetras();
  try {
    [estado, { modelos }] = await Promise.all([
      ctx.api(`/api/plataforma/restaurantes/${rid}/tema`),
      ctx.api('/api/plataforma/modelos'),
    ]);
  } catch (err) { return ctx.toast(err.message); }
  t = clonar(estado.rascunho || estado.publicado);
  const r = estado.restaurante;
  $('#id-nome').textContent = r.nome;
  $('#id-ver').href = `/m/${r.slug}`;
  pintarAvatar();
  iframePronto = false;
  $('#id-previa').src = `/m/${encodeURIComponent(r.slug)}?previa=1&mesa=4`;
  $$('[data-vista]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.vista === 'menu')));
  mostrarSecao('estilo');
  $('#identidade').classList.remove('oculto');
  document.body.style.overflow = 'hidden';
  pintarTudo();
  pintarEstado();
  $('#id-guardado').textContent = estado.rascunho ? `Rascunho de ${quando(estado.rascunhoEm)}` : '';
  requestAnimationFrame(escalar);
}

async function fechar() {
  if (temporizador) { clearTimeout(temporizador); await guardarRascunho(); }
  $('#identidade').classList.add('oculto');
  $('#id-previa').src = 'about:blank';
  document.body.style.overflow = '';
  ctx.aoFechar?.();
}

function carregarLetras() {
  if (document.getElementById('letras-editor')) return;
  const link = Object.assign(document.createElement('link'), { id: 'letras-editor', rel: 'stylesheet', href: '/vendor/letras/todas.css' });
  document.head.append(link);
}

const quando = iso => iso ? new Date(iso).toLocaleString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const familia = (grupo, id) => `"${LETRAS[grupo][id].nome}", ${LETRAS[grupo][id].tipo === 'serif' ? 'serif' : 'sans-serif'}`;

function pintarAvatar() {
  const r = estado.restaurante;
  for (const el of [$('#id-avatar'), $('#id-logo-prev')]) {
    el.textContent = r.logoUrl ? '' : (r.nome.trim()[0] || '').toUpperCase();
    el.style.backgroundImage = r.logoUrl ? `url('${r.logoUrl}')` : '';
    el.style.backgroundColor = r.logoUrl ? (t?.cores.fundo || '#FFFFFF') : t?.cores.acento || '';
    el.style.backgroundSize = 'contain';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundOrigin = 'content-box';
    el.style.padding = r.logoUrl ? '3px' : '';
  }
}

function pintarEstado() {
  const el = $('#id-estado');
  el.classList.toggle('rascunho', Boolean(estado.rascunho));
  el.textContent = estado.rascunho ? 'Rascunho por publicar' : estado.temPublicado ? 'Publicado' : 'Estilo padrão (ainda não personalizado)';
  $('#id-bloquear').checked = estado.identidadeBloqueada;
}

// ---------------- alterações ----------------
function mudou({ repintar = false } = {}) {
  if (repintar) pintarTudo(); else pintarDinamicos();
  enviarPrevia();
  $('#id-guardado').textContent = 'A guardar…';
  clearTimeout(temporizador);
  temporizador = setTimeout(guardarRascunho, 1000);
}

async function guardarRascunho() {
  temporizador = null;
  try {
    estado = await ctx.api(`/api/plataforma/restaurantes/${rid}/tema`, { method: 'PUT', body: { tema: t } });
    $('#id-guardado').textContent = `Rascunho guardado às ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
    pintarEstado();
  } catch (err) { $('#id-guardado').textContent = 'Não foi possível guardar'; ctx.toast(err.message); }
}

async function publicar() {
  clearTimeout(temporizador); temporizador = null;
  const b = $('#id-publicar');
  b.disabled = true;
  try {
    estado = await ctx.api(`/api/plataforma/restaurantes/${rid}/tema`, { method: 'PUT', body: { tema: t, publicar: true } });
    t = clonar(estado.publicado);
    $('#id-guardado').textContent = `Publicado às ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
    ctx.toast('Publicado. Os clientes já veem o menu novo.');
    pintarEstado();
    pintarVersoes();
  } catch (err) { ctx.toast(err.message); }
  b.disabled = false;
}

// ---------------- pré-visualização ----------------
function enviarPrevia() {
  if (!iframePronto) return;
  cancelAnimationFrame(quadro);
  quadro = requestAnimationFrame(() => {
    $('#id-previa').contentWindow?.postMessage({ tipo: 'tema', tema: t, logoUrl: estado.restaurante.logoUrl }, location.origin);
  });
}

function escalar() {
  const m = $('#id-moldura'), tel = $('.telemovel');
  if (!m || $('#identidade').classList.contains('oculto')) return;
  const { width, height } = m.getBoundingClientRect();
  const s = Math.min(1, (height - 36) / 866, (width - 36) / 412);
  tel.style.transform = `translate(-50%, -50%) scale(${Math.max(0.3, s)})`;
}

// ---------------- pintura dos controlos ----------------
function pintarTudo() {
  pintarPredefinidos();
  pintarModelos();
  pintarCopiar();
  pintarCores();
  pintarLetras();
  pintarEscolhas();
  pintarCampos();
  pintarDestaques();
  pintarDias();
  pintarVersoes();
  pintarCapa();
}
// partes que dependem de outras escolhas (cores mudam as amostras de prato e mesa, etc.)
function pintarDinamicos() {
  pintarContraste();
  pintarAvatar();
  pintarEscolhas();
  pintarCapa();
  $$('.predef[data-pre]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pre === t.base)));
}

function cartaoEstilo(tema, { nome, resumo, attrs = '', apagar = '' }) {
  const v = variaveis(limparTema(tema));
  const c = tema.cores;
  return `<button class="predef" ${attrs}>
    <span class="amostra" style="background:${v['--linho']};color:${c.texto}">
      <em>${[c.fundo, c.acento, c.destaque].map(x => `<span style="background:${x}"></span>`).join('')}</em>
      <b style="font-family:${familia('titulo', tema.letras.titulo)};color:${luminancia(c.fundo) < .2 || tema.textura === 'madeira' || tema.textura === 'escuro' ? '#F5F1EA' : c.texto}">Aa</b>
      <i style="background:${v['--prato'] === 'transparent' ? c.superficie : v['--prato']}"></i>
    </span>
    <span class="legenda"><strong>${esc(nome)}</strong>${resumo ? `<small>${esc(resumo)}</small>` : ''}</span>
    ${apagar}
  </button>`;
}

function pintarPredefinidos() {
  $('#id-predefinidos').innerHTML = Object.entries(PREDEFINIDOS).map(([id, p]) =>
    cartaoEstilo(comPredefinido(PADRAO, id), { nome: p.nome, resumo: p.resumo, attrs: `data-pre="${id}" aria-pressed="${t.base === id}"` })).join('');
}

function pintarModelos() {
  $('#id-modelos').innerHTML = modelos.length ? modelos.map(m =>
    cartaoEstilo({ ...PADRAO, ...m.tema }, {
      nome: m.nome, resumo: `Guardado ${quando(m.criadoEm)}`, attrs: `data-modelo="${m.id}"`,
      apagar: `<span class="apagar" role="button" tabindex="0" data-apagar-modelo="${m.id}" aria-label="Apagar o modelo ${esc(m.nome)}">${ICONE('lixo')}</span>`,
    })).join('') : '<p class="vazio-pequeno">Ainda não guardaste nenhum. Afina um estilo e guarda-o para o usar noutros restaurantes.</p>';
}

function pintarCopiar() {
  const outros = (ctx.restaurantes() || []).filter(r => r.id !== rid);
  $('#id-copiar-de').innerHTML = outros.length
    ? outros.map(r => `<option value="${r.id}">${esc(r.nome)}${r.tema?.publicado ? '' : ' (estilo padrão)'}</option>`).join('')
    : '<option value="">Não há outros restaurantes</option>';
  $('#id-copiar').disabled = !outros.length;
}

function pintarCores() {
  $('#id-cores').innerHTML = Object.entries(NOMES_CORES).map(([k, nome]) => `
    <label class="cor">
      <input type="color" data-cor="${k}" value="${t.cores[k]}" aria-label="${nome}">
      <span><small>${nome}</small><input type="text" data-cor-hex="${k}" value="${t.cores[k]}" maxlength="7" spellcheck="false" aria-label="${nome} (hexadecimal)"></span>
    </label>`).join('');
  pintarContraste();
}

function pintarContraste() {
  const c = t.cores;
  const nota = (v, minimo = 4.5) => {
    const cls = v >= minimo ? 'bom' : v >= 3 ? 'medio' : 'mau';
    const txt = v >= minimo ? 'Legível' : v >= 3 ? 'Fraco para texto pequeno' : 'Difícil de ler';
    return `<span class="nota ${cls}" title="${txt}">${v.toFixed(1)} : 1 · ${txt}</span>`;
  };
  $('#id-contraste').innerHTML = [
    ['Texto sobre o fundo', contraste(c.texto, c.fundo)],
    ['Texto secundário sobre o fundo', contraste(c.suave, c.fundo)],
    ['Texto sobre os cartões', contraste(c.texto, c.superficie)],
    ['Letras dos botões', contraste(c.acento, textoSobre(c.acento))],
    ['Botões contra o fundo', contraste(c.acento, c.fundo), 3],
  ].map(([n, v, min]) => `<li><span>${n}</span>${nota(v, min)}</li>`).join('');
}

function pintarLetras() {
  const nome = estado.restaurante.nome.length > 14 ? estado.restaurante.nome.slice(0, 13) + '…' : estado.restaurante.nome;
  $('#id-letra-titulo').innerHTML = Object.entries(LETRAS.titulo).map(([id, l]) => `
    <button class="letra" data-letra-titulo="${id}" aria-pressed="${t.letras.titulo === id}">
      <b style="font-family:${familia('titulo', id)}">${esc(nome)}</b><small>${l.nome} · ${l.estilo}</small>
    </button>`).join('');
  $('#id-letra-texto').innerHTML = Object.entries(LETRAS.texto).map(([id, l]) => `
    <button class="letra texto" data-letra-texto="${id}" aria-pressed="${t.letras.texto === id}">
      <b style="font-family:${familia('texto', id)}">Calulu de peixe com funge</b><small>${l.nome}</small>
    </button>`).join('');
}

function iconeEscolha(campo, k) {
  const v = () => variaveis(limparTema({ ...t, [campo]: k }));
  if (campo === 'logo.forma') {
    const url = estado.restaurante.logoUrl;
    const raio = { circulo: '50%', arredondado: '22%', livre: '0' }[k];
    const fundo = t.logo.fundo && k !== 'livre' ? '#FFFFFF' : t.cores.fundo;
    return `<span class="icone-escolha logo-amostra" style="border-radius:${raio};background-color:${fundo};${url ? `background-image:url('${esc(url)}')` : ''};${k === 'livre' ? 'width:100%;box-shadow:none' : 'width:46px'}"></span>`;
  }
  if (campo === 'logo.tamanho') return '';
  if (campo === 'disposicao') return `<span class="icone-escolha disp-${k}"></span>`;
  if (campo === 'cabecalho') return `<span class="icone-escolha cab-${k}"></span>`;
  if (campo === 'prato') return `<span class="icone-escolha" style="background:${k === 'sem' ? 'var(--mesa)' : v()['--prato']};${k === 'sem' ? 'border-radius:10px' : ''}"></span>`;
  if (campo === 'textura') return `<span class="icone-escolha" style="background:${v()['--linho']}"></span>`;
  if (campo === 'cantos') return `<span class="icone-escolha" style="width:34px;height:26px;background:var(--branco);border:2px solid var(--tinta-2);border-radius:${{ reto: 2, suave: 7, redondo: 12 }[k]}px"></span>`;
  if (campo === 'botoes') return `<span class="icone-escolha" style="width:46px;height:18px;margin:4px 0;background:${t.cores.acento};border-radius:${{ pilula: 999, suave: 6, reto: 1 }[k]}px"></span>`;
  return '';
}

function pintarEscolhas() {
  $$('.escolhas[data-campo]').forEach(el => {
    const campo = el.dataset.campo;
    el.innerHTML = Object.entries(OPCOES[campo]).map(([k, nome]) =>
      `<button class="escolha" data-escolha="${k}" aria-pressed="${ler(campo) === k}">${iconeEscolha(campo, k)}<span>${nome}</span></button>`).join('');
  });
}

const ler = caminho => caminho.split('.').reduce((o, k) => o?.[k], t);
function escrever(caminho, valor) {
  const partes = caminho.split('.');
  const ultimo = partes.pop();
  partes.reduce((o, k) => (o[k] ??= {}), t)[ultimo] = valor;
}

function pintarCampos() {
  $$('#identidade [data-t]').forEach(el => {
    const v = ler(el.dataset.t);
    if (el.type === 'checkbox') el.checked = Boolean(v);
    else el.value = v ?? '';
    if (el.dataset.t.startsWith('textos.') && TEXTOS_PADRAO[el.dataset.t.slice(7)]) el.placeholder = TEXTOS_PADRAO[el.dataset.t.slice(7)];
  });
}

function pintarDestaques() {
  const sel = t.destaques;
  $('#id-destaques').innerHTML = estado.pratos.length ? estado.pratos.map(p => {
    const i = sel.indexOf(p.id);
    return `<label>
      <input type="checkbox" data-destaque="${p.id}" ${i >= 0 ? 'checked' : ''} ${i < 0 && sel.length >= 8 ? 'disabled' : ''}>
      <span class="mini">${p.imagem ? `<img src="${esc(p.imagem)}" alt="">` : ''}</span>
      <span>${esc(p.nome)}<br><small>${esc(p.categoria || 'Sem categoria')}${p.tem3d ? ' · 3D' : ''}</small></span>
      ${i >= 0 ? `<span class="ordem">${i + 1}</span>` : '<span></span>'}
    </label>`;
  }).join('') : '<p class="vazio-pequeno">Este restaurante ainda não tem pratos.</p>';
}

function pintarDias() {
  $('#id-dias').innerHTML = DIAS.map(([i, nome]) => {
    const d = t.horario.dias[i];
    return `<div class="dia${d.aberto ? '' : ' fechado'}" data-dia="${i}">
      <strong>${nome}</strong>
      <label class="interruptor" title="${d.aberto ? 'Aberto' : 'Fechado'}"><input type="checkbox" data-dia-aberto ${d.aberto ? 'checked' : ''}><span class="sr">${nome} aberto</span></label>
      <input type="time" data-dia-abre value="${d.abre}" aria-label="${nome}: abre">
      <span class="mudo">às</span>
      <input type="time" data-dia-fecha value="${d.fecha}" aria-label="${nome}: fecha">
    </div>`;
  }).join('');
}

function pintarVersoes() {
  const h = estado.historico;
  $('#id-versoes').innerHTML = h.length ? h.map(v => `
    <li>
      <span class="faixa-mini">${[v.tema.cores.fundo, v.tema.cores.acento, v.tema.cores.destaque].map(c => `<span style="background:${c}"></span>`).join('')}</span>
      <span>Versão ${v.versao} · ${PREDEFINIDOS[v.tema.base]?.nome || ''}<br><small class="mudo">publicada ${quando(v.em)}</small></span>
      <button class="btn secundario pequeno" data-versao="${v.versao}">Carregar</button>
    </li>`).join('') : '<li class="mudo" style="border:0;background:none;padding:0">Ainda não há versões anteriores. Cada vez que publicas, a versão anterior fica aqui.</li>';
}

function pintarCapa() {
  $('#id-capa-bloco').classList.toggle('oculto', t.cabecalho !== 'capa');
  $('#id-capa-prev').style.backgroundImage = t.capaUrl ? `url('${t.capaUrl}')` : '';
  $('#id-capa-tirar').classList.toggle('oculto', !t.capaUrl);
}

function mostrarSecao(sec) {
  $$('.id-abas [data-sec]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.sec === sec)));
  $$('.id-secoes > section').forEach(s => s.classList.toggle('oculto', s.dataset.sec !== sec));
  $('.id-secoes').scrollTop = 0;
}

// ---------------- cores a partir do logo ----------------
async function coresDoLogo(url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const n = 56, c = Object.assign(document.createElement('canvas'), { width: n, height: n });
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, n, n);
  const d = g.getImageData(0, 0, n, n).data;
  const caixas = new Map();
  let claros = 0, escuros = 0, total = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const [r, gg, b] = [d[i], d[i + 1], d[i + 2]];
    const max = Math.max(r, gg, b), min = Math.min(r, gg, b);
    const l = (max + min) / 510, sat = max ? (max - min) / max : 0;
    total++;
    if (l > 0.92) { claros++; continue; }
    if (l < 0.08) { escuros++; continue; }
    const k = ((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4);
    const e = caixas.get(k) || { n: 0, r: 0, g: 0, b: 0, sat: 0 };
    e.n++; e.r += r; e.g += gg; e.b += b; e.sat += sat;
    caixas.set(k, e);
  }
  const hex = (r, gg, b) => '#' + [r, gg, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const lista = [...caixas.values()].map(e => ({ cor: hex(e.r / e.n, e.g / e.n, e.b / e.n), peso: e.n * (0.3 + e.sat / e.n) }))
    .sort((a, b) => b.peso - a.peso);
  const escolhidas = [];
  const dist = (a, b) => { const A = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), B = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16)); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  for (const { cor } of lista) {
    if (escolhidas.every(x => dist(x, cor) > 70)) escolhidas.push(cor);
    if (escolhidas.length === 3) break;
  }
  return { cores: escolhidas, logoEscuro: escuros > claros && escuros / Math.max(1, total) > 0.25 };
}

// garante que o acento se vê contra o fundo
function afinarAcento(acento, fundo, texto) {
  for (let k = 1; k >= 0.3; k -= 0.1) {
    const c = misturar(acento, texto, k);
    if (contraste(c, fundo) >= 3) return c.toUpperCase();
  }
  return texto;
}

function propostas(cores) {
  const [a, b = misturar(a, '#E3A532', 0.35)] = cores;
  const textoEscuro = misturar(a, '#141414', 0.1), suaveEscuro = misturar(a, '#5A5A5A', 0.15);
  const claro = { fundo: misturar(a, '#FAFAF7', 0.04), superficie: '#FFFFFF', texto: textoEscuro, suave: suaveEscuro };
  const vivo = { fundo: misturar(a, '#FFFFFF', 0.13), superficie: '#FFFFFF', texto: textoEscuro, suave: suaveEscuro };
  const noite = { fundo: misturar(a, '#101010', 0.07), superficie: misturar(a, '#1C1C1C', 0.08), texto: '#F4F0EA', suave: '#ABA49A' };
  return [['Clara', claro], ['Viva', vivo], ['Escura', noite]].map(([nome, p]) => [nome, {
    ...p, acento: afinarAcento(a, p.fundo, p.texto), destaque: afinarAcento(b, p.fundo, p.texto),
  }]);
}

async function sugerirDoLogo() {
  const url = estado.restaurante.logoUrl;
  if (!url) { $('#id-logo-ajuda').textContent = 'Este restaurante ainda não tem logo. Carrega-o em Conteúdo.'; return; }
  try {
    const { cores } = await coresDoLogo(url);
    if (!cores.length) { $('#id-logo-ajuda').textContent = 'O logo é só preto e branco. Escolhe a cor dos botões à mão.'; return; }
    const ps = propostas(cores);
    $('#id-logo-ajuda').textContent = `Encontrámos ${cores.length} ${cores.length === 1 ? 'cor' : 'cores'} no logo. Escolhe uma paleta:`;
    $('#id-paletas').innerHTML = ps.map(([nome, p], i) => `
      <button class="paleta" data-paleta="${i}">
        <span class="faixa"><span style="background:${p.fundo}"></span><span style="background:${p.acento}"></span><span style="background:${p.destaque}"></span></span>
        ${nome}
      </button>`).join('');
    $$('[data-paleta]').forEach(bt => bt.addEventListener('click', () => {
      t.cores = { ...ps[bt.dataset.paleta][1] };
      if (luminancia(t.cores.fundo) < 0.2 && ['linho', 'papel', 'liso'].includes(t.textura)) t.textura = 'escuro';
      if (luminancia(t.cores.fundo) >= 0.2 && t.textura === 'escuro') t.textura = 'linho';
      pintarCores(); mudou();
    }));
  } catch { $('#id-logo-ajuda').textContent = 'Não foi possível ler o logo.'; }
}

// ---------------- imagens ----------------
async function reduzir(ficheiro, max, tipo = 'image/jpeg') {
  const img = await createImageBitmap(ficheiro);
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * s), height: Math.round(img.height * s) });
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, tipo, 0.86));
  return new File([blob], tipo === 'image/png' ? 'imagem.png' : 'imagem.jpg', { type: tipo });
}

async function carregarImagem(ficheiro, max, tipo) {
  const form = new FormData();
  form.append('file', await reduzir(ficheiro, max, tipo));
  const res = await fetch(`/api/restaurants/${rid}/upload/image`, { method: 'POST', headers: { 'x-admin-key': `plat:${ctx.chave()}` }, body: form });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Falhou o envio da imagem.');
  return d.url;
}

// ---------------- eventos ----------------
function ligar() {
  $('#id-voltar').addEventListener('click', fechar);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#identidade').classList.contains('oculto') && !document.querySelector('dialog[open]')) fechar(); });
  $('#id-publicar').addEventListener('click', publicar);
  $$('.id-abas [data-sec]').forEach(b => b.addEventListener('click', () => mostrarSecao(b.dataset.sec)));
  new ResizeObserver(escalar).observe($('#id-moldura'));

  addEventListener('message', e => {
    if (e.origin !== location.origin || e.data?.tipo !== 'menu-pronto') return;
    iframePronto = true;
    enviarPrevia();
    if ($('[data-vista="prato"]').getAttribute('aria-selected') === 'true') setTimeout(() => $('#id-previa').contentWindow.postMessage({ tipo: 'abrir-prato' }, location.origin), 50);
  });
  $$('[data-vista]').forEach(b => b.addEventListener('click', () => {
    $$('[data-vista]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $('#id-previa').contentWindow?.postMessage({ tipo: b.dataset.vista === 'prato' ? 'abrir-prato' : 'fechar' }, location.origin);
  }));

  // estilos
  $('#id-predefinidos').addEventListener('click', e => {
    const b = e.target.closest('[data-pre]');
    if (!b) return;
    t = comPredefinido(t, b.dataset.pre);
    mudou({ repintar: true });
  });
  $('#id-modelos').addEventListener('click', async e => {
    const apagar = e.target.closest('[data-apagar-modelo]');
    if (apagar) {
      e.stopPropagation();
      const m = modelos.find(x => x.id === apagar.dataset.apagarModelo);
      if (!confirm(`Apagar o modelo "${m.nome}"? Os restaurantes que já o usam não mudam.`)) return;
      ({ modelos } = await ctx.api(`/api/plataforma/modelos/${m.id}`, { method: 'DELETE' }));
      return pintarModelos();
    }
    const b = e.target.closest('[data-modelo]');
    if (!b) return;
    const m = modelos.find(x => x.id === b.dataset.modelo);
    t = { ...t, ...clonar(m.tema) };
    mudou({ repintar: true });
  });
  $('#id-guardar-modelo').addEventListener('click', async () => {
    const nome = prompt('Nome do modelo (ex.: "Noite dourada")', PREDEFINIDOS[t.base]?.nome ? `${PREDEFINIDOS[t.base].nome} · ${estado.restaurante.nome}` : estado.restaurante.nome);
    if (!nome) return;
    try { ({ modelos } = await ctx.api('/api/plataforma/modelos', { method: 'POST', body: { nome, tema: t } })); pintarModelos(); ctx.toast('Modelo guardado'); }
    catch (err) { ctx.toast(err.message); }
  });
  $('#id-copiar').addEventListener('click', async () => {
    const outro = $('#id-copiar-de').value;
    if (!outro) return;
    try {
      const e = await ctx.api(`/api/plataforma/restaurantes/${outro}/tema`);
      const fonte = e.publicado;
      for (const k of VISUAL) t[k] = clonar(fonte[k]);
      mudou({ repintar: true });
      ctx.toast(`Estilo de ${e.restaurante.nome} copiado`);
    } catch (err) { ctx.toast(err.message); }
  });

  // cores
  $('#id-cores').addEventListener('input', e => {
    const k = e.target.dataset.cor || e.target.dataset.corHex;
    if (!k) return;
    let v = e.target.value.trim();
    if (e.target.dataset.corHex) { if (!v.startsWith('#')) v = '#' + v; if (!/^#[0-9a-f]{6}$/i.test(v)) return; }
    t.cores[k] = v.toUpperCase();
    const outro = e.target.dataset.cor ? $(`[data-cor-hex="${k}"]`) : $(`[data-cor="${k}"]`);
    outro.value = e.target.dataset.cor ? v.toUpperCase() : v.toLowerCase();
    mudou();
  });
  $('#id-do-logo').addEventListener('click', sugerirDoLogo);

  // letras
  $('#id-letra-titulo').addEventListener('click', e => {
    const b = e.target.closest('[data-letra-titulo]'); if (!b) return;
    t.letras.titulo = b.dataset.letraTitulo;
    $$('[data-letra-titulo]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    mudou();
  });
  $('#id-letra-texto').addEventListener('click', e => {
    const b = e.target.closest('[data-letra-texto]'); if (!b) return;
    t.letras.texto = b.dataset.letraTexto;
    $$('[data-letra-texto]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    mudou();
  });

  // escolhas visuais
  $$('.escolhas[data-campo]').forEach(el => el.addEventListener('click', e => {
    const b = e.target.closest('[data-escolha]'); if (!b) return;
    escrever(el.dataset.campo, b.dataset.escolha);
    mudou();
  }));

  // campos de texto e interruptores
  $('#identidade').addEventListener('input', e => {
    const c = e.target.dataset?.t;
    if (!c) return;
    escrever(c, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
    mudou();
  });

  // capa e logo
  $('#id-capa').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { $('#id-guardado').textContent = 'A enviar a capa…'; t.capaUrl = await carregarImagem(f, 1800, 'image/jpeg'); mudou(); }
    catch (err) { ctx.toast(err.message); }
  });
  $('#id-capa-tirar').addEventListener('click', () => { t.capaUrl = ''; mudou(); });
  $('#id-logo').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const url = await carregarImagem(f, 600, 'image/png');
      const res = await fetch(`/api/restaurants/${rid}`, { method: 'PUT', headers: { 'x-admin-key': `plat:${ctx.chave()}`, 'content-type': 'application/json' }, body: JSON.stringify({ logoUrl: url }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Não foi possível trocar o logo.');
      estado.restaurante.logoUrl = url;
      pintarAvatar();
      pintarEscolhas();
      enviarPrevia();
      ctx.toast('Logo trocado');
    } catch (err) { ctx.toast(err.message); }
  });

  // sugestões
  $('#id-destaques').addEventListener('change', e => {
    const id = e.target.dataset.destaque; if (!id) return;
    t.destaques = e.target.checked ? [...t.destaques, id].slice(0, 8) : t.destaques.filter(x => x !== id);
    pintarDestaques();
    mudou();
  });

  // horário
  $('#id-dias').addEventListener('input', e => {
    const linha = e.target.closest('[data-dia]'); if (!linha) return;
    const d = t.horario.dias[linha.dataset.dia];
    if (e.target.matches('[data-dia-aberto]')) { d.aberto = e.target.checked; linha.classList.toggle('fechado', !d.aberto); }
    if (e.target.matches('[data-dia-abre]') && e.target.value) d.abre = e.target.value;
    if (e.target.matches('[data-dia-fecha]') && e.target.value) d.fecha = e.target.value;
    mudou();
  });
  $('#id-dias-todos').addEventListener('click', () => {
    const seg = t.horario.dias[1];
    t.horario.dias = t.horario.dias.map(() => ({ ...seg }));
    pintarDias();
    mudou();
  });

  // avançado
  $('#id-bloquear').addEventListener('change', async e => {
    try {
      estado = await ctx.api(`/api/plataforma/restaurantes/${rid}/tema`, { method: 'PUT', body: { identidadeBloqueada: e.target.checked } });
      ctx.toast(e.target.checked ? 'O gerente já não pode mudar a cor' : 'O gerente pode voltar a mudar a cor');
    } catch (err) { ctx.toast(err.message); e.target.checked = !e.target.checked; }
  });
  $('#id-versoes').addEventListener('click', e => {
    const b = e.target.closest('[data-versao]'); if (!b) return;
    const v = estado.historico.find(x => String(x.versao) === b.dataset.versao);
    t = clonar(v.tema);
    mudou({ repintar: true });
    ctx.toast(`Versão ${v.versao} carregada. Publica para a repor.`);
  });
  $('#id-descartar').addEventListener('click', async () => {
    if (!confirm('Descartar o rascunho? Voltas ao que está publicado agora.')) return;
    clearTimeout(temporizador); temporizador = null;
    estado = await ctx.api(`/api/plataforma/restaurantes/${rid}/tema`, { method: 'PUT', body: { descartarRascunho: true } });
    t = clonar(estado.publicado);
    pintarTudo(); pintarEstado(); enviarPrevia();
    $('#id-guardado').textContent = 'Rascunho descartado';
  });
}
