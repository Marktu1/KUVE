// Ecrã da equipa: PIN → quadro de pedidos + pratos esgotados (sem acesso a preços, menu ou faturação)
import { esc, toast } from './comum.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const SESSAO = 'menu3d.equipa';
const CODIGO = 'menu3d.equipa.codigo';
const FUNCAO = { rececao: 'Receção', empregado: 'Empregado de mesa', cozinha: 'Cozinha' };

let sess = JSON.parse(localStorage.getItem(SESSAO) || 'null');
let pedidos = [], vistos = new Set(), primeiro = true, som = true, intervalo = null;

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
  localStorage.setItem(CODIGO, c);
  $('#nome-codigo').textContent = c;
  pin = ''; pintarPin();
  mostrarPasso('pin');
});
$('#trocar-codigo').addEventListener('click', () => { $('#codigo').value = localStorage.getItem(CODIGO) || ''; mostrarPasso('codigo'); });

function pintarPin() {
  $$('.pontos i').forEach((i, k) => i.classList.toggle('cheio', k < pin.length));
}

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
    localStorage.setItem(SESSAO, JSON.stringify(sess));
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
  localStorage.removeItem(SESSAO);
  sess = null;
  clearInterval(intervalo);
  $('#app').classList.add('oculto');
  $('#entrada').classList.remove('oculto');
  pin = ''; pintarPin();
  if (localStorage.getItem(CODIGO)) { $('#nome-codigo').textContent = localStorage.getItem(CODIGO); mostrarPasso('pin'); }
  else mostrarPasso('codigo');
  if (msg) $('#erro-pin').textContent = msg;
}
$('#sair').addEventListener('click', () => sair());

// ---------------- trabalho ----------------
function iniciar() {
  const r = sess.restaurante;
  document.documentElement.style.setProperty('--acento', r.cor || '#C8322B');
  $('#rest-nome').textContent = r.nome;
  $('#membro-nome').textContent = `${sess.membro.nome} · ${FUNCAO[sess.membro.funcao] || ''}`;
  $('#avatar').textContent = r.logoUrl ? '' : (r.nome.trim()[0] || '').toUpperCase();
  $('#avatar').style.backgroundImage = r.logoUrl ? `url('${r.logoUrl}')` : '';
  document.title = `${r.nome} · Equipa`;
  $('#entrada').classList.add('oculto');
  $('#app').classList.remove('oculto');
  primeiro = true;
  carregarPedidos();
  carregarPratos();
  clearInterval(intervalo);
  intervalo = setInterval(() => { carregarPedidos(); relogio(); }, 4000);
  relogio();
}

function relogio() {
  $('#relogio').textContent = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

$$('.abas [data-aba]').forEach(b => b.addEventListener('click', () => {
  $$('.abas [data-aba]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  $$('.aba').forEach(s => s.classList.toggle('oculto', s.id !== `aba-${b.dataset.aba}`));
  if (b.dataset.aba === 'esgotados') carregarPratos();
}));

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
    const novos = pedidos.filter(p => p.status === 'novo' && !vistos.has(p.id));
    if (!primeiro && novos.length && som) tocar();
    pintarPedidos(primeiro ? [] : novos.map(p => p.id));
    pedidos.forEach(p => vistos.add(p.id));
    primeiro = false;
  } catch { /* sem rede: tenta outra vez daqui a 4 s */ }
}

const SEGUINTE = { 'novo': ['a preparar', 'Começar a preparar'], 'a preparar': ['pronto', 'Está pronto'], 'pronto': ['entregue', 'Entregue na mesa'] };

function minutos(iso) { return Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); }

function pintarPedidos(chegaram = []) {
  const n = pedidos.filter(p => p.status === 'novo').length;
  $('#n-novos').textContent = n;
  $('#n-novos').classList.toggle('oculto', !n);
  for (const col of $$('.coluna')) {
    const estado = col.dataset.estado;
    const lista = pedidos.filter(p => p.status === estado).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    col.querySelector('.contagem').textContent = lista.length;
    col.querySelector('ol').innerHTML = lista.length ? lista.map(p => {
      const min = minutos(p.createdAt);
      const quem = (p.historico || []).filter(h => h.por !== 'Cliente').at(-1);
      return `<li class="pedido${chegaram.includes(p.id) ? ' chegou' : ''}">
        <div class="pedido-cab"><strong>${p.table ? `Mesa ${esc(p.table)}` : 'Balcão'}</strong><span class="tempo${min >= 15 && estado !== 'pronto' ? ' demora' : ''}">${min ? `há ${min} min` : 'agora'}</span></div>
        <ul>${p.items.map(i => `<li><b>${i.qty}×</b> ${esc(i.name)}${i.variant ? ` <span class="mudo">· ${esc(i.variant)}</span>` : ''}</li>`).join('')}</ul>
        ${p.note ? `<p class="nota">${esc(p.note)}</p>` : ''}
        <span class="quem-pediu">#${p.number}${p.customerName ? ` · ${esc(p.customerName)}` : ''}${quem ? ` · ${esc(quem.por)} mexeu` : ''}</span>
        <div class="acoes">
          ${estado === 'novo' ? `<button class="btn secundario" data-id="${p.id}" data-st="cancelado">Cancelar</button>` : ''}
          <button class="btn ${estado === 'pronto' ? 'acento' : ''}${estado === 'novo' ? '' : ' unico'}" data-id="${p.id}" data-st="${SEGUINTE[estado][0]}">${SEGUINTE[estado][1]}</button>
        </div>
      </li>`;
    }).join('') : '<li class="vazio-coluna">Nada por aqui</li>';
  }
  $$('.pedido [data-st]').forEach(b => b.addEventListener('click', async () => {
    if (b.dataset.st === 'cancelado' && !confirm('Cancelar este pedido?')) return;
    b.disabled = true;
    try {
      await api(`/api/orders/${b.dataset.id}`, { method: 'PATCH', body: { status: b.dataset.st } });
      await carregarPedidos();
    } catch (err) { toast(err.message); b.disabled = false; }
  }));
}

// ---------------- esgotados ----------------
let pratos = [];
async function carregarPratos() {
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
