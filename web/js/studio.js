// Estúdio do restaurante
import { api, esc, dinheiro, toast, ALERGENOS } from './comum.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const SESSAO = 'menu3d.sessao';

let sess = JSON.parse(localStorage.getItem(SESSAO) || 'null');
let rest = null;
let pratos = [];
let atual = null;          // prato em edição (cópia)
let fonteGlb = null;       // ArrayBuffer do modelo ainda por preparar
let glbTools = null;       // carregado só quando é preciso

const k = () => sess.key;
const carregarGlbTools = async () => (glbTools ||= await import('/vendor/glb-tools.js'));
const mb = n => `${(n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1)} MB`;

async function upload(kind, file, nome) {
  const form = new FormData();
  form.append('file', file, nome || file.name);
  return api(`/api/restaurants/${sess.id}/upload/${kind}`, { method: 'POST', key: k(), form });
}

// ---------------- entrada ----------------
$$('.alternar button').forEach(b => b.addEventListener('click', () => {
  $$('.alternar button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  $$('.form-entrada').forEach(f => f.classList.toggle('oculto', f.getAttribute('id') !== b.dataset.form));
}));

const ICONE = id => `<svg class="ic" aria-hidden="true"><use href="/img/icones.svg#${id}"/></svg>`;
$('#f-criar').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    const r = await api('/api/restaurants', { method: 'POST', body: Object.fromEntries(f) });
    sess = { id: r.restaurant.id, key: r.adminKey, slug: r.restaurant.slug };
    localStorage.setItem(SESSAO, JSON.stringify(sess));
    $('#chave-id').textContent = r.restaurant.id;
    $('#chave-key').textContent = r.adminKey;
    await abrir();
    $('#d-chave').showModal();
  } catch (err) { toast(err.message); }
  btn.disabled = false;
});

$('#f-entrar').addEventListener('submit', async e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  sess = { id: f.id.trim(), key: f.key.trim() };
  try { await abrir(); localStorage.setItem(SESSAO, JSON.stringify(sess)); }
  catch (err) { sess = null; toast(err.message); }
});

async function abrir() {
  const data = await api(`/api/admin/${sess.id}`, { key: k() });
  rest = data.restaurant;
  pratos = data.dishes;
  window.__plano = data.plano;
  pintarPlano(data.plano);
  // separadores conforme o plano contratado
  const porPlano = { painel: 'painel', pedidos: 'pedidos', impresso: 'impresso', equipa: 'equipa' };
  for (const [aba, f] of Object.entries(porPlano)) $(`.abas [data-aba="${aba}"]`).classList.toggle('oculto', !temFunc(f));
  sess.slug = rest.slug;
  $('#entrada').classList.add('oculto');
  $('#app').classList.remove('oculto');
  pintarTopo();
  pintarLista();
  pintarRestaurante();
  const aviso = $('#aviso-conta');
  const plataforma = sess.key.startsWith('plat:');
  aviso.className = `aviso-conta${rest.estado === 'suspenso' ? ' suspenso' : ''}`;
  aviso.innerHTML = rest.estado === 'suspenso'
    ? `<span>Este menu está suspenso: os clientes não o conseguem abrir.${plataforma ? '' : ' Fala com a equipa Kuvê para o reativar.'}</span>${plataforma ? '<a href="/plataforma">Voltar à plataforma</a>' : ''}`
    : plataforma ? `<span>Estás a gerir este restaurante como dono da plataforma.</span><a href="/plataforma">Voltar à plataforma</a>` : '';
  aviso.classList.toggle('oculto', !aviso.innerHTML);
  if (pratos.length) editar(pratos[0]); else mostrarVazio();
  iniciarPedidos();
  if (temFunc('painel')) abrirModulo('/js/painel-gerente.js');
  else $('.abas [data-aba="pratos"]').click();
}

// ---------------- o meu plano ----------------
const NOMES_FUNC = { pedidos: 'Pedidos pelo telemóvel', mesas: 'Gestão de mesas', equipa: 'Equipa com PIN', pagamentos: 'Registo de pagamentos', painel: 'Painel de vendas', impresso: 'Menu impresso em AR', ia3d: 'IA: foto → 3D', identidade: 'Identidade visual personalizada' };
const NOMES_LIM = { pratos: 'Pratos', modelos3d: 'Pratos com 3D', mesas: 'Mesas', equipa: 'Pessoas na equipa' };
function pintarPlano(p) {
  const el = $('#o-meu-plano');
  if (!p) return el.classList.add('oculto');
  const hojeIso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Luanda' });
  const atraso = p.precoMensal > 0 && p.pagoAte && p.pagoAte < hojeIso;
  const estado = p.estado === 'suspenso' ? ['mau', 'Suspenso'] : atraso ? ['aviso', 'Pagamento em atraso'] : ['ok', 'Ativo'];
  const data = iso => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  el.innerHTML = `
    <div class="plano-cab">
      <div><span class="rotulo-plano">O teu plano</span><h2 id="plano-titulo">${esc(p.nome)}</h2>
        <p class="mudo">${p.precoMensal ? `${Number(p.precoMensal).toLocaleString('pt-PT')} Kz por mês` : 'Sem mensalidade'}${p.pagoAte && p.precoMensal ? ` · pago até ${data(p.pagoAte)}` : ''}</p></div>
      <span class="pilula-plano ${estado[0]}">${estado[1]}</span>
    </div>
    <div class="plano-uso">${Object.entries(NOMES_LIM).map(([kk, nome]) => {
      const max = p.limites[kk] || 0, uso = p.uso[kk] || 0;
      return `<div><span>${nome}</span><b>${uso}${max ? ` de ${max}` : ''}</b><i class="barra-uso${max && uso / max >= 0.9 ? ' cheia' : ''}"><i style="width:${max ? Math.min(100, (uso / max) * 100) : 0}%"></i></i>${max ? '' : '<small>não incluído</small>'}</div>`;
    }).join('')}</div>
    <ul class="plano-func">${Object.entries(NOMES_FUNC).map(([f, nome]) => `<li class="${p.funcionalidades.includes(f) ? 'sim' : 'nao'}">${nome}</li>`).join('')}</ul>
    <p class="mudo pequeno">Para mudar de plano ou pagar a mensalidade, fala com a equipa Kuvê.</p>`;
}

// módulos do gerente carregados só quando são abertos
const modulos = {};
async function abrirModulo(caminho) {
  try {
    modulos[caminho] ||= await import(caminho);
    await modulos[caminho].abrir({ api, toast, chave: k, sess, obterRestaurante: () => rest, obterPratos: () => pratos });
  } catch (err) { console.error(err); toast('Não foi possível abrir esta secção.'); }
}

function pintarTopo() {
  $('#nome-restaurante').textContent = rest.name;
  $('#link-menu').href = `/m/${rest.slug}`;
  document.documentElement.style.setProperty('--cor-restaurante', rest.color); // a cor do restaurante fica no avatar; a ferramenta é Kuvê
  for (const el of [$('#avatar'), $('#logo-vazio')]) {
    el.textContent = rest.logoUrl ? '' : (rest.name.trim()[0] || '').toUpperCase();
    el.style.backgroundImage = rest.logoUrl ? `url('${rest.logoUrl}')` : '';
  }
}

// ---------------- abas ----------------
$$('.abas button').forEach(b => b.addEventListener('click', () => {
  $$('.abas button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  $$('.aba').forEach(s => s.classList.toggle('oculto', s.id !== `aba-${b.dataset.aba}`));
  if (b.dataset.aba === 'qr') pintarQR();
  if (b.dataset.aba === 'impresso') abrirEditorCena();
  if (b.dataset.aba === 'painel') abrirModulo('/js/painel-gerente.js');
  if (b.dataset.aba === 'equipa') abrirModulo('/js/equipa-gestao.js');
  if (b.dataset.aba === 'pedidos') carregarPedidos();
}));

// ---------------- lista de pratos ----------------
function pintarLista() {
  const com3d = pratos.filter(p => p.modelUrl).length;
  $('#resumo-pratos').textContent = pratos.length
    ? `${pratos.length} ${pratos.length === 1 ? 'prato' : 'pratos'} no menu, ${com3d} com modelo 3D.`
    : 'Ainda não há pratos no menu.';
  $('#lista-pratos').innerHTML = pratos.map(p => `
    <li><button type="button" data-id="${p.id}" aria-current="${atual?.id === p.id}">
      <span class="mini">${p.posterUrl || p.photos[0] ? `<img src="${esc(p.posterUrl || p.photos[0])}" alt="">` : `<span class="ini">${esc(p.name.trim()[0] || '')}</span>`}</span>
      <span style="min-width:0"><span class="nome">${esc(p.name)}</span>
      <span class="sub">${dinheiro(p.price, rest.currency)}${p.modelUrl ? `<span class="ponto-3d">${ICONE('cubo')}3D</span>` : ''}${p.visible ? '' : '<span class="tag-oculto">oculto</span>'}${p.esgotado ? '<span class="tag-oculto">esgotado</span>' : ''}</span></span>
    </button></li>`).join('');
  $$('#lista-pratos button').forEach(b => b.addEventListener('click', () => editar(pratos.find(p => p.id === b.dataset.id))));
}

function mostrarVazio() {
  $('#editor').classList.add('oculto');
  $('#editor-vazio').classList.remove('oculto');
}

$('#novo-prato').addEventListener('click', () => editar({
  name: '', category: rest.categories[0] || '', price: 0, description: '', ingredients: '',
  allergens: [], calories: null, variants: [], photos: [], modelUrl: '', posterUrl: '',
  realSizeCm: null, visible: true, animation: 'spin',
}));

// ---------------- editor ----------------
const form = $('#editor');

function editar(p) {
  atual = structuredClone(p);
  fonteGlb = null;
  $('#editor-vazio').classList.add('oculto');
  form.classList.remove('oculto');
  $('#titulo-editor').textContent = p.id ? p.name : 'Novo prato';
  $('#sel-categoria').innerHTML = [...new Set([...rest.categories, p.category].filter(Boolean))]
    .map(c => `<option ${c === p.category ? 'selected' : ''}>${esc(c)}</option>`).join('');
  form.name.value = p.name;
  form.price.value = p.price;
  form.description.value = p.description;
  form.ingredients.value = p.ingredients;
  form.calories.value = p.calories ?? '';
  form.animation.value = p.animation || 'spin';
  form.visible.checked = p.visible !== false;
  $('#in-esgotado').checked = Boolean(p.esgotado);
  $('#in-esgotado').disabled = !p.id;
  $('#alergenos').innerHTML = ALERGENOS.map(a =>
    `<label><input type="checkbox" value="${esc(a)}" ${p.allergens.includes(a) ? 'checked' : ''}> ${esc(a)}</label>`).join('');
  pintarVariantes();
  pintarFotos();
  $('#apagar-prato').classList.toggle('oculto', !p.id);
  $('#preparar').classList.add('oculto');
  $('#estado-3d').textContent = '';
  $('#p-cm').value = p.realSizeCm ?? '';
  mostrarModelo(p.modelUrl);
  pintarLista();
}

function pintarVariantes() {
  $('#variantes').innerHTML = atual.variants.map((v, i) => `
    <div class="variante">
      <input type="text" value="${esc(v.name)}" data-i="${i}" data-k="name" placeholder="Ex.: Meia dose" aria-label="Nome da variante">
      <input type="number" value="${v.price}" data-i="${i}" data-k="price" min="0" step="50" aria-label="Preço da variante">
      <button type="button" data-rm="${i}" aria-label="Remover variante">${ICONE('fechar')}</button>
    </div>`).join('');
  $$('#variantes input').forEach(inp => inp.addEventListener('input', () => {
    atual.variants[inp.dataset.i][inp.dataset.k] = inp.dataset.k === 'price' ? Number(inp.value) : inp.value;
  }));
  $$('#variantes [data-rm]').forEach(b => b.addEventListener('click', () => { atual.variants.splice(b.dataset.rm, 1); pintarVariantes(); }));
}
$('#add-variante').addEventListener('click', () => { atual.variants.push({ name: '', price: Number(form.price.value) || 0 }); pintarVariantes(); });

function pintarFotos() {
  $('#fotos').innerHTML = atual.photos.map((u, i) => `
    <div class="foto"><img src="${esc(u)}" alt=""><button type="button" data-rm="${i}" aria-label="Remover foto">${ICONE('fechar')}</button></div>`).join('');
  $$('#fotos [data-rm]').forEach(b => b.addEventListener('click', () => { atual.photos.splice(b.dataset.rm, 1); pintarFotos(); }));
}
$('#in-foto').addEventListener('change', async e => {
  for (const f of e.target.files) {
    try { const r = await upload('image', f); atual.photos.push(r.url); pintarFotos(); }
    catch (err) { toast(err.message); }
  }
  e.target.value = '';
});

function lerFormulario() {
  Object.assign(atual, {
    name: form.name.value.trim(),
    category: form.category.value,
    price: Number(form.price.value) || 0,
    description: form.description.value,
    ingredients: form.ingredients.value,
    calories: form.calories.value === '' ? null : Number(form.calories.value),
    animation: form.animation.value,
    visible: form.visible.checked,
    allergens: $$('#alergenos input:checked').map(i => i.value),
    variants: atual.variants.filter(v => v.name.trim()),
  });
}

async function guardarPrato() {
  lerFormulario();
  if (!atual.name) { form.name.focus(); throw new Error('Dá um nome ao prato antes de guardar.'); }
  const r = atual.id
    ? await api(`/api/dishes/${atual.id}`, { method: 'PUT', key: k(), body: atual })
    : await api(`/api/restaurants/${sess.id}/dishes`, { method: 'POST', key: k(), body: atual });
  const i = pratos.findIndex(p => p.id === r.dish.id);
  if (i >= 0) pratos[i] = r.dish; else pratos.push(r.dish);
  atual = structuredClone(r.dish);
  $('#titulo-editor').textContent = r.dish.name;
  $('#apagar-prato').classList.remove('oculto');
  pintarLista();
  return r.dish;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  try { await guardarPrato(); toast('Prato guardado'); } catch (err) { toast(err.message); }
});

$('#apagar-prato').addEventListener('click', async () => {
  if (!atual?.id || !confirm(`Apagar "${atual.name}" do menu? Esta ação não se desfaz.`)) return;
  try {
    await api(`/api/dishes/${atual.id}`, { method: 'DELETE', key: k() });
    pratos = pratos.filter(p => p.id !== atual.id);
    atual = null;
    pintarLista();
    pratos.length ? editar(pratos[0]) : mostrarVazio();
    toast('Prato apagado');
  } catch (err) { toast(err.message); }
});

$('#in-esgotado').addEventListener('change', async e => {
  if (!atual?.id) return;
  try {
    const r = await api(`/api/dishes/${atual.id}/esgotado`, { method: 'PUT', key: k(), body: { esgotado: e.target.checked } });
    atual.esgotado = r.esgotado;
    const p = pratos.find(x => x.id === atual.id); if (p) p.esgotado = r.esgotado;
    pintarLista();
    toast(r.esgotado ? `${atual.name}: esgotado hoje. Volta amanhã automaticamente.` : `${atual.name} disponível de novo`);
  } catch (err) { e.target.checked = !e.target.checked; toast(err.message); }
});

// ---------------- 3D ----------------
const mv = $('#mv');
let urlTemporario = null;

function mostrarModelo(src) {
  if (urlTemporario && src !== urlTemporario) { URL.revokeObjectURL(urlTemporario); urlTemporario = null; }
  $('#palco-vazio').classList.toggle('oculto', Boolean(src));
  $('#medidas').textContent = '';
  if (src) mv.src = src; else mv.removeAttribute('src');
}

mv.addEventListener('load', () => {
  const d = mv.getDimensions();
  const cm = v => (v * 100).toFixed(v < 1 ? 1 : 0);
  $('#medidas').textContent = `${cm(d.x)} × ${cm(d.z)} cm · ${cm(d.y)} cm de altura`;
  const m = mv.model?.materials?.[0]?.pbrMetallicRoughness;
  if (m && fonteGlb) {
    $('#p-rough').value = m.roughnessFactor;
    $('#p-metal').value = m.metallicFactor;
    sincronizarSaidas();
  }
});

function sincronizarSaidas() {
  $('#o-rough').textContent = Number($('#p-rough').value).toFixed(2);
  $('#o-metal').textContent = Number($('#p-metal').value).toFixed(2);
  $('#o-coat').textContent = Number($('#p-coat').value).toFixed(2);
}

// pré-visualização ao vivo dos materiais
['#p-rough', '#p-metal', '#p-coat'].forEach(sel => $(sel).addEventListener('input', () => {
  sincronizarSaidas();
  for (const m of mv.model?.materials || []) {
    m.pbrMetallicRoughness.setRoughnessFactor(Number($('#p-rough').value));
    m.pbrMetallicRoughness.setMetallicFactor(Number($('#p-metal').value));
  }
}));

function receberGlb(buffer, origem) {
  fonteGlb = buffer;
  urlTemporario = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
  mostrarModelo(urlTemporario);
  $('#preparar').classList.remove('oculto');
  $('#estado-3d').textContent = `${origem} · ${mb(buffer.byteLength)}. Indica o tamanho real e prepara o modelo para o guardar.`;
  if (!$('#p-cm').value && atual.realSizeCm) $('#p-cm').value = atual.realSizeCm;
  $('#p-cm').focus();
}

$('#in-glb').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (f.size > 120 * 1024 * 1024) return toast('Ficheiro demasiado grande (máximo 120 MB antes de preparar).');
  receberGlb(await f.arrayBuffer(), `Modelo carregado: ${f.name}`);
});

$('#aplicar-3d').addEventListener('click', async () => {
  const btn = $('#aplicar-3d');
  const estado = $('#estado-3d');
  const cm = Number($('#p-cm').value);
  if (!fonteGlb) return toast('Carrega ou gera um modelo primeiro.');
  if (!cm) { $('#p-cm').focus(); return toast('Indica o tamanho real do prato em cm.'); }
  if (!form.name.value.trim()) { form.name.focus(); return toast('Dá um nome ao prato antes de guardar o modelo.'); }
  btn.disabled = true;
  try {
    const t = await carregarGlbTools();
    const bytesAntes = fonteGlb.byteLength;
    const doc = await t.readGlb(fonteGlb);
    const antes = t.inspect(doc);
    const out = await t.prepare(doc, {
      realSizeCm: cm,
      roughness: Number($('#p-rough').value),
      metalness: Number($('#p-metal').value),
      clearcoat: Number($('#p-coat').value),
      maxTexture: Number($('#p-tex').value),
      maxTriangles: Number($('#p-tri').value),
    }, passo => { estado.textContent = `${passo}…`; });

    estado.textContent = 'A enviar o modelo…';
    const nome = `${(form.name.value || 'prato').normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase()}.glb`;
    const up = await upload('model', new Blob([out], { type: 'model/gltf-binary' }), nome);
    atual.modelUrl = up.url;
    atual.realSizeCm = cm;
    fonteGlb = null;

    // fotografia automática do prato para o menu
    estado.textContent = 'A criar a imagem do prato…';
    mostrarModelo(up.url);
    await new Promise(res => mv.addEventListener('load', res, { once: true }));
    await new Promise(res => setTimeout(res, 400));
    const poster = await mv.toBlob({ mimeType: 'image/webp', qualityArgument: 0.9, idealAspect: false });
    const pu = await upload('image', poster, 'poster.webp');
    atual.posterUrl = pu.url;

    await guardarPrato();
    $('#preparar').classList.add('oculto');
    estado.textContent = '';
    const depois = t.inspect(await t.readGlb(out));
    toast(`Modelo guardado: ${mb(bytesAntes)} → ${mb(out.byteLength)}, ${Math.round(antes.triangles / 1000)} mil → ${Math.round(depois.triangles / 1000)} mil triângulos`, 6000);
  } catch (err) {
    console.error(err);
    estado.textContent = '';
    toast(err.message || 'Não foi possível preparar o modelo.');
  }
  btn.disabled = false;
});

// ---------------- IA: foto → 3D ----------------
const dIa = $('#d-ia');
$('#abrir-ia').addEventListener('click', () => { $('#ia-estado').textContent = ''; $('#ia-prev').innerHTML = ''; $('#f-ia').reset(); dIa.showModal(); });
$('#ia-fotos').addEventListener('change', e => {
  const fs = [...e.target.files].slice(0, 4);
  $('#ia-prev').innerHTML = fs.map(f => `<div class="foto"><img src="${URL.createObjectURL(f)}" alt=""></div>`).join('');
});

$('#ia-enviar').addEventListener('click', async e => {
  e.preventDefault();
  const fotos = [...$('#ia-fotos').files].slice(0, 4);
  if (!fotos.length) return toast('Escolhe pelo menos uma foto.');
  const btn = e.currentTarget;
  btn.disabled = true;
  const estado = $('#ia-estado');
  try {
    const fd = new FormData();
    fotos.forEach(f => fd.append('photos', f));
    fd.append('quality', $('#ia-qualidade').value);
    if (atual?.id) fd.append('dishId', atual.id);
    const { job, queuePosition } = await api(`/api/restaurants/${sess.id}/ai-jobs`, { method: 'POST', key: k(), form: fd });
    estado.textContent = queuePosition > 1 ? `Na fila (posição ${queuePosition})…` : 'Na fila…';
    const resultado = await esperarTrabalho(job.id, estado);
    estado.textContent = 'Modelo pronto. A carregar…';
    const buf = await (await fetch(resultado.resultUrl)).arrayBuffer();
    dIa.close();
    receberGlb(buf, 'Modelo gerado pela IA');
  } catch (err) { estado.textContent = err.message; }
  btn.disabled = false;
});

async function esperarTrabalho(id, estado) {
  const inicio = Date.now();
  for (;;) {
    await new Promise(r => setTimeout(r, 4000));
    const { job, workerConfigured } = await api(`/api/ai-jobs/${id}`, { key: k() });
    if (!workerConfigured) throw new Error('O servidor de IA ainda não está ligado (falta configurar o WORKER_TOKEN e arrancar o worker com GPU).');
    if (job.status === 'pronto') return job;
    if (job.status === 'falhou') throw new Error(`A geração falhou: ${job.error}`);
    const min = Math.floor((Date.now() - inicio) / 60000);
    estado.textContent = job.status === 'a gerar'
      ? `A gerar o modelo 3D… ${min ? `${min} min` : ''} (costuma levar 1 a 3 minutos)`
      : 'Na fila, à espera de uma GPU livre…';
    if (Date.now() - inicio > 20 * 60000) throw new Error('A geração está a demorar mais de 20 minutos. Verifica se o worker está a correr.');
  }
}

// ---------------- pedidos ----------------
const METODOS = { dinheiro: 'Dinheiro', multicaixa: 'Multicaixa Express', tpa: 'TPA (cartão)', transferencia: 'Transferência' };
const ROTULO = { recebido: 'Recebido', confirmado: 'Confirmado', em_preparacao: 'Em preparação', pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado' };
const ACOES = {
  recebido: [['confirmado', 'Confirmar', 'secundario'], ['em_preparacao', 'Preparar', '']],
  confirmado: [['em_preparacao', 'Preparar', '']],
  em_preparacao: [['pronto', 'Está pronto', '']],
  pronto: [['entregue', 'Entregue', 'acento']],
};
const COLUNA = { recebido: 'novos', confirmado: 'novos', em_preparacao: 'em_preparacao', pronto: 'pronto' };
const temFunc = f => (rest?.funcionalidades || []).includes(f);
const pago = p => p.pagamento?.estado === 'pago';
let pedidos = [];
let vistos = new Set();
try { vistos = new Set(JSON.parse(sessionStorage.getItem('menu3d.vistos') || '[]')); } catch {}
let metodosAbertos = null;

function iniciarPedidos() {
  if (!temFunc('pedidos')) return;
  carregarPedidos();
  setInterval(carregarPedidos, 5000);
}

async function carregarPedidos() {
  try {
    const r = await api(`/api/restaurants/${sess.id}/orders`, { key: k() });
    pedidos = r.orders;
    const abaAberta = !$('#aba-pedidos').classList.contains('oculto');
    const novos = pedidos.filter(p => p.status === 'recebido');
    if (abaAberta) { novos.forEach(p => vistos.add(p.id)); try { sessionStorage.setItem('menu3d.vistos', JSON.stringify([...vistos])); } catch {} }
    const porVer = novos.filter(p => !vistos.has(p.id)).length;
    $('#badge-pedidos').textContent = porVer;
    $('#badge-pedidos').classList.toggle('oculto', !porVer);
    if (abaAberta && !metodosAbertos) pintarPedidos();
  } catch { /* sem rede: tenta outra vez daqui a 5 s */ }
}

function haQuanto(iso) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  return new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function cartaoPedido(p) {
  const comPag = temFunc('pagamentos');
  const acoes = (ACOES[p.status] || []).map(([para, txt, cls]) => `<button class="btn pequeno ${cls}" data-id="${p.id}" data-st="${para}">${txt}</button>`);
  if (['recebido', 'confirmado', 'em_preparacao'].includes(p.status) && !pago(p)) acoes.unshift(`<button class="btn fantasma pequeno perigo" data-id="${p.id}" data-st="cancelado">Cancelar</button>`);
  const pag = !comPag ? '' : pago(p)
    ? `<span class="pago-tag">Pago · ${esc(METODOS[p.pagamento.metodo] || '')}</span><button class="link-mini" data-anular="${p.id}">anular</button>`
    : metodosAbertos === p.id
      ? `<div class="metodos">${Object.entries(METODOS).map(([m, nome]) => `<button class="btn secundario pequeno" data-metodo="${m}" data-id="${p.id}">${nome}</button>`).join('')}<button class="btn fantasma pequeno" data-fechar-metodos>Voltar</button></div>`
      : `<button class="btn secundario pequeno" data-pagar="${p.id}">Registar pagamento</button>`;
  return `<li class="pedido">
    <div class="pedido-cab"><strong>${p.table ? `Mesa ${esc(p.table)}` : 'Balcão'}</strong><span>#${p.number} · ${haQuanto(p.createdAt)}</span></div>
    ${p.status === 'confirmado' ? '<span class="etiqueta-est">Confirmado</span>' : ''}
    ${p.table && p.mesaVerificada === false ? '<span class="etiqueta-est aviso-mesa" title="O número da mesa veio escrito no link, não de um QR com código">Mesa não verificada</span>' : ''}
    <ul>${p.items.map(i => `<li><b>${i.qty}×</b> ${esc(i.name)}${i.variant ? ` <span class="mudo">· ${esc(i.variant)}</span>` : ''}</li>`).join('')}</ul>
    ${p.note ? `<p class="nota">${esc(p.note)}</p>` : ''}
    <div class="pedido-rodape"><strong>${dinheiro(p.total, rest.currency)}</strong><span class="pag">${pag}</span></div>
    ${acoes.length ? `<div class="acoes">${acoes.join('')}</div>` : ''}
  </li>`;
}

function pintarPedidos() {
  const grupos = { novos: [], em_preparacao: [], pronto: [], por_pagar: [] };
  const fechados = [];
  for (const p of pedidos) {
    if (COLUNA[p.status]) grupos[COLUNA[p.status]].push(p);
    else if (p.status === 'entregue' && !pago(p) && temFunc('pagamentos')) grupos.por_pagar.push(p);
    else fechados.push(p);
  }
  $('.coluna[data-estado="por_pagar"]').classList.toggle('oculto', !temFunc('pagamentos'));
  $('#aba-pedidos .quadro').classList.toggle('quadro-4', temFunc('pagamentos'));
  for (const col of $$('#aba-pedidos .coluna')) {
    const lista = (grupos[col.dataset.estado] || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    col.querySelector('.contagem').textContent = lista.length;
    col.querySelector('ol').innerHTML = lista.length ? lista.map(cartaoPedido).join('') : '<li class="vazio-coluna">Sem pedidos</li>';
  }
  $('#n-fechados').textContent = `(${fechados.length})`;
  $('#fechados').innerHTML = fechados.map(p => `<li><span>#${p.number} · ${p.table ? `Mesa ${esc(p.table)}` : 'Balcão'} · ${haQuanto(p.createdAt)}</span>
    <span class="estado-fechado ${p.status}">${ROTULO[p.status] || p.status}</span>
    <b>${dinheiro(p.total, rest.currency)}</b>
    <span>${pago(p) ? `Pago · ${esc(METODOS[p.pagamento.metodo] || '')} <button class="link-mini" data-anular="${p.id}">anular</button>` : p.status === 'cancelado' ? '' : 'Por pagar'}</span></li>`).join('') || '<li class="mudo">Nada ainda.</li>';
}

$('#aba-pedidos').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.pagar) { metodosAbertos = b.dataset.pagar; return pintarPedidos(); }
  if (b.hasAttribute('data-fechar-metodos')) { metodosAbertos = null; return pintarPedidos(); }
  b.disabled = true;
  try {
    if (b.dataset.metodo) {
      await api(`/api/orders/${b.dataset.id}/pagamento`, { method: 'POST', key: k(), body: { metodo: b.dataset.metodo } });
      metodosAbertos = null; toast(`Pagamento registado: ${METODOS[b.dataset.metodo]}`);
    } else if (b.dataset.anular) {
      if (!confirm('Anular este pagamento? O pedido volta a ficar por pagar.')) { b.disabled = false; return; }
      await api(`/api/orders/${b.dataset.anular}/pagamento`, { method: 'DELETE', key: k() });
      toast('Pagamento anulado');
    } else if (b.dataset.st) {
      if (b.dataset.st === 'cancelado' && !confirm('Cancelar este pedido?')) { b.disabled = false; return; }
      await api(`/api/orders/${b.dataset.id}`, { method: 'PATCH', key: k(), body: { status: b.dataset.st } });
    }
    await carregarPedidos(); pintarPedidos();
  } catch (err) { toast(err.message); b.disabled = false; }
});

// ---------------- mesas e QR ----------------
let mesas = [];
const ESTADO_MESA = { livre: 'Livre', pendente: 'Pedido por confirmar', ocupada: 'Ocupada' };
async function pintarQR() {
  const base = `/api/menu/${rest.slug}/qr.svg`;
  const extra = [`<div class="qr qr-extra"><span class="qr-rest">${esc(rest.name)}</span><img src="${base}" alt="QR geral" loading="lazy"><strong>Balcão / takeaway</strong><small>Menu sem mesa</small></div>`];
  if (rest.print?.mindUrl) extra.push(`<div class="qr qr-extra"><span class="qr-rest">${esc(rest.name)}</span><img src="${base}?tipo=impresso" alt="QR do menu impresso" loading="lazy"><strong>Menu impresso</strong><small>Abre a câmara para o menu de papel</small></div>`);
  const podeMesas = temFunc('mesas');
  $('.mesas-barra').classList.toggle('oculto', !podeMesas);
  if (!podeMesas) {
    $('#grelha-qr').innerHTML = `<p class="aviso">A gestão de mesas não está incluída no teu plano. O QR geral abre o menu sem mesa.</p>${extra.join('')}`;
    return;
  }
  try {
    const r = await api(`/api/restaurants/${sess.id}/mesas`, { key: k() });
    mesas = r.mesas;
  } catch (err) { return toast(err.message); }
  const plano = window.__plano;
  $('#uso-mesas').textContent = plano ? `${mesas.length} de ${plano.limites.mesas} mesas do plano ${plano.nome}.` : '';
  $('#grelha-qr').innerHTML = mesas.map(m => `
    <div class="qr${m.ativa ? '' : ' inativa'}" data-mesa="${m.id}">
      <span class="qr-rest">${esc(rest.name)}</span>
      <img src="${base}?m=${encodeURIComponent(m.codigo)}" alt="QR da mesa ${esc(m.nome)}" loading="lazy">
      <strong>${/^\d+$/.test(m.nome) ? `Mesa ${esc(m.nome)}` : esc(m.nome)}</strong>
      <small>Aponta a câmara para ver o menu em 3D</small>
      <div class="mesa-gestao">
        <span class="estado-mesa ${m.estado}">${m.ativa ? ESTADO_MESA[m.estado] : 'Desativada'}${m.porPagar ? ` · ${dinheiro(m.porPagar, rest.currency)} por pagar` : ''}</span>
        <div class="mesa-botoes">
          ${m.estado !== 'livre' ? `<button class="btn secundario pequeno" data-acao="libertar">Libertar</button>` : ''}
          <button class="btn fantasma pequeno" data-acao="nome">Mudar nome</button>
          <button class="btn fantasma pequeno" data-acao="codigo" title="O QR antigo deixa de funcionar">Novo QR</button>
          <button class="btn fantasma pequeno" data-acao="ativa">${m.ativa ? 'Desativar' : 'Ativar'}</button>
          <button class="btn fantasma pequeno icone perigo" data-acao="apagar" aria-label="Apagar a mesa ${esc(m.nome)}"><svg class="ic"><use href="/img/icones.svg#lixo"/></svg></button>
        </div>
      </div>
    </div>`).join('') + extra.join('');
}
$('#grelha-qr').addEventListener('click', async e => {
  const b = e.target.closest('[data-acao]'); if (!b) return;
  const m = mesas.find(x => x.id === b.closest('[data-mesa]').dataset.mesa);
  const url = `/api/restaurants/${sess.id}/mesas/${m.id}`;
  try {
    if (b.dataset.acao === 'nome') {
      const nome = prompt('Nome ou número da mesa', m.nome); if (!nome || nome === m.nome) return;
      await api(url, { method: 'PATCH', key: k(), body: { nome } });
    } else if (b.dataset.acao === 'codigo') {
      if (!confirm(`Gerar um QR novo para ${m.nome}? O QR impresso atual deixa de funcionar: terás de imprimir o novo.`)) return;
      await api(url, { method: 'PATCH', key: k(), body: { novoCodigo: true } });
      toast('QR novo criado. Imprime-o e troca o da mesa.');
    } else if (b.dataset.acao === 'ativa') {
      await api(url, { method: 'PATCH', key: k(), body: { ativa: !m.ativa } });
    } else if (b.dataset.acao === 'apagar') {
      if (!confirm(`Apagar a mesa ${m.nome}? O QR dela deixa de funcionar.`)) return;
      await api(url, { method: 'DELETE', key: k() });
    } else if (b.dataset.acao === 'libertar') {
      try { await api(`${url}/libertar`, { method: 'POST', key: k(), body: {} }); }
      catch (err) {
        if (!confirm(`${err.message}\nLibertar mesmo assim?`)) return;
        await api(`${url}/libertar`, { method: 'POST', key: k(), body: { mesmoAssim: true } });
      }
      toast(`${m.nome}: livre`);
    }
    pintarQR();
  } catch (err) { toast(err.message); }
});
$('#f-mesa').addEventListener('submit', async e => {
  e.preventDefault();
  const nome = e.target.nome.value.trim(); if (!nome) return;
  try { await api(`/api/restaurants/${sess.id}/mesas`, { method: 'POST', key: k(), body: { nome } }); e.target.reset(); pintarQR(); }
  catch (err) { toast(err.message); }
});
$('#f-mesas').addEventListener('submit', async e => {
  e.preventDefault();
  const de = Number(e.target.de.value), ate = Number(e.target.ate.value);
  if (!de || !ate || ate < de || ate - de > 199) return toast('Indica um intervalo válido (até 200 mesas).');
  const nomes = Array.from({ length: ate - de + 1 }, (_, i) => String(de + i));
  try {
    const r = await api(`/api/restaurants/${sess.id}/mesas`, { method: 'POST', key: k(), body: { nomes } });
    toast(r.criadas ? `${r.criadas} mesas criadas` : 'Essas mesas já existiam');
    e.target.reset(); pintarQR();
  } catch (err) { toast(err.message); }
});
$('#imprimir-qr').addEventListener('click', () => window.print());

// ---------------- menu em AR (editor de cena, carregado só quando é aberto) ----------------
let editorCena = null;
async function abrirEditorCena() {
  try {
    editorCena ||= await import('/js/editor-cena.js');
    editorCena.abrir({
      api, upload, toast, chave: k, sess,
      obterRestaurante: () => rest,
      definirRestaurante: r => { rest = r; },
      obterPratos: () => pratos,
    });
  } catch (err) { console.error(err); toast('Não foi possível abrir o editor de cena.'); }
}

// ---------------- restaurante ----------------
function pintarRestaurante() {
  const f = $('#f-rest');
  f.name.value = rest.name;
  f.tagline.value = rest.tagline || '';
  f.whatsapp.value = rest.whatsapp || '';
  f.currency.value = rest.currency;
  f.color.value = rest.color;
  f.color.disabled = Boolean(rest.identidadeBloqueada) && !k().startsWith('plat:');
  $('#cor-bloqueada').classList.toggle('oculto', !f.color.disabled);
  f.tables.value = rest.tables;
  f.categories.value = rest.categories.join(', ');
  $('#logo-prev').src = rest.logoUrl || '';
  $('#logo-prev').classList.toggle('oculto', !rest.logoUrl);
  $('#logo-vazio').classList.toggle('oculto', Boolean(rest.logoUrl));
  pintarTopo();
  $('#sessao-id').textContent = rest.id;
}

$('#f-rest').addEventListener('submit', async e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  f.categories = f.categories.split(',').map(s => s.trim()).filter(Boolean);
  try {
    const r = await api(`/api/restaurants/${sess.id}`, { method: 'PUT', key: k(), body: f });
    rest = r.restaurant;
    pintarTopo();
    pintarRestaurante();
    toast('Restaurante guardado');
  } catch (err) { toast(err.message); }
});

$('#in-logo').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const up = await upload('image', f);
    const r = await api(`/api/restaurants/${sess.id}`, { method: 'PUT', key: k(), body: { logoUrl: up.url } });
    rest = r.restaurant;
    pintarRestaurante();
    toast('Logótipo atualizado');
  } catch (err) { toast(err.message); }
});

$('#sair').addEventListener('click', () => {
  if (!confirm('Sair deste aparelho? Vais precisar do código e da chave para voltar a entrar.')) return;
  localStorage.removeItem(SESSAO);
  location.reload();
});

// ---------------- arranque ----------------
sincronizarSaidas();
if (sess) abrir().catch(() => { localStorage.removeItem(SESSAO); sess = null; $('#entrada').classList.remove('oculto'); });
else $('#entrada').classList.remove('oculto');
