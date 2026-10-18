// Ecrã da equipa: PIN → quadro de pedidos, pagamentos, mesas e esgotados.
// Cada botão só aparece se a pessoa tiver a permissão e o plano do restaurante incluir a funcionalidade;
// o servidor volta a verificar tudo.
import { esc, toast, dinheiro } from './comum.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const SESSAO = 'menu3d.equipa';
const CODIGO = 'menu3d.equipa.codigo';
const FUNCAO = { rececao: 'Receção', empregado: 'Empregado de mesa', cozinha: 'Cozinha' };
const METODOS = { dinheiro: 'Dinheiro', multicaixa: 'Multicaixa Express', tpa: 'TPA (cartão)', transferencia: 'Transferência' };
const ROTULO = { recebido: 'Recebido', confirmado: 'Confirmado', em_preparacao: 'Em preparação', pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado' };

let sess = null;
try { sess = JSON.parse(localStorage.getItem(SESSAO) || 'null'); } catch { sess = null; }
let pedidos = [], vistos = new Set(), primeiro = true, som = true, intervalo = null, mesas = [];

const pode = p => (sess?.membro?.permissoes || []).includes(p);
const temFunc = f => (sess?.funcionalidades || []).includes(f);
const moeda = n => dinheiro(n, sess?.restaurante?.moeda || 'Kz');

async function api(caminho, { method = 'GET', body } = {}) {
  const res = await fetch(caminho, {
    method,
    headers: { ...(sess ? { 'x-equipa-token': sess.token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await res.json().catch(() => ({}));
  if (res.status === 401 && sess) { sair('A tua sessão terminou. Entra de novo com o PIN.'); throw new Error('Sessão terminada.'); }
  if (!res.ok) throw new Error(d.error || `Erro ${res.status}`);
  return d;
}

// ---------------- entrada ----------------
let pin = '';
function mostrarPasso(passo) {
  $('#passo-codigo').classList.toggle('oculto', passo !== 'codigo');
  $('#passo-pin').classList.toggle('oculto', passo !== 'pin');
}

$('#f-codigo').addEventListener('submit', e => {
  e.preventDefault();
  const c = $('#codigo').value.trim().toLowerCase();
  if (!c) return;
  try { localStorage.setItem(CODIGO, c); } catch {}
  $('#nome-codigo').textContent = c;
  pin = ''; pintarPin();
  mostrarPasso('pin');
});
$('#trocar-codigo').addEventListener('click', () => { $('#codigo').value = localStorage.getItem(CODIGO) || ''; mostrarPasso('codigo'); });

function pintarPin() { $$('.pontos i').forEach((i, k) => i.classList.toggle('cheio', k < pin.length)); }

async function tecla(d) {
  if (pin.length >= 6) return;
  pin += d; pintarPin();
  $('#erro-pin').textContent = '';
  if (pin.length < 6) return;
  try {
    const res = await fetch('/api/equipa/entrar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigo: localStorage.getItem(CODIGO), pin }) });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || 'Não foi possível entrar.');
    sess = r;
    try { localStorage.setItem(SESSAO, JSON.stringify(sess)); } catch {}
    iniciar();
  } catch (err) {
    $('#erro-pin').textContent = err.message;
    $('.pontos').classList.remove('erro'); void $('.pontos').offsetWidth; $('.pontos').classList.add('erro');
    pin = ''; setTimeout(pintarPin, 300);
  }
}
$$('.teclado [data-d]').forEach(b => b.addEventListener('click', () => tecla(b.dataset.d)));
$('.teclado [data-apagar]').addEventListener('click', () => { pin = pin.slice(0, -1); pintarPin(); });
document.addEventListener('keydown', e => {
  if ($('#passo-pin').classList.contains('oculto') || $('#entrada').classList.contains('oculto')) return;
  if (/^\d$/.test(e.key)) tecla(e.key);
  if (e.key === 'Backspace') { pin = pin.slice(0, -1); pintarPin(); }
});

function sair(msg) {
  try { localStorage.removeItem(SESSAO); } catch {}
  sess = null;
  clearInterval(intervalo);
  $('#app').classList.add('oculto');
  $('#entrada').classList.remove('oculto');
  pin = ''; pintarPin();
  const c = localStorage.getItem(CODIGO);
  if (c) { $('#nome-codigo').textContent = c; mostrarPasso('pin'); } else mostrarPasso('codigo');
  if (msg) $('#erro-pin').textContent = msg;
}
$('#sair').addEventListener('click', () => sair());

// ---------------- trabalho ----------------
function iniciar() {
  // sessões guardadas por versões antigas não trazem permissões: pede o PIN de novo
  if (!Array.isArray(sess?.membro?.permissoes)) return sair('Atualizámos o Menu 3D. Entra de novo com o teu PIN.');
  const r = sess.restaurante;
  document.documentElement.style.setProperty('--acento', r.cor || '#C8322B');
  $('#rest-nome').textContent = r.nome;
  $('#membro-nome').textContent = `${sess.membro.nome} · ${FUNCAO[sess.membro.funcao] || ''}`;
  $('#avatar').textContent = r.logoUrl ? '' : (r.nome.trim()[0] || '').toUpperCase();
  $('#avatar').style.backgroundImage = r.logoUrl ? `url('${r.logoUrl}')` : '';
  document.title = `${r.nome} · Equipa`;
  // separadores conforme permissões e plano
  $('[data-aba="pedidos"]').classList.toggle('oculto', !pode('pedidos'));
  $('[data-aba="mesas"]').classList.toggle('oculto', !(pode('mesas') && temFunc('mesas')));
  $('[data-aba="esgotados"]').classList.toggle('oculto', !pode('esgotados'));
  $('.coluna[data-estado="por_pagar"]').classList.toggle('oculto', !(pode('pagamentos') && temFunc('pagamentos')));
  $('.quadro').classList.toggle('com-pagar', pode('pagamentos') && temFunc('pagamentos'));
  const primeiraAba = $$('.abas [data-aba]').find(b => !b.classList.contains('oculto'));
  if (primeiraAba) mostrarAba(primeiraAba.dataset.aba);
  $('#entrada').classList.add('oculto');
  $('#app').classList.remove('oculto');
  primeiro = true;
  atualizar();
  carregarPratos();
  clearInterval(intervalo);
  intervalo = setInterval(() => { atualizar(); relogio(); }, 4000);
  relogio();
}

function atualizar() {
  if (pode('pedidos')) carregarPedidos();
  if (pode('mesas') && temFunc('mesas')) carregarMesas();
}

function relogio() { $('#relogio').textContent = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }); }

function mostrarAba(aba) {
  $$('.abas [data-aba]').forEach(x => x.setAttribute('aria-selected', String(x.dataset.aba === aba)));
  $$('.aba').forEach(s => s.classList.toggle('oculto', s.id !== `aba-${aba}`));
  if (aba === 'esgotados') carregarPratos();
  if (aba === 'mesas') carregarMesas();
}
$$('.abas [data-aba]').forEach(b => b.addEventListener('click', () => mostrarAba(b.dataset.aba)));

$('#som').addEventListener('click', () => {
  som = !som;
  $('#som').setAttribute('aria-pressed', String(som));
  $('#som').textContent = som ? 'Som ligado' : 'Som desligado';
  if (som) tocar();
});

// "plim" curto quando chega um pedido novo
let audio = null;
function tocar() {
  try {
    audio ||= new AudioContext();
    const t = audio.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.35);
      o.connect(g).connect(audio.destination);
      o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.4);
    });
  } catch { /* sem áudio neste aparelho */ }
}

async function carregarPedidos() {
  try {
    const r = await api(`/api/restaurants/${sess.restaurante.id}/orders`);
    pedidos = r.orders;
    const novos = pedidos.filter(p => p.status === 'recebido' && !vistos.has(p.id));
    if (!primeiro && novos.length && som) tocar();
    if (!document.querySelector('.metodos:not(.oculto)')) pintarPedidos(primeiro ? [] : novos.map(p => p.id));
    pedidos.forEach(p => vistos.add(p.id));
    primeiro = false;
  } catch { /* sem rede: tenta outra vez daqui a 4 s */ }
}

// botões de cada estado: [estado seguinte, texto, principal?]
const ACOES = {
  recebido: [['confirmado', 'Confirmar', false], ['em_preparacao', 'Preparar', true]],
  confirmado: [['em_preparacao', 'Preparar', true]],
  em_preparacao: [['pronto', 'Está pronto', true]],
  pronto: [['entregue', 'Entregue na mesa', true]],
};
const COLUNA = { recebido: 'novos', confirmado: 'novos', em_preparacao: 'em_preparacao', pronto: 'pronto' };
const pago = p => p.pagamento?.estado === 'pago';

function minutos(iso) { return Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); }

function cartao(p, chegaram) {
  const min = minutos(p.createdAt);
  const quem = (p.historico || []).filter(h => h.por !== 'Cliente').at(-1);
  const podePagar = pode('pagamentos') && temFunc('pagamentos') && !pago(p);
  const acoes = (ACOES[p.status] || []).map(([para, txt, principal]) =>
    `<button class="btn ${principal ? (p.status === 'pronto' ? 'acento' : '') : 'secundario'}" data-id="${p.id}" data-st="${para}">${txt}</button>`);
  if (['recebido', 'confirmado', 'em_preparacao'].includes(p.status) && pode('cancelar') && !pago(p)) acoes.unshift(`<button class="btn fantasma" data-id="${p.id}" data-st="cancelado">Cancelar</button>`);
  return `<li class="pedido${chegaram.includes(p.id) ? ' chegou' : ''}" data-pedido="${p.id}">
    <div class="pedido-cab"><strong>${p.table ? `Mesa ${esc(p.table)}` : 'Balcão'}</strong><span class="tempo${min >= 15 && p.status !== 'entregue' ? ' demora' : ''}">${min ? `há ${min} min` : 'agora'}</span></div>
    ${p.status === 'confirmado' ? '<span class="etiqueta">Confirmado</span>' : ''}
    <ul>${p.items.map(i => `<li><b>${i.qty}×</b> ${esc(i.name)}${i.variant ? ` <span class="mudo">· ${esc(i.variant)}</span>` : ''}</li>`).join('')}</ul>
    ${p.note ? `<p class="nota">${esc(p.note)}</p>` : ''}
    <div class="pedido-pe">
      <span class="quem-pediu">#${p.number}${p.customerName ? ` · ${esc(p.customerName)}` : ''}${quem ? ` · ${esc(quem.por)}` : ''}</span>
      <span class="valor-pedido">${moeda(p.total)}${pago(p) ? ` <span class="pago-tag">Pago · ${esc(METODOS[p.pagamento.metodo] || '')}</span>` : ''}</span>
    </div>
    ${podePagar ? `<button class="btn secundario pagar" data-pagar="${p.id}">Registar pagamento</button>
      <div class="metodos oculto" data-metodos="${p.id}">${Object.entries(METODOS).map(([k, v]) => `<button class="btn secundario" data-metodo="${k}" data-id="${p.id}">${v}</button>`).join('')}<button class="btn fantasma" data-fechar-metodos>Voltar</button></div>` : ''}
    ${acoes.length && pode('pedidos') ? `<div class="acoes">${acoes.join('')}</div>` : ''}
  </li>`;
}

function pintarPedidos(chegaram = []) {
  const n = pedidos.filter(p => p.status === 'recebido').length;
  $('#n-novos').textContent = n;
  $('#n-novos').classList.toggle('oculto', !n);
  const grupos = { novos: [], em_preparacao: [], pronto: [], por_pagar: [] };
  for (const p of pedidos) {
    if (COLUNA[p.status]) grupos[COLUNA[p.status]].push(p);
    else if (p.status === 'entregue' && !pago(p)) grupos.por_pagar.push(p);
  }
  for (const col of $$('.coluna')) {
    const lista = (grupos[col.dataset.estado] || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    col.querySelector('.contagem').textContent = lista.length;
    col.querySelector('ol').innerHTML = lista.length ? lista.map(p => cartao(p, chegaram)).join('') : '<li class="vazio-coluna">Nada por aqui</li>';
  }
}

// um só ouvinte para todos os botões do quadro
$('.quadro').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.pagar) {
    $(`[data-metodos="${b.dataset.pagar}"]`).classList.remove('oculto'); b.classList.add('oculto'); return;
  }
  if (b.hasAttribute('data-fechar-metodos')) { pintarPedidos(); return; }
  if (b.dataset.metodo) {
    b.disabled = true;
    try {
      await api(`/api/orders/${b.dataset.id}/pagamento`, { method: 'POST', body: { metodo: b.dataset.metodo } });
      toast(`Pagamento registado: ${METODOS[b.dataset.metodo]}`);
      await carregarPedidos(); pintarPedidos();
    } catch (err) { toast(err.message); b.disabled = false; }
    return;
  }
  if (b.dataset.st) {
    if (b.dataset.st === 'cancelado' && !confirm('Cancelar este pedido?')) return;
    b.disabled = true;
    try {
      await api(`/api/orders/${b.dataset.id}`, { method: 'PATCH', body: { status: b.dataset.st } });
      await carregarPedidos(); pintarPedidos();
    } catch (err) { toast(err.message); b.disabled = false; }
  }
});

// ---------------- mesas ----------------
const ESTADO_MESA = { livre: 'Livre', pendente: 'Pedido por confirmar', ocupada: 'Ocupada' };
async function carregarMesas() {
  try {
    ({ mesas } = await api(`/api/restaurants/${sess.restaurante.id}/mesas`));
    pintarMesas();
  } catch { /* tenta de novo */ }
}
function pintarMesas() {
  const ativas = mesas.filter(m => m.ativa);
  const ocupadas = ativas.filter(m => m.estado !== 'livre').length;
  $('#n-mesas').textContent = ocupadas;
  $('#n-mesas').classList.toggle('oculto', !ocupadas);
  $('#mesas').innerHTML = ativas.length ? ativas.map(m => `
    <div class="mesa-t ${m.estado}">
      <div class="mesa-cab"><strong>${esc(m.nome)}</strong><span class="estado-mesa">${ESTADO_MESA[m.estado]}</span></div>
      <p class="mudo">${m.pedidos ? `${m.pedidos} pedido${m.pedidos > 1 ? 's' : ''}${m.abertos ? ` · ${m.abertos} em curso` : ''}` : 'Sem pedidos'}</p>
      ${m.porPagar ? `<p class="por-pagar">${moeda(m.porPagar)} por pagar</p>` : ''}
      ${m.estado !== 'livre' ? `<button class="btn secundario" data-libertar="${m.id}">Libertar mesa</button>` : ''}
    </div>`).join('') : '<p class="mudo">O gerente ainda não criou mesas.</p>';
}
$('#mesas').addEventListener('click', async e => {
  const b = e.target.closest('[data-libertar]'); if (!b) return;
  const m = mesas.find(x => x.id === b.dataset.libertar);
  try {
    await api(`/api/restaurants/${sess.restaurante.id}/mesas/${m.id}/libertar`, { method: 'POST', body: {} });
    toast(`Mesa ${m.nome} livre`);
  } catch (err) {
    if (!/por entregar|por pagar/.test(err.message) || !confirm(`${err.message}\nLibertar a mesa ${m.nome} mesmo assim?`)) return toast(err.message);
    await api(`/api/restaurants/${sess.restaurante.id}/mesas/${m.id}/libertar`, { method: 'POST', body: { mesmoAssim: true } }).catch(x => toast(x.message));
  }
  carregarMesas();
});

// ---------------- esgotados ----------------
let pratos = [];
async function carregarPratos() {
  if (!pode('esgotados')) return;
  try {
    ({ pratos } = await api(`/api/equipa/${sess.restaurante.id}/pratos`));
    pintarPratos();
  } catch { /* tenta de novo ao abrir o separador */ }
}

function pintarPratos() {
  const n = pratos.filter(p => p.esgotado).length;
  $('#n-esgotados').textContent = n;
  $('#n-esgotados').classList.toggle('oculto', !n);
  $('#pratos').innerHTML = pratos.map(p => `
    <button class="prato-t${p.esgotado ? ' esgotado' : ''}" data-id="${p.id}" aria-pressed="${p.esgotado}">
      <span class="mini">${p.posterUrl ? `<img src="${esc(p.posterUrl)}" alt="">` : ''}</span>
      <span><strong>${esc(p.nome)}</strong><small>${p.esgotado ? 'Esgotado hoje' : 'Disponível'}</small></span>
    </button>`).join('') || '<p class="mudo">Ainda não há pratos no menu.</p>';
  $$('.prato-t').forEach(b => b.addEventListener('click', async () => {
    const p = pratos.find(x => x.id === b.dataset.id);
    try {
      const r = await api(`/api/dishes/${p.id}/esgotado`, { method: 'PUT', body: { esgotado: !p.esgotado } });
      p.esgotado = r.esgotado;
      pintarPratos();
      toast(p.esgotado ? `${p.nome}: esgotado hoje` : `${p.nome} disponível de novo`);
    } catch (err) { toast(err.message); }
  }));
}

// ---------------- arranque ----------------
if (sess?.token) iniciar();
else {
  $('#entrada').classList.remove('oculto');
  const c = localStorage.getItem(CODIGO);
  if (c) { $('#nome-codigo').textContent = c; mostrarPasso('pin'); } else mostrarPasso('codigo');
}
