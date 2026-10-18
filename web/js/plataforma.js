// Painel da plataforma: todos os restaurantes, uso, pagamentos e IA
import { esc, toast } from './comum.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const CHAVE = 'menu3d.plataforma';
let chave = sessionStorage.getItem(CHAVE) || '';
let dados = null;
let filtro = 'todos';
let aberto = null;   // restaurante na gaveta

const n = v => Number(v || 0).toLocaleString('pt-PT');
const hojeIso = () => new Date().toISOString().slice(0, 10);
const data = iso => iso ? new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const bytes = b => b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`;
const ICONE = id => `<svg class="ic" aria-hidden="true"><use href="/img/icones.svg#${id}"/></svg>`;
const PLANO = { teste: 'Teste', essencial: 'Essencial', profissional: 'Profissional', gratis: 'Grátis' };

async function api(caminho, { method = 'GET', body } = {}) {
  const res = await fetch(caminho, {
    method,
    headers: { 'x-plataforma-key': chave, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await res.json().catch(() => ({}));
  if (res.status === 401) { sair(); throw new Error('Sessão terminada. Entra de novo.'); }
  if (!res.ok) throw new Error(d.error || `Erro ${res.status}`);
  return d;
}

// ---------------- entrada ----------------
$('#f-entrar').addEventListener('submit', async e => {
  e.preventDefault();
  const tentativa = $('#chave').value.trim();
  const res = await fetch('/api/plataforma/entrar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chave: tentativa }) });
  if (!res.ok) return toast('Chave da plataforma inválida.');
  chave = tentativa;
  sessionStorage.setItem(CHAVE, chave);
  iniciar();
});

function sair() {
  sessionStorage.removeItem(CHAVE);
  chave = '';
  $('#app').classList.add('oculto');
  $('#entrada').classList.remove('oculto');
}
$('#sair').addEventListener('click', sair);

async function iniciar() {
  $('#entrada').classList.add('oculto');
  $('#app').classList.remove('oculto');
  await carregar();
  setInterval(carregar, 60_000);
}

async function carregar() {
  try {
    dados = await api('/api/plataforma/resumo');
    pintar();
  } catch (err) { toast(err.message); }
}

function estadoPagamento(r) {
  if (r.estado === 'suspenso') return 'suspenso';
  if (r.plano !== 'gratis' && r.pagoAte && r.pagoAte < hojeIso()) return 'atraso';
  return 'ativo';
}

// ---------------- pintura geral ----------------
function pintar() {
  const t = dados.totais;
  const hora = new Date(dados.geradoEm).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  $('#atualizado').textContent = `Atualizado às ${hora}`;
  const h = new Date().getHours();
  $('#saudacao').textContent = `${h < 12 ? 'Bom dia' : h < 19 ? 'Boa tarde' : 'Boa noite'}, Marcos`;

  // alertas
  const alertas = [];
  if (t.emAtraso) alertas.push(`<button class="alerta mau" data-ir="atraso">${t.emAtraso} ${t.emAtraso === 1 ? 'pagamento em atraso' : 'pagamentos em atraso'}</button>`);
  if (dados.ia.falhados) alertas.push(`<button class="alerta aviso" data-ir="ia">${dados.ia.falhados} ${dados.ia.falhados === 1 ? 'geração 3D falhou' : 'gerações 3D falharam'}</button>`);
  if (!alertas.length) alertas.push('<span class="alerta ok">Tudo em ordem</span>');
  $('#alertas').innerHTML = alertas.join('');
  $$('#alertas [data-ir]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.ir === 'atraso') { definirFiltro('atraso'); $('.tabela-cartao').scrollIntoView({ behavior: 'smooth' }); }
    else $('.ia').scrollIntoView({ behavior: 'smooth' });
  }));

  // KPIs
  const delta = (agora, antes) => {
    if (!antes && !agora) return '<span class="delta">sem dados ainda</span>';
    if (!antes) return '<span class="delta sobe">novo neste período</span>';
    const p = Math.round(((agora - antes) / antes) * 100);
    return `<span class="delta ${p > 0 ? 'sobe' : p < 0 ? 'desce' : ''}">${p > 0 ? '▲' : p < 0 ? '▼' : '='} ${Math.abs(p)}% vs. 30 dias antes</span>`;
  };
  const moedas = Object.entries(t.receitaPorMoeda).sort((a, b) => b[1] - a[1]);
  const [moeda, receita] = moedas[0] || ['Kz', 0];
  $('#kpis').innerHTML = `
    <div class="cartao kpi"><span class="rotulo">Restaurantes ativos</span><span class="valor">${n(t.ativos)}<small>de ${n(t.restaurantes)}</small></span><span class="detalhe">${t.suspensos ? `${t.suspensos} suspenso${t.suspensos > 1 ? 's' : ''}` : 'nenhum suspenso'}</span></div>
    <div class="cartao kpi"><span class="rotulo">Visitas aos menus</span><span class="valor">${n(t.visitas)}</span>${delta(t.visitas, t.visitasAntes)}</div>
    <div class="cartao kpi"><span class="rotulo">Aberturas em AR</span><span class="valor">${n(t.ar)}</span>${delta(t.ar, t.arAntes)}</div>
    <div class="cartao kpi"><span class="rotulo">Pedidos</span><span class="valor">${n(t.pedidos)}</span>${delta(t.pedidos, t.pedidosAntes)}</div>
    <div class="cartao kpi"><span class="rotulo">Valor pedido nos menus</span><span class="valor">${n(receita)}<small>${esc(moeda)}</small></span><span class="detalhe">${n(t.pratos3d)} de ${n(t.pratos)} pratos com 3D · ${bytes(t.espaco)}</span></div>`;

  grafico($('#g-visitas'), 'Visitas aos menus', 'visitas');
  grafico($('#g-ar'), 'Aberturas em AR', 'ar');
  grafico($('#g-pedidos'), 'Pedidos', 'pedidos');
  pintarTabela();
  pintarIA();
  if (aberto) {
    const r = dados.restaurantes.find(x => x.id === aberto.id);
    if (r) aberto = r;
  }
}

// ---------------- gráfico de linha (uma medida por gráfico, sem eixo duplo) ----------------
const dica = $('#dica-grafico');
function grafico(el, titulo, campo) {
  const serie = dados.serie;
  const valores = serie.map(d => d[campo]);
  const total = valores.reduce((a, b) => a + b, 0);
  const W = 360, H = 150, L = 28, R = 8, T = 10, B = 22;
  const max = Math.max(4, ...valores);
  const passo = Math.pow(10, Math.floor(Math.log10(max)));
  const topo = Math.ceil(max / passo) * passo;
  const x = i => L + (i / (serie.length - 1)) * (W - L - R);
  const y = v => T + (1 - v / topo) * (H - T - B);
  const pts = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const ticks = [0, topo / 2, topo];
  const dia = iso => { const [, m, d] = iso.split('-'); return `${Number(d)}/${Number(m)}`; };
  el.innerHTML = `
    <div class="grafico-cab"><h3>${titulo}</h3><strong>${n(total)}</strong></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${titulo}: ${n(total)} nos últimos 30 dias">
      ${ticks.map(t => `<line class="grelha" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="eixo" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${n(t)}</text>`).join('')}
      <path class="area" d="M${x(0)},${y(0)} L${pts.join(' L')} L${x(serie.length - 1)},${y(0)} Z"/>
      <polyline class="linha" points="${pts.join(' ')}"/>
      ${[0, 14, 29].map(i => `<text class="eixo" x="${x(i)}" y="${H - 4}" text-anchor="${i === 0 ? 'start' : i === 29 ? 'end' : 'middle'}">${dia(serie[i].dia)}</text>`).join('')}
      ${total ? '' : `<text class="vazio-grafico" x="${(L + W - R) / 2}" y="${y(topo / 2) + 4}" text-anchor="middle">Ainda sem atividade</text>`}
      <line class="cursor oculto" y1="${T}" y2="${H - B}"/>
      <circle class="ponto oculto" r="4.5"/>
      <rect x="${L}" y="0" width="${W - L - R}" height="${H - B}" fill="transparent" class="alvo"/>
    </svg>`;
  const svg = el.querySelector('svg');
  const cursor = el.querySelector('.cursor'), ponto = el.querySelector('.ponto');
  const mostrar = ev => {
    const box = svg.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(serie.length - 1, Math.round(((px - L) / (W - L - R)) * (serie.length - 1))));
    cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i)); cursor.classList.remove('oculto');
    ponto.setAttribute('cx', x(i)); ponto.setAttribute('cy', y(valores[i])); ponto.classList.remove('oculto');
    const d = new Date(serie[i].dia).toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' });
    dica.innerHTML = `${d} · <b>${n(valores[i])}</b> ${titulo.toLowerCase()}`;
    dica.style.left = `${box.left + (x(i) / W) * box.width}px`;
    dica.style.top = `${box.top + (y(valores[i]) / H) * box.height}px`;
    dica.classList.remove('oculto');
  };
  svg.querySelector('.alvo').addEventListener('pointermove', mostrar);
  svg.querySelector('.alvo').addEventListener('pointerleave', () => { cursor.classList.add('oculto'); ponto.classList.add('oculto'); dica.classList.add('oculto'); });
}

// ---------------- tabela ----------------
function definirFiltro(f) {
  filtro = f;
  $$('.filtros [data-f]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.f === f)));
  pintarTabela();
}
$$('.filtros [data-f]').forEach(b => b.addEventListener('click', () => definirFiltro(b.dataset.f)));
$('#procurar').addEventListener('input', () => pintarTabela());

function pilulaEstado(r) {
  const e = estadoPagamento(r);
  return e === 'suspenso' ? '<span class="pilula mau">Suspenso</span>'
    : e === 'atraso' ? '<span class="pilula aviso">Pagamento em atraso</span>'
    : '<span class="pilula ok">Ativo</span>';
}

function avatar(r) {
  return `<span class="avatar" style="${r.logoUrl ? `background-image:url('${esc(r.logoUrl)}');background-color:${esc(r.tema?.fundo || '#FFFFFF')};background-size:contain;background-repeat:no-repeat;background-origin:content-box;padding:3px` : `background-color:${esc(r.cor || '#18201D')}`}">${r.logoUrl ? '' : esc((r.nome.trim()[0] || '').toUpperCase())}</span>`;
}

function amostraTema(r) {
  if (!r.tema) return '';
  const titulo = r.tema.publicado ? `Estilo publicado${r.tema.rascunho ? ' · tem rascunho por publicar' : ''}` : 'Estilo padrão';
  return `<span class="amostra-tema" title="${titulo}">${[r.tema.fundo, r.tema.acento, r.tema.destaque].map(c => `<span style="background:${esc(c)}"></span>`).join('')}</span>`;
}

// ---------------- identidade do menu ----------------
let editor = null;
async function abrirIdentidade(id) {
  editor ||= await import('/js/identidade.js');
  editor.abrir({ api, toast, chave: () => chave, restaurantes: () => dados.restaurantes, aoFechar: carregar }, id);
}

function pintarTabela() {
  const q = $('#procurar').value.trim().toLowerCase();
  const lista = dados.restaurantes
    .filter(r => filtro === 'todos' || estadoPagamento(r) === filtro)
    .filter(r => !q || r.nome.toLowerCase().includes(q) || r.slug.includes(q) || (r.contacto || '').toLowerCase().includes(q))
    .sort((a, b) => b.pedidos - a.pedidos || b.visitas - a.visitas || a.nome.localeCompare(b.nome));
  $('#linhas').innerHTML = lista.length ? lista.map(r => `
    <tr data-id="${r.id}">
      <td><div class="rest">${avatar(r)}<span><strong>${esc(r.nome)}${amostraTema(r)}</strong><small>/${esc(r.slug)}${r.contacto ? ` · ${esc(r.contacto)}` : ''}</small></span></div></td>
      <td>${pilulaEstado(r)}</td>
      <td>${PLANO[r.plano] || r.plano}</td>
      <td class="${estadoPagamento(r) === 'atraso' ? 'atrasado' : ''}">${r.plano === 'gratis' ? '—' : data(r.pagoAte)}</td>
      <td class="num">${r.pratos3d}/${r.pratos}</td>
      <td class="num">${n(r.visitas)}</td>
      <td class="num">${n(r.ar + r.impresso)}</td>
      <td class="num">${n(r.pedidos)}</td>
      <td class="num">${n(r.receita)} ${esc(r.moeda)}</td>
      <td class="num">${bytes(r.espaco)}</td>
      <td><div class="acoes-linha">
        <a class="btn fantasma pequeno icone" href="/m/${esc(r.slug)}" target="_blank" rel="noopener" title="Ver o menu" aria-label="Ver o menu de ${esc(r.nome)}">${ICONE('olho')}</a>
        <button class="btn fantasma pequeno icone" data-identidade="${r.id}" title="Personalizar o menu" aria-label="Personalizar o menu de ${esc(r.nome)}">${ICONE('pincel')}</button>
        <button class="btn secundario pequeno" data-gerir="${r.id}">Gerir</button>
      </div></td>
    </tr>`).join('') : `<tr><td colspan="11" class="vazio-tabela">${dados.restaurantes.length ? 'Nenhum restaurante neste filtro.' : 'Ainda não há restaurantes. Cria o primeiro com "Novo restaurante".'}</td></tr>`;
  $$('#linhas [data-gerir]').forEach(b => b.addEventListener('click', () => abrirGaveta(b.dataset.gerir)));
  $$('#linhas [data-identidade]').forEach(b => b.addEventListener('click', () => abrirIdentidade(b.dataset.identidade)));
}

// ---------------- IA ----------------
function pintarIA() {
  const ia = dados.ia;
  const ultimo = ia.workers[0];
  const minutos = ultimo ? (Date.now() - Date.parse(ultimo.visto)) / 60000 : Infinity;
  $('#worker').className = `pilula ${!ia.workerConfigurado ? 'mau' : minutos < 2 ? 'ok' : 'aviso'}`;
  $('#worker').textContent = !ia.workerConfigurado ? 'IA desligada (falta WORKER_TOKEN)'
    : minutos < 2 ? `Worker ligado: ${ultimo.nome}`
    : ultimo ? `Worker visto ${data(ultimo.visto)}` : 'Nenhum worker ligado';
  $('#ia-contagens').innerHTML = [['Na fila', ia.naFila], ['A gerar', ia.aGerar], ['Prontos', ia.prontos], ['Falharam', ia.falhados]]
    .map(([t, v]) => `<div><b>${n(v)}</b><span>${t}</span></div>`).join('');
  const PIL = { 'na fila': 'aviso', 'a gerar': 'aviso', pronto: 'ok', falhou: 'mau' };
  $('#ia-linhas').innerHTML = ia.fila.length ? ia.fila.slice(0, 15).map(j => `
    <tr>
      <td>${new Date(j.criadoEm).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
      <td>${esc(j.restaurante)}</td>
      <td><span class="pilula ${PIL[j.estado] || ''}">${esc(j.estado)}</span>${j.erro ? `<span class="erro-ia" title="${esc(j.erro)}">${esc(j.erro)}</span>` : ''}</td>
      <td>${j.fotos}</td>
      <td>${esc(j.worker || '—')}</td>
      <td>${j.estado === 'falhou' ? `<button class="btn secundario pequeno" data-repetir="${j.id}">Repetir</button>` : ''}</td>
    </tr>`).join('') : '<tr><td colspan="6" class="vazio-tabela">Ainda não houve pedidos de geração 3D.</td></tr>';
  $$('[data-repetir]').forEach(b => b.addEventListener('click', async () => {
    try { await api(`/api/plataforma/ia/${b.dataset.repetir}/repetir`, { method: 'POST' }); toast('Voltou para a fila'); carregar(); }
    catch (err) { toast(err.message); }
  }));
}

// ---------------- gaveta: gerir restaurante ----------------
const f = $('#f-gerir');
let estadoEscolhido = 'ativo';

function abrirGaveta(id) {
  aberto = dados.restaurantes.find(r => r.id === id);
  const r = aberto;
  $('#g-avatar').outerHTML = avatar(r).replace('class="avatar"', 'class="avatar" id="g-avatar"');
  $('#g-nome').textContent = r.nome;
  $('#g-menu').textContent = `/m/${r.slug}`;
  $('#g-menu').href = `/m/${r.slug}`;
  $('#g-numeros').innerHTML = [
    ['Visitas 30 d', n(r.visitas)], ['Pedidos 30 d', n(r.pedidos)], ['Valor 30 d', `${n(r.receita)} ${esc(r.moeda)}`],
    ['Pratos', `${r.pratos3d}/${r.pratos} em 3D`], ['Menu impresso', r.menuImpresso ? 'Sim' : 'Não'], ['Cliente desde', data(r.criadoEm)],
  ].map(([t, v]) => `<div><dt>${t}</dt><dd>${v}</dd></div>`).join('');
  estadoEscolhido = r.estado;
  pintarEstado();
  f.plano.value = r.plano;
  f.pagoAte.value = r.pagoAte || '';
  f.contacto.value = r.contacto || '';
  f.notas.value = r.notas || '';
  $('#g-chave-nova').classList.add('oculto');
  $('#gaveta').classList.remove('oculto');
}

function pintarEstado() {
  $$('[data-estado]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.estado === estadoEscolhido)));
}
$$('[data-estado]').forEach(b => b.addEventListener('click', () => { estadoEscolhido = b.dataset.estado; pintarEstado(); }));

$$('[data-mais]').forEach(b => b.addEventListener('click', () => {
  const base = f.pagoAte.value && f.pagoAte.value > hojeIso() ? new Date(f.pagoAte.value) : new Date();
  base.setDate(base.getDate() + Number(b.dataset.mais));
  f.pagoAte.value = base.toISOString().slice(0, 10);
}));

const fecharGaveta = () => { $('#gaveta').classList.add('oculto'); aberto = null; };
$$('#gaveta [data-fechar]').forEach(b => b.addEventListener('click', fecharGaveta));
$('#gaveta').addEventListener('click', e => { if (e.target.id === 'gaveta') fecharGaveta(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && aberto) fecharGaveta(); });

f.addEventListener('submit', async e => {
  e.preventDefault();
  if (estadoEscolhido === 'suspenso' && aberto.estado !== 'suspenso' &&
      !confirm(`Suspender "${aberto.nome}"? Os clientes deixam de conseguir abrir o menu e fazer pedidos.`)) return;
  try {
    await api(`/api/plataforma/restaurantes/${aberto.id}`, {
      method: 'PATCH',
      body: { estado: estadoEscolhido, plano: f.plano.value, pagoAte: f.pagoAte.value, contacto: f.contacto.value, notas: f.notas.value },
    });
    toast('Restaurante atualizado');
    fecharGaveta();
    carregar();
  } catch (err) { toast(err.message); }
});

$('#g-chave').addEventListener('click', async () => {
  if (!confirm(`Gerar uma chave nova para "${aberto.nome}"? A chave antiga deixa de funcionar em todos os aparelhos.`)) return;
  try {
    const { adminKey } = await api(`/api/plataforma/restaurantes/${aberto.id}/nova-chave`, { method: 'POST' });
    const el = $('#g-chave-nova');
    el.innerHTML = `Entrega ao restaurante. Código: <code>${esc(aberto.id)}</code>Chave nova (só aparece agora): <code>${esc(adminKey)}</code>`;
    el.classList.remove('oculto');
  } catch (err) { toast(err.message); }
});

$('#g-identidade').addEventListener('click', () => { const id = aberto.id; fecharGaveta(); abrirIdentidade(id); });

$('#g-estudio').addEventListener('click', () => {
  // entra no estúdio deste restaurante com a chave da plataforma
  localStorage.setItem('menu3d.sessao', JSON.stringify({ id: aberto.id, key: `plat:${chave}`, slug: aberto.slug }));
  window.open('/estudio', '_blank', 'noopener');
});

// ---------------- novo restaurante ----------------
$('#novo').addEventListener('click', () => {
  $('#f-novo').reset();
  const d = new Date(); d.setDate(d.getDate() + 30);
  $('#f-novo').pagoAte.value = d.toISOString().slice(0, 10);
  $('#novo-resultado').classList.add('oculto');
  $('#novo-criar').classList.remove('oculto');
  $('#d-novo').showModal();
});

$('#novo-criar').addEventListener('click', async e => {
  e.preventDefault();
  const form = $('#f-novo');
  if (!form.reportValidity()) return;
  try {
    const r = await api('/api/plataforma/restaurantes', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
    $('#novo-resultado').innerHTML = `Restaurante criado. Entrega estes dados ao responsável (a chave só aparece agora):
      Código: <code>${esc(r.restaurante.id)}</code>Chave do estúdio: <code>${esc(r.adminKey)}</code>`;
    $('#novo-resultado').classList.remove('oculto');
    $('#novo-criar').classList.add('oculto');
    carregar();
  } catch (err) { toast(err.message); }
});

// ---------------- arranque ----------------
if (chave) iniciar(); else $('#entrada').classList.remove('oculto');
