// Menu do cliente: QR → menu → prato em 3D/AR → pedido
import { api, esc, dinheiro, toast, evento as registarEvento } from './comum.js';
import { aplicarTema, estadoHorario, limparTema, LUZ, TEXTOS_PADRAO } from './temas.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const slug = location.pathname.split('/').filter(Boolean)[1] || new URLSearchParams(location.search).get('r');
const params = new URLSearchParams(location.search);
const codigoMesa = (params.get('m') || '').slice(0, 20);
let mesa = codigoMesa ? '' : (params.get('mesa') || '').slice(0, 10);   // o código do QR vale mais do que o número no link
const CHAVE_ENVIO = `menu3d.envio.${slug}`;
const MEUS_PEDIDOS = `menu3d.pedidos.${slug}`;
let filtro = '';
const normalizar = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const CHAVE_CARRINHO = `menu3d.carrinho.${slug}`;
// pré-visualização dentro do painel da plataforma: o tema chega por postMessage e nada conta nas estatísticas
const previa = params.has('previa') && window.parent !== window;
const evento = (...a) => { if (!previa) registarEvento(...a); };

let rest, pratos = [], carrinho = [], tema, fechado = null;
try { carrinho = JSON.parse(localStorage.getItem(CHAVE_CARRINHO) || '[]'); } catch { carrinho = []; }

const moeda = n => dinheiro(n, rest.currency);
const precoHtml = n => `${Number(n || 0).toLocaleString('pt-PT', { maximumFractionDigits: 2 })} <small>${esc(rest.currency)}</small>`;
const guardarCarrinho = () => { try { localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(carrinho)); } catch {} };

async function iniciar() {
  try {
    let m;
    ({ restaurant: rest, dishes: pratos, mesa: m } = await api(`/api/menu/${encodeURIComponent(slug)}${codigoMesa ? `?m=${encodeURIComponent(codigoMesa)}` : ''}`));
    if (m) mesa = m.nome;
    if (codigoMesa && !m) toast('Este QR já não corresponde a uma mesa. Pede ajuda à equipa.', 5000);
  } catch (err) {
    $('#lista').innerHTML = `<p class="aviso erro">Não foi possível abrir este menu: ${esc(err.message)}</p>`;
    return;
  }
  document.title = `${rest.name} · Menu`;
  if (!sessionStorage.getItem(`menu3d.visto.${slug}`) && !previa) { evento(slug, 'visita'); sessionStorage.setItem(`menu3d.visto.${slug}`, '1'); }
  tema = rest.tema || limparTema({});
  carrinho = carrinho.filter(l => pratos.some(p => p.id === l.dishId));
  pintarTudo();
  pintarBarra();
  const aberto = new URLSearchParams(location.hash.slice(1)).get('prato');
  if (aberto) abrirPrato(aberto, false);
  setInterval(pintarHorario, 60_000);
  if (previa) parent.postMessage({ tipo: 'menu-pronto' }, location.origin);
  acompanharMeuPedido();
}

const fazPedidos = () => (rest.funcionalidades || []).includes('pedidos');

// ---------- o meu pedido (acompanhar sem conta) ----------
function meusPedidos() {
  try { return JSON.parse(localStorage.getItem(MEUS_PEDIDOS) || '[]').filter(p => Date.now() - p.em < 12 * 3600e3); } catch { return []; }
}
let temporizadorPedido = null;
async function acompanharMeuPedido() {
  clearTimeout(temporizadorPedido);
  const ultimo = meusPedidos().at(-1);
  const el = $('#meu-pedido');
  if (!ultimo || previa) { el.classList.add('oculto'); return; }
  el.href = ultimo.url;
  try {
    const u = new URL(ultimo.url, location.origin);
    const { order } = await api(`/api/pedido/${u.pathname.split('/')[4]}?t=${u.searchParams.get('t')}`);
    el.innerHTML = `<span class="ponto-estado e-${order.status}"></span><span>Pedido #${order.number}</span><strong>${esc(order.rotulo)}</strong><span class="seta-mini">›</span>`;
    el.classList.remove('oculto');
    if (!['entregue', 'cancelado'].includes(order.status)) temporizadorPedido = setTimeout(acompanharMeuPedido, 15000);
  } catch { el.classList.add('oculto'); }
}

// ---------- identidade do restaurante ----------
function pintarTudo() {
  aplicarTema(tema);
  const tx = { ...TEXTOS_PADRAO, ...tema.textos };
  // nome: em texto, ou o próprio logo (para logos que já têm o nome escrito)
  const logoNoNome = tema.logo?.noLugarDoNome && rest.logoUrl;
  $('#nome').innerHTML = logoNoNome
    ? `<img class="logo-titulo" src="${esc(rest.logoUrl)}" alt="${esc(rest.name)}">`
    : esc(rest.name);
  $('#frase').textContent = rest.tagline || '';
  $('#logo').classList.toggle('oculto', !rest.logoUrl);
  if (rest.logoUrl) { $('#logo').src = rest.logoUrl; $('#logo').alt = `Logo de ${rest.name}`; }
  // o logo também vai para o separador do navegador e para o ecrã inicial do telemóvel
  for (const rel of ['icon', 'apple-touch-icon']) {
    let l = document.querySelector(`link[rel="${rel}"]`);
    if (!rest.logoUrl) { l?.remove(); continue; }
    if (!l) { l = Object.assign(document.createElement('link'), { rel }); document.head.append(l); }
    l.href = rest.logoUrl;
  }
  $('#mesa').classList.toggle('oculto', !mesa);
  $('#mesa').textContent = mesa ? `Mesa ${mesa}` : '';
  $('#dica-3d-texto').textContent = tx.dica3d;
  $('#texto-ar').textContent = tx.botaoAR;
  $('#ped-enviar').textContent = tx.enviar;

  // capa: a foto escolhida, senão a primeira foto de um prato
  const capa = tema.capaUrl || pratos.find(p => p.photos?.[0])?.photos[0] || '';
  $('#capa').style.backgroundImage = capa ? `url('${capa}')` : '';
  document.body.classList.toggle('sem-capa', !capa);

  // aviso
  const hojeIso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Luanda' });
  const avisoVisivel = tema.aviso.ativo && tema.aviso.texto && (!tema.aviso.ate || hojeIso <= tema.aviso.ate);
  $('#aviso').classList.toggle('oculto', !avisoVisivel);
  $('#aviso').textContent = avisoVisivel ? tema.aviso.texto : '';
  document.body.classList.toggle('com-aviso', Boolean(avisoVisivel));

  // luz do 3D
  for (const [k, v] of Object.entries(LUZ[tema.luz] || LUZ.neutra)) mv.setAttribute(k, v);

  // rodapé
  $('#rodape-texto').textContent = tx.rodape || '';
  $('#rodape-texto').classList.toggle('oculto', !tx.rodape);
  $('#marca-menu3d').classList.toggle('oculto', tema.marcaMenu3D === false);
  pintarContactos();

  pintarHorario(false);
  pintarDestaques(tx.destaques);
  pintarMenu();
  if (pratoAberto) atualizarBotao();
  requestAnimationFrame(() => document.documentElement.classList.remove('a-carregar'));
}

function pintarHorario(repintar = true) {
  const h = estadoHorario(tema.horario);
  const el = $('#horario');
  el.classList.toggle('oculto', !h.ativo);
  el.className = `chip-horario ${h.aberto ? 'aberto' : 'fechado'}${h.ativo ? '' : ' oculto'}`;
  el.textContent = !h.ativo ? '' : h.aberto ? `Aberto · fecha às ${h.fecha}` : h.abre ? `Fechado · abre ${h.quando} às ${h.abre}` : 'Fechado';
  const antes = fechado;
  fechado = h.ativo && !h.aberto && !tema.horario.pedidosFora ? h : null;
  if (repintar && Boolean(antes) !== Boolean(fechado) && pratoAberto) atualizarBotao();
  $('#ped-enviar').disabled = Boolean(fechado);
}

function pintarContactos() {
  const c = tema.contactos;
  const ic = id => `<svg class="ic" aria-hidden="true"><use href="/img/icones.svg#${id}"/></svg>`;
  const itens = [
    c.instagram && `<a href="https://instagram.com/${encodeURIComponent(c.instagram)}" target="_blank" rel="noopener">${ic('ligacao')}Instagram</a>`,
    c.facebook && `<a href="https://facebook.com/${encodeURIComponent(c.facebook)}" target="_blank" rel="noopener">${ic('ligacao')}Facebook</a>`,
    c.tiktok && `<a href="https://www.tiktok.com/@${encodeURIComponent(c.tiktok)}" target="_blank" rel="noopener">${ic('ligacao')}TikTok</a>`,
    c.telefone && `<a href="tel:${esc(c.telefone.replace(/\s/g, ''))}">${ic('telefone')}${esc(c.telefone)}</a>`,
    c.morada && (c.mapa ? `<a href="${esc(c.mapa)}" target="_blank" rel="noopener">${ic('mapa')}${esc(c.morada)}</a>` : `<span>${ic('mapa')}${esc(c.morada)}</span>`),
    !c.morada && c.mapa && `<a href="${esc(c.mapa)}" target="_blank" rel="noopener">${ic('mapa')}Como chegar</a>`,
    c.site && `<a href="${esc(c.site)}" target="_blank" rel="noopener">${ic('ligacao')}${esc(c.site.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`,
  ].filter(Boolean);
  $('#contactos').innerHTML = itens.map(i => `<li>${i}</li>`).join('');
  $('#contactos').classList.toggle('oculto', !itens.length);
}

function imagemPrato(p) {
  // poster = render do 3D (fundo transparente); foto = fotografia real
  if (p.posterUrl) return `<img class="render" src="${esc(p.posterUrl)}" alt="" loading="lazy">`;
  if (p.photos?.[0]) return `<img class="foto" src="${esc(p.photos[0])}" alt="" loading="lazy">`;
  return `<span class="inicial" aria-hidden="true">${esc(p.name.trim()[0] || '')}</span>`;
}
const selo3d = p => p.modelUrl ? '<span class="selo-3d" title="Disponível em 3D e na tua mesa"><svg class="ic" aria-hidden="true"><use href="/img/icones.svg#cubo"/></svg><span class="sr">Em 3D</span></span>' : '';

function pintarDestaques(titulo) {
  const lista = tema.destaques.map(id => pratos.find(p => p.id === id)).filter(Boolean);
  $('#destaques').classList.toggle('oculto', !lista.length);
  $('#destaques-titulo').textContent = titulo;
  $('#destaques-lista').innerHTML = lista.map(p => `
    <button class="destaque" data-id="${p.id}">
      <span class="miniprato">${imagemPrato(p)}${selo3d(p)}</span>
      <strong>${esc(p.name)}</strong>
      <span class="preco">${p.esgotado ? 'Esgotado hoje' : moeda(p.price)}</span>
    </button>`).join('');
  $$('#destaques-lista [data-id]').forEach(b => b.addEventListener('click', () => abrirPrato(b.dataset.id)));
}

function pintarMenu() {
  const q = normalizar(filtro.trim());
  const visiveis = q ? pratos.filter(p => normalizar(`${p.name} ${p.description} ${p.ingredients} ${p.category}`).includes(q)) : pratos;
  const ordem = [...rest.categories, ...new Set(visiveis.map(p => p.category))].filter((c, i, a) => c && a.indexOf(c) === i);
  const grupos = ordem.map(c => [c, visiveis.filter(p => p.category === c)]).filter(([, l]) => l.length);
  const semCat = visiveis.filter(p => !p.category);
  if (semCat.length) grupos.push(['Outros', semCat]);
  $('#procurar-bloco').classList.toggle('oculto', pratos.length < 8);

  if (!grupos.length) {
    $('#categorias').innerHTML = '';
    $('#lista').innerHTML = `<p class="mudo vazio-menu">${q ? `Nada encontrado para "${esc(filtro.trim())}".` : 'Este menu ainda não tem pratos.'}</p>`;
    return;
  }
  $('.dica-3d').classList.toggle('oculto', !pratos.some(p => p.modelUrl));

  $('#categorias').innerHTML = grupos.map(([c], i) => `<a href="#cat-${i}" aria-current="${i === 0}">${esc(c)}</a>`).join('');
  $('#lista').innerHTML = grupos.map(([c, lista], i) => `
    <section class="secao" id="cat-${i}">
      <h2>${esc(c)} <small>${lista.length}</small></h2>
      <ul>${lista.map(p => `
        <li class="item${p.esgotado ? ' esgotado' : ''}${tema.movimento === 'vivo' ? ' por-entrar' : ''}"><button data-id="${p.id}">
          <span>
            <h3>${esc(p.name)}</h3>
            ${p.description ? `<p>${esc(p.description)}</p>` : ''}
            <span class="preco">${p.esgotado ? '<span class="tag-esgotado">Esgotado hoje</span>' : precoHtml(p.price)}</span>
          </span>
          <span class="miniprato">${imagemPrato(p)}${selo3d(p)}</span>
        </button></li>`).join('')}
      </ul>
    </section>`).join('');

  $$('.item button').forEach(b => b.addEventListener('click', () => abrirPrato(b.dataset.id)));

  if (tema.movimento === 'vivo') {
    const entra = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.remove('por-entrar'); entra.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    $$('.item.por-entrar').forEach((li, i) => { li.style.transitionDelay = `${(i % 3) * 70}ms`; entra.observe(li); });
  }

  // categoria ativa ao deslizar
  const links = $$('#categorias a');
  const obs = new IntersectionObserver(entradas => {
    if (scrollY < 40) return links.forEach((a, i) => a.setAttribute('aria-current', String(i === 0)));
    for (const e of entradas) if (e.isIntersecting) {
      links.forEach(a => a.setAttribute('aria-current', String(a.hash === `#${e.target.id}`)));
      document.querySelector(`#categorias a[href="#${e.target.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('.secao').forEach(s => obs.observe(s));
  addEventListener('scroll', () => {
    if (scrollY < 40) links.forEach((a, i) => a.setAttribute('aria-current', String(i === 0)));
  }, { passive: true });
}

// ---------- prato ----------
const mv = $('#mv');
let pratoAberto = null, qtd = 1, empurrou = false;

function abrirPrato(id, empurrarHistorico = true) {
  const p = pratos.find(x => x.id === id);
  if (!p) return;
  pratoAberto = p;
  qtd = 1;
  evento(slug, 'prato', p.id);
  $('#p-qtd').textContent = qtd;
  $('#p-nome').textContent = p.name;
  $('#p-categoria').textContent = p.category || '';
  $('#p-preco').textContent = moeda(p.price);
  $('#p-desc').textContent = p.description || '';

  const det = [];
  if (p.ingredients) det.push(['Ingredientes', esc(p.ingredients)]);
  if (p.allergens.length) det.push(['Alergénios', p.allergens.map(a => `<span class="alergeno">${esc(a)}</span>`).join('')]);
  if (p.calories) det.push(['Energia', `${p.calories} kcal`]);
  $('#p-detalhes').innerHTML = det.map(([t, v]) => `<dt>${t}</dt><dd>${v}</dd>`).join('');

  $('#p-fotos').innerHTML = p.photos.map(u => `<img src="${esc(u)}" alt="Foto de ${esc(p.name)}" loading="lazy">`).join('');

  const vf = $('#p-variantes');
  vf.classList.toggle('oculto', !p.variants.length);
  vf.innerHTML = '<legend>Escolhe</legend>' + [{ name: '', price: p.price }, ...p.variants].map((v, i) => `
    <label><input type="radio" name="variante" value="${esc(v.name)}" ${i === 0 ? 'checked' : ''}>
      <span>${v.name ? esc(v.name) : 'Normal'}</span><strong>${moeda(v.price)}</strong></label>`).join('');
  vf.onchange = atualizarBotao;

  // 3D ou foto
  const palco = $('.prato-palco');
  if (p.modelUrl) {
    mv.classList.remove('oculto');
    $('#p-foto-principal').classList.add('oculto');
    mv.src = p.modelUrl;
    if (p.iosModelUrl) mv.setAttribute('ios-src', p.iosModelUrl); else mv.removeAttribute('ios-src');
    mv.poster = p.posterUrl || '';
    mv.alt = `Modelo 3D de ${p.name}`;
    mv.toggleAttribute('auto-rotate', p.animation !== 'none');
    mv.setAttribute('rotation-per-second', '18deg');
    $('#p-escala').textContent = p.realSizeCm
      ? `Tamanho real: ${p.realSizeCm} cm. Imagem ilustrativa; a porção servida pode variar ligeiramente.`
      : 'Imagem ilustrativa.';
  } else {
    mv.classList.add('oculto');
    mv.removeAttribute('src');
    const foto = p.posterUrl || p.photos[0];
    $('#p-foto-principal').src = foto || '';
    $('#p-foto-principal').classList.toggle('oculto', !foto);
    $('#p-escala').textContent = '';
  }
  palco.classList.remove('pop');
  if (p.animation === 'pop') requestAnimationFrame(() => palco.classList.add('pop'));

  atualizarBotao();
  mostrarFolha('#folha-prato');
  if (empurrarHistorico) { history.pushState({ prato: id }, '', `#prato=${id}`); empurrou = true; }
}

function varianteEscolhida() {
  const v = $('#p-variantes input:checked')?.value || '';
  const preco = v ? pratoAberto.variants.find(x => x.name === v)?.price : pratoAberto.price;
  return { v, preco: preco ?? pratoAberto.price };
}

function atualizarBotao() {
  const { preco } = varianteEscolhida();
  $('.adicionar').classList.toggle('oculto', !fazPedidos());
  const b = $('#p-adicionar');
  const tx = tema.textos.adicionar || 'Adicionar';
  b.disabled = Boolean(pratoAberto.esgotado || fechado);
  b.textContent = pratoAberto.esgotado ? 'Esgotado hoje'
    : fechado ? (fechado.abre ? `Fechado · abre ${fechado.quando} às ${fechado.abre}` : 'Fechado agora')
    : `${tx} · ${moeda(preco * qtd)}`;
}

$$('[data-q]').forEach(b => b.addEventListener('click', () => {
  qtd = Math.min(20, Math.max(1, qtd + Number(b.dataset.q)));
  $('#p-qtd').textContent = qtd;
  atualizarBotao();
}));

$('#p-adicionar').addEventListener('click', () => {
  const { v } = varianteEscolhida();
  const linha = carrinho.find(l => l.dishId === pratoAberto.id && l.variant === v);
  if (linha) linha.qty = Math.min(50, linha.qty + qtd);
  else carrinho.push({ dishId: pratoAberto.id, variant: v, qty: qtd });
  guardarCarrinho();
  pintarBarra();
  fecharFolhas(true);
  toast(`${qtd}× ${pratoAberto.name} no pedido`);
});

// AR: avisar quando o telemóvel não suporta
mv.addEventListener('load', () => {
  if (!mv.canActivateAR) $('#p-escala').textContent += ' Roda o prato com o dedo; este aparelho não abre a câmara em AR.';
});
mv.addEventListener('ar-status', e => {
  if (e.detail.status === 'session-started') evento(slug, 'ar', pratoAberto?.id);
  if (e.detail.status === 'failed') toast('Não foi possível abrir o AR. Tenta com mais luz, a apontar para a mesa.');
});

// ---------- pedido ----------
function linhaPreco(l) {
  const p = pratos.find(x => x.id === l.dishId);
  const unit = l.variant ? (p.variants.find(v => v.name === l.variant)?.price ?? p.price) : p.price;
  return { p, unit, subtotal: unit * l.qty };
}
const total = () => carrinho.reduce((s, l) => s + linhaPreco(l).subtotal, 0);

function pintarBarra() {
  const n = carrinho.reduce((s, l) => s + l.qty, 0);
  $('#barra-pedido').classList.toggle('oculto', !n || (rest && !fazPedidos()));
  $('#meu-pedido').classList.toggle('acima', Boolean(n));
  $('#barra-qtd').textContent = n;
  if (rest) $('#barra-total').textContent = moeda(total());
}

$('#barra-pedido').addEventListener('click', () => { pintarPedido(); mostrarFolha('#folha-pedido'); history.pushState({ pedido: 1 }, '', '#pedido'); empurrou = true; });

function pintarPedido() {
  $('#ped-itens').innerHTML = carrinho.map((l, i) => {
    const { p, subtotal } = linhaPreco(l);
    const img = p.posterUrl || p.photos[0];
    return `<li><span class="mini">${img ? `<img src="${esc(img)}" alt="">` : ''}</span>
      <span class="nome">${esc(p.name)}${l.variant ? ` <span class="mudo">· ${esc(l.variant)}</span>` : ''}</span>
      <span class="valor">${moeda(subtotal)}</span>
      <div class="qtd" role="group" aria-label="Quantidade de ${esc(p.name)}">
        <button data-i="${i}" data-d="-1" aria-label="Menos um">−</button><output>${l.qty}</output><button data-i="${i}" data-d="1" aria-label="Mais um">+</button>
      </div></li>`;
  }).join('');
  $('#ped-total').textContent = moeda(total());
  const n = carrinho.reduce((t, l) => t + l.qty, 0);
  $('#ped-mesa').textContent = `${n} ${n === 1 ? 'artigo' : 'artigos'}${mesa ? ` · Mesa ${mesa}` : ''}`;
  $$('#ped-itens [data-d]').forEach(b => b.addEventListener('click', () => {
    const l = carrinho[b.dataset.i];
    l.qty += Number(b.dataset.d);
    if (l.qty <= 0) carrinho.splice(b.dataset.i, 1);
    guardarCarrinho();
    pintarBarra();
    if (!carrinho.length) return fecharFolhas(true);
    pintarPedido();
  }));
  $('#ped-ajuda').textContent = rest.whatsapp
    ? `O pedido vai para a cozinha e abre o WhatsApp do restaurante para confirmares.${mesa ? ` Mesa ${mesa}.` : ''}`
    : `O pedido vai diretamente para a cozinha.${mesa ? ` Mesa ${mesa}.` : ''}`;
}

$('#ped-enviar').addEventListener('click', async () => {
  const btn = $('#ped-enviar');
  btn.disabled = true;
  // a mesma chave em cada repetição: se a rede falhar e o cliente tocar outra vez, não sai um pedido duplicado
  let chave = sessionStorage.getItem(CHAVE_ENVIO);
  if (!chave) { chave = crypto.randomUUID?.() || String(Date.now()) + Math.random(); sessionStorage.setItem(CHAVE_ENVIO, chave); }
  try {
    const r = await api(`/api/menu/${encodeURIComponent(slug)}/orders`, {
      method: 'POST',
      body: { chave, mesaCodigo: codigoMesa || undefined, table: codigoMesa ? undefined : mesa, customerName: $('#ped-nome').value, note: $('#ped-nota').value, items: carrinho },
    });
    sessionStorage.removeItem(CHAVE_ENVIO);
    try { localStorage.setItem(MEUS_PEDIDOS, JSON.stringify([...meusPedidos(), { url: r.acompanhar, number: r.order.number, em: Date.now() }].slice(-5))); } catch {}
    carrinho = [];
    guardarCarrinho();
    pintarBarra();
    fecharFolhas(true);
    toast(`Pedido #${r.order.number} enviado`, 4000);
    acompanharMeuPedido();
    if (r.whatsappUrl) setTimeout(() => { location.href = r.whatsappUrl; }, 900);
  } catch (err) { toast(err.message); }
  btn.disabled = false;
});

// ---------- folhas e histórico ----------
function mostrarFolha(sel) {
  $$('.folha').forEach(f => f.classList.toggle('oculto', `#${f.id}` !== sel));
  document.body.style.overflow = 'hidden';
  $(sel).querySelector('.fechar').focus({ preventScroll: true });
}

function fecharFolhas(voltar = false) {
  $$('.folha').forEach(f => f.classList.add('oculto'));
  document.body.style.overflow = '';
  if (voltar && empurrou) { empurrou = false; history.back(); }
  else if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

$$('[data-fechar]').forEach(b => b.addEventListener('click', () => fecharFolhas(true)));
$$('.folha').forEach(f => f.addEventListener('click', e => { if (e.target === f) fecharFolhas(true); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharFolhas(true); });
window.addEventListener('popstate', () => {
  const id = new URLSearchParams(location.hash.slice(1)).get('prato');
  empurrou = false;
  if (id) abrirPrato(id, false); else fecharFolhas(false);
});

// pesquisa
$('#procurar').addEventListener('input', e => { filtro = e.target.value; pintarMenu(); });

// pré-visualização ao vivo a partir do editor de identidade
if (previa) {
  document.documentElement.style.setProperty('--topo-seguro', '46px');   // espaço da câmara do telemóvel desenhado no editor
  addEventListener('message', e => {
    if (e.origin !== location.origin || !rest) return;
    const m = e.data || {};
    if (m.tipo === 'tema') { tema = limparTema(m.tema, pratos.map(p => p.id)); if (m.logoUrl !== undefined) rest.logoUrl = m.logoUrl; pintarTudo(); }
    if (m.tipo === 'abrir-prato') { const p = pratos.find(x => x.modelUrl) || pratos[0]; if (p) abrirPrato(p.id, false); }
    if (m.tipo === 'fechar') fecharFolhas(false);
  });
}

iniciar();
