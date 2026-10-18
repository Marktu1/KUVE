// Kuvê — servidor principal (produto Menu 3D)
// API dos restaurantes, pratos, pedidos e fila de IA (foto → 3D) + ficheiros estáticos.
import express from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createStore, slugify } from './store.js';
import { limparTema, estadoHorario, PADRAO } from '../web/js/temas.js';
import {
  ESTADOS, ROTULO_ESTADO, ABERTOS, podeMudar, METODOS, PERMISSOES, PERMISSOES_DA_FUNCAO, permissoesDe,
  FUNCIONALIDADES, LIMITES, limparPlano, migrar,
} from './dominio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const WORKER_TOKEN = process.env.WORKER_TOKEN || '';
const JOB_TIMEOUT_MS = 30 * 60 * 1000;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const store = createStore(DATA_DIR);
const { db } = store;

// Chave do painel da plataforma (a equipa Kuvê).
// Usa PLATAFORMA_CHAVE se existir; senão gera uma na primeira vez e guarda-a num ficheiro do servidor.
if (process.env.PLATAFORMA_CHAVE) {
  db.plataforma.chaveHash = crypto.createHash('sha256').update(process.env.PLATAFORMA_CHAVE).digest('hex');
} else if (!db.plataforma.chaveHash) {
  const chave = crypto.randomBytes(18).toString('base64url');
  db.plataforma.chaveHash = crypto.createHash('sha256').update(chave).digest('hex');
  const ficheiro = path.join(DATA_DIR, 'CHAVE-DA-PLATAFORMA.txt');
  fs.writeFileSync(ficheiro, `Chave do painel da plataforma (/plataforma):\n${chave}\n\nGuarda-a num gestor de palavras-passe e apaga este ficheiro.\n`, { mode: 0o600 });
  console.log(`\nChave do painel da plataforma criada: ${chave}\n(também guardada em ${ficheiro})\n`);
}
migrar(db, { novoCodigo: n => crypto.randomBytes(n).toString('base64url').slice(0, n) });
store.save();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);   // atrás do Caddy/Nginx: o IP real vem no X-Forwarded-For
app.use(express.json({ limit: '1mb' }));

// ---------- utilidades ----------
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const now = () => new Date().toISOString();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function findRestaurant(idOrSlug) {
  const r = db.restaurants.find(x => x.id === idOrSlug || x.slug === idOrSlug);
  if (!r) throw new HttpError(404, 'Restaurante não encontrado.');
  return r;
}

const chavePlataformaValida = k => Boolean(k) && sha(k) === db.plataforma.chaveHash;

function requirePlataforma(req) {
  if (!chavePlataformaValida(req.get('x-plataforma-key') || '')) throw new HttpError(401, 'Chave da plataforma inválida.');
}

// Sessões da equipa (PIN): token aleatório, guardado só como hash, válido 30 dias
const DURACAO_SESSAO = 30 * 864e5;
function membroDaSessao(req, restaurant) {
  const token = req.get('x-equipa-token') || '';
  if (!token) return null;
  const s = db.sessoes[sha(token)];
  if (!s || s.rid !== restaurant.id || Date.parse(s.expira) < Date.now()) return null;
  const m = (restaurant.equipa || []).find(x => x.id === s.membroId && x.ativo !== false);
  return m || null;
}

// Gerente OU equipa: devolve quem é, para registar no histórico
function requireEquipa(req, restaurant) {
  const m = membroDaSessao(req, restaurant);
  if (m) return { papel: 'equipa', nome: m.nome, funcao: m.funcao, permissoes: permissoesDe(m) };
  requireAdmin(req, restaurant);
  return { papel: 'gerente', nome: 'Gerente', permissoes: Object.keys(PERMISSOES) };
}
// Gerente pode tudo; a equipa só o que o gerente lhe deu
function requirePermissao(req, restaurant, perm) {
  const quem = requireEquipa(req, restaurant);
  if (!quem.permissoes.includes(perm)) throw new HttpError(403, `Não tens permissão para isto (${PERMISSOES[perm].toLowerCase()}). Fala com o gerente.`);
  return quem;
}

function requireAdmin(req, restaurant) {
  const key = req.get('x-admin-key') || '';
  // o dono da plataforma pode entrar em qualquer estúdio com "plat:<chave da plataforma>"
  if (key.startsWith('plat:') && chavePlataformaValida(key.slice(5))) return;
  if (!key || sha(key) !== restaurant.adminKeyHash) {
    throw new HttpError(401, 'Chave de administração inválida.');
  }
}

function requireWorker(req) {
  const token = req.get('x-worker-token') || '';
  if (!WORKER_TOKEN) throw new HttpError(503, 'WORKER_TOKEN não está configurado no servidor.');
  if (token !== WORKER_TOKEN) throw new HttpError(401, 'Token do worker inválido.');
}

// Tema publicado do menu; restaurantes antigos herdam a cor que já tinham
const idsPratos = r => db.dishes.filter(d => d.restaurantId === r.id).map(d => d.id);
const temaDe = r => r.tema || limparTema({ cores: { ...PADRAO.cores, acento: r.color } });

const publicRestaurant = r => {
  const { adminKeyHash, notas, contacto, equipa, tema, temaRascunho, temaHistorico, mesas, plano, pagoAte, ...rest } = r;
  return { ...rest, tema: temaDe(r), identidadeBloqueada: Boolean(r.identidadeBloqueada), funcionalidades: planoDe(r).funcionalidades };
};

// ---------- planos SaaS (configurados no painel da plataforma, guardados na base de dados) ----------
const planos = () => db.plataforma.planos || [];
const planoDe = r => planos().find(p => p.id === r.plano) || planos().find(p => p.id === 'teste') || limparPlano({ funcionalidades: Object.keys(FUNCIONALIDADES) });
const temFuncionalidade = (r, f) => planoDe(r).funcionalidades.includes(f);
function exigirFuncionalidade(r, f) {
  if (!temFuncionalidade(r, f)) throw new HttpError(403, `"${FUNCIONALIDADES[f]}" não está incluído no plano ${planoDe(r).nome}. Fala com a equipa Kuvê para mudar de plano.`);
}
function usoDe(r) {
  const pratos = db.dishes.filter(d => d.restaurantId === r.id);
  return { pratos: pratos.length, modelos3d: pratos.filter(d => d.modelUrl).length, mesas: (r.mesas || []).length, equipa: (r.equipa || []).length };
}
function exigirLimite(r, k, aMais = 1) {
  const max = planoDe(r).limites[k] ?? 0;
  if (usoDe(r)[k] + aMais > max) throw new HttpError(403, max ? `O plano ${planoDe(r).nome} permite até ${max} (${LIMITES[k].toLowerCase()}). Fala com a equipa Kuvê para mudar de plano.` : `${LIMITES[k]} não está incluído no plano ${planoDe(r).nome}.`);
}

// ---------- mesas ----------
const novasMesas = n => Array.from({ length: Math.max(0, Math.min(200, n)) }, (_, i) => ({ id: store.id(8), nome: String(i + 1), codigo: crypto.randomBytes(8).toString('base64url').slice(0, 10), ativa: true, criadaEm: now(), libertadaEm: '' }));
const mesaPorCodigo = (r, codigo) => (r.mesas || []).find(m => m.ativa !== false && m.codigo === codigo);
function estadoMesa(r, m) {
  const desde = m.libertadaEm || '';
  const pedidos = db.orders.filter(o => o.restaurantId === r.id && o.mesaId === m.id && o.createdAt > desde && o.status !== 'cancelado');
  const abertos = pedidos.filter(o => ABERTOS.includes(o.status));
  const porPagar = pedidos.filter(o => o.pagamento?.estado !== 'pago').reduce((s, o) => s + o.total, 0);
  const estado = !pedidos.length ? 'livre' : abertos.some(o => o.status === 'recebido' || o.status === 'confirmado') ? 'pendente' : 'ocupada';
  return { id: m.id, nome: m.nome, ativa: m.ativa !== false, estado, pedidos: pedidos.length, abertos: abertos.length, porPagar, desde: pedidos[0]?.createdAt || '' };
}

function exigirAtivo(r) {
  if (r.estado === 'suspenso') throw new HttpError(403, 'Este menu está temporariamente indisponível.');
}

// Estatísticas agregadas por restaurante e por dia (sem dados pessoais dos clientes)
const FUSO = process.env.FUSO || 'Africa/Luanda';
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: FUSO });   // AAAA-MM-DD no fuso do restaurante
const esgotado = d => d.esgotadoEm === hoje();
function registar(rid, campo, n = 1) {
  const dia = (db.stats[rid] ||= {})[hoje()] ||= {};
  dia[campo] = (dia[campo] || 0) + n;
  store.save();
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

const str = (v, max = 500) => (v == null ? '' : String(v).slice(0, max).trim());
const num = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);

// ---------- uploads ----------
const ALLOWED = {
  model: ['.glb', '.usdz'],
  image: ['.png', '.jpg', '.jpeg', '.webp'],
  target: ['.mind'],
};
const LIMITS = { model: 60, image: 12, target: 20 }; // MB

function uploader(kind) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const dir = path.join(UPLOAD_DIR, req.uploadScope || 'misc');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: LIMITS[kind] * 1024 * 1024, files: 8 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED[kind].includes(ext)) {
        return cb(new HttpError(400, `Tipo de ficheiro não suportado (${ext || 'sem extensão'}). Aceites: ${ALLOWED[kind].join(', ')}`));
      }
      cb(null, true);
    },
  });
}
const fileUrl = f => '/uploads/' + path.relative(UPLOAD_DIR, f.path).split(path.sep).join('/');

// ---------- restaurantes ----------
app.post('/api/restaurants', wrap(async (req, res) => {
  const name = str(req.body.name, 80);
  if (!name) throw new HttpError(400, 'Indica o nome do restaurante.');
  let slug = slugify(name);
  while (db.restaurants.some(r => r.slug === slug)) slug = `${slugify(name)}-${store.id(4).toLowerCase()}`;
  const adminKey = crypto.randomBytes(18).toString('base64url');
  const r = {
    id: store.id(), slug, name,
    tagline: str(req.body.tagline, 120),
    whatsapp: str(req.body.whatsapp, 20).replace(/[^\d]/g, ''),
    currency: str(req.body.currency, 6) || 'Kz',
    color: /^#[0-9a-f]{6}$/i.test(req.body.color || '') ? req.body.color : '#C8322B',
    logoUrl: '',
    tables: Math.min(200, Math.max(1, num(req.body.tables, 10))),
    categories: ['Entradas', 'Pratos principais', 'Sobremesas', 'Bebidas'],
    print: { imageUrl: '', mindUrl: '', width: 0, height: 0, hotspots: [] },
    estado: 'ativo',
    plano: 'teste',
    pagoAte: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    notas: '',
    contacto: '',
    adminKeyHash: sha(adminKey),
    createdAt: now(),
  };
  r.mesas = novasMesas(r.tables);
  db.restaurants.push(r);
  store.save();
  res.status(201).json({ restaurant: publicRestaurant(r), adminKey });
}));

// Menu público (só pratos visíveis)
app.get('/api/menu/:slug', wrap(async (req, res) => {
  const r = findRestaurant(req.params.slug);
  exigirAtivo(r);
  const dishes = db.dishes
    .filter(d => d.restaurantId === r.id && d.visible !== false)
    .sort((a, b) => a.order - b.order)
    .map(d => ({ ...d, esgotado: esgotado(d) }));
  const mesa = req.query.m ? mesaPorCodigo(r, str(req.query.m, 20)) : null;
  res.json({ restaurant: publicRestaurant(r), dishes, mesa: mesa ? { nome: mesa.nome } : null });
}));

// Vista de administração (inclui pratos ocultos)
app.get('/api/admin/:id', wrap(async (req, res) => {
  const r = findRestaurant(req.params.id);
  requireAdmin(req, r);
  const dishes = db.dishes.filter(d => d.restaurantId === r.id).sort((a, b) => a.order - b.order)
    .map(d => ({ ...d, esgotado: esgotado(d) }));
  res.json({ restaurant: publicRestaurant(r), dishes, mesas: r.mesas || [], plano: { ...planoDe(r), pagoAte: r.pagoAte || '', estado: r.estado || 'ativo', uso: usoDe(r) } });
}));

app.put('/api/restaurants/:id', wrap(async (req, res) => {
  const r = findRestaurant(req.params.id);
  requireAdmin(req, r);
  const b = req.body;
  if (b.name !== undefined) r.name = str(b.name, 80) || r.name;
  if (b.tagline !== undefined) r.tagline = str(b.tagline, 120);
  if (b.whatsapp !== undefined) r.whatsapp = str(b.whatsapp, 20).replace(/[^\d]/g, '');
  if (b.currency !== undefined) r.currency = str(b.currency, 6) || 'Kz';
  if (b.color !== undefined && /^#[0-9a-f]{6}$/i.test(b.color) && b.color.toUpperCase() !== (r.color || '').toUpperCase()) {
    const plataforma = (req.get('x-admin-key') || '').startsWith('plat:');
    if (r.identidadeBloqueada && !plataforma) throw new HttpError(403, 'A identidade deste menu é gerida pela plataforma Kuvê.');
    r.color = b.color;
    if (r.tema) r.tema.cores.acento = b.color.toUpperCase();
  }
  if (b.logoUrl !== undefined) r.logoUrl = str(b.logoUrl, 300);
  if (b.tables !== undefined) r.tables = Math.min(200, Math.max(1, num(b.tables, r.tables)));
  if (Array.isArray(b.categories)) r.categories = b.categories.map(c => str(c, 40)).filter(Boolean).slice(0, 30);
  if (b.print && typeof b.print === 'object') {
    const p = b.print;
    r.print = {
      imageUrl: str(p.imageUrl ?? r.print.imageUrl, 300),
      mindUrl: str(p.mindUrl ?? r.print.mindUrl, 300),
      width: num(p.width, r.print.width),
      height: num(p.height, r.print.height),
      hotspots: Array.isArray(p.hotspots)
        ? p.hotspots.slice(0, 40).map(h => ({
            dishId: str(h.dishId, 20),
            x: Math.min(1, Math.max(0, num(h.x))),
            y: Math.min(1, Math.max(0, num(h.y))),
          }))
        : (r.print.hotspots || []),
      scene: Array.isArray(p.scene) ? limparCena(p.scene) : (r.print.scene || null),
    };
  }
  store.save();
  res.json({ restaurant: publicRestaurant(r) });
}));

// Cena do menu impresso: itens livres colocados sobre o papel
const limite = (v, a, b, d) => Math.min(b, Math.max(a, num(v, d)));
function limparCena(itens) {
  return itens.slice(0, 40).map(i => {
    const tipo = ['prato', 'imagem', 'texto'].includes(i.tipo) ? i.tipo : 'prato';
    return {
      id: str(i.id, 20) || crypto.randomBytes(5).toString('hex'),
      tipo,
      dishId: tipo === 'prato' ? str(i.dishId, 20) : '',
      url: tipo === 'imagem' ? str(i.url, 300) : '',
      texto: tipo === 'texto' ? str(i.texto, 60) : '',
      fundo: /^#[0-9a-f]{6}$/i.test(i.fundo || '') ? i.fundo : '#1E2522',
      x: limite(i.x, 0, 1, 0.5),
      y: limite(i.y, 0, 1, 0.5),
      tamanho: limite(i.tamanho, 0.03, 0.9, 0.3),
      rotacao: limite(i.rotacao, -360, 360, 0),
      altura: limite(i.altura, 0, 0.5, 0),
      deitado: Boolean(i.deitado),
      quando: i.quando === 'toque' ? 'toque' : 'sempre',
      animacao: ['nenhuma', 'girar', 'pulsar', 'salto'].includes(i.animacao) ? i.animacao : 'nenhuma',
    };
  }).filter(i => (i.tipo !== 'prato' || i.dishId) && (i.tipo !== 'imagem' || i.url) && (i.tipo !== 'texto' || i.texto));
}

// ---------- uploads ----------
app.post('/api/restaurants/:id/upload/:kind', (req, res, next) => {
  try {
    const r = findRestaurant(req.params.id);
    requireAdmin(req, r);
    const kind = req.params.kind;
    if (!ALLOWED[kind]) throw new HttpError(400, 'Tipo de upload desconhecido.');
    if (kind === 'target') exigirFuncionalidade(r, 'impresso');
    req.uploadScope = r.id;
    uploader(kind).single('file')(req, res, err => {
      if (err) return next(err.code === 'LIMIT_FILE_SIZE' ? new HttpError(413, `Ficheiro maior que ${LIMITS[kind]} MB.`) : err);
      if (!req.file) return next(new HttpError(400, 'Nenhum ficheiro recebido.'));
      res.status(201).json({ url: fileUrl(req.file), bytes: req.file.size });
    });
  } catch (e) { next(e); }
});

// ---------- pratos ----------
const DISH_FIELDS = ['name', 'category', 'price', 'description', 'ingredients', 'allergens', 'calories',
  'variants', 'photos', 'modelUrl', 'iosModelUrl', 'posterUrl', 'realSizeCm', 'visible', 'order', 'animation'];

function cleanDish(input, base = {}) {
  const d = { ...base, ...pick(input, DISH_FIELDS) };
  d.name = str(d.name, 80);
  d.category = str(d.category, 40);
  d.price = Math.max(0, num(d.price));
  d.description = str(d.description, 600);
  d.ingredients = str(d.ingredients, 400);
  d.allergens = Array.isArray(d.allergens) ? d.allergens.map(a => str(a, 30)).filter(Boolean).slice(0, 14) : [];
  d.calories = d.calories === '' || d.calories == null ? null : Math.max(0, num(d.calories));
  d.variants = Array.isArray(d.variants)
    ? d.variants.slice(0, 12).map(v => ({ name: str(v.name, 40), price: Math.max(0, num(v.price)) })).filter(v => v.name)
    : [];
  d.photos = Array.isArray(d.photos) ? d.photos.map(p => str(p, 300)).filter(Boolean).slice(0, 8) : [];
  d.modelUrl = str(d.modelUrl, 300);
  d.iosModelUrl = str(d.iosModelUrl, 300);
  d.posterUrl = str(d.posterUrl, 300);
  d.realSizeCm = d.realSizeCm == null || d.realSizeCm === '' ? null : Math.min(200, Math.max(1, num(d.realSizeCm)));
  d.visible = d.visible !== false;
  d.order = num(d.order, 0);
  d.animation = ['none', 'spin', 'pop'].includes(d.animation) ? d.animation : 'spin';
  return d;
}

app.post('/api/restaurants/:id/dishes', wrap(async (req, res) => {
  const r = findRestaurant(req.params.id);
  requireAdmin(req, r);
  const d = cleanDish(req.body);
  if (!d.name) throw new HttpError(400, 'Indica o nome do prato.');
  exigirLimite(r, 'pratos');
  if (d.modelUrl) exigirLimite(r, 'modelos3d');
  d.id = store.id();
  d.restaurantId = r.id;
  d.order = d.order || db.dishes.filter(x => x.restaurantId === r.id).length + 1;
  d.createdAt = now();
  db.dishes.push(d);
  store.save();
  res.status(201).json({ dish: d });
}));

function findDishAdmin(req) {
  const d = db.dishes.find(x => x.id === req.params.dishId);
  if (!d) throw new HttpError(404, 'Prato não encontrado.');
  const r = findRestaurant(d.restaurantId);
  requireAdmin(req, r);
  return { d, r };
}

app.put('/api/dishes/:dishId', wrap(async (req, res) => {
  const { d, r } = findDishAdmin(req);
  const novo = cleanDish(req.body, d);
  if (novo.modelUrl && !d.modelUrl) exigirLimite(r, 'modelos3d');
  Object.assign(d, novo, { updatedAt: now() });
  store.save();
  res.json({ dish: { ...d, esgotado: esgotado(d) } });
}));

app.delete('/api/dishes/:dishId', wrap(async (req, res) => {
  const { d, r } = findDishAdmin(req);
  db.dishes.splice(db.dishes.indexOf(d), 1);
  r.print.hotspots = (r.print.hotspots || []).filter(h => h.dishId !== d.id);
  if (Array.isArray(r.print.scene)) r.print.scene = r.print.scene.filter(i => i.dishId !== d.id);
  store.save();
  res.json({ ok: true });
}));

// ---------- pedidos ----------
app.post('/api/menu/:slug/orders', wrap(async (req, res) => {
  const r = findRestaurant(req.params.slug);
  exigirAtivo(r);
  exigirFuncionalidade(r, 'pedidos');
  // o mesmo envio repetido (duplo toque, rede lenta) devolve o pedido já criado
  const chave = str(req.body.chave, 40);
  if (chave) {
    const ja = db.orders.find(o => o.restaurantId === r.id && o.chave === chave && Date.now() - Date.parse(o.createdAt) < 24 * 3600e3);
    if (ja) return res.status(200).json({ order: pedidoParaCliente(ja), acompanhar: urlAcompanhar(r, ja), whatsappUrl: '', repetido: true });
  }
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 50) : [];
  if (!items.length) throw new HttpError(400, 'O pedido está vazio.');
  const horario = temaDe(r).horario;
  if (horario.ativo && !horario.pedidosFora) {
    const h = estadoHorario(horario, new Date(), FUSO);
    if (!h.aberto) throw new HttpError(400, h.abre ? `Estamos fechados. Os pedidos abrem ${h.quando} às ${h.abre}.` : 'Estamos fechados de momento.');
  }
  const lines = items.map(it => {
    const d = db.dishes.find(x => x.id === it.dishId && x.restaurantId === r.id && x.visible !== false);
    if (!d) throw new HttpError(400, 'Um dos pratos já não está disponível. Atualiza o menu.');
    if (esgotado(d)) throw new HttpError(400, `${d.name} esgotou por hoje. Retira-o do pedido.`);
    const variant = it.variant ? d.variants.find(v => v.name === it.variant) : null;
    const qty = Math.min(50, Math.max(1, Math.round(num(it.qty, 1))));
    const unit = variant ? variant.price : d.price; // preço vem sempre do servidor
    return { dishId: d.id, name: d.name, variant: variant ? variant.name : '', qty, unit, subtotal: unit * qty };
  });
  // mesa: pelo código secreto do QR; o número escrito no link só vale se o restaurante não tiver mesas configuradas
  const mesa = req.body.mesaCodigo ? mesaPorCodigo(r, str(req.body.mesaCodigo, 20)) : null;
  if (req.body.mesaCodigo && !mesa) throw new HttpError(400, 'Este QR já não corresponde a uma mesa. Pede ajuda à equipa.');
  const order = {
    id: store.id(10),
    number: db.orders.filter(o => o.restaurantId === r.id).length + 1,
    restaurantId: r.id,
    chave,
    segredo: crypto.randomBytes(12).toString('base64url'),
    mesaId: mesa ? mesa.id : '',
    table: mesa ? mesa.nome : str(req.body.table, 10),
    mesaVerificada: Boolean(mesa),
    pagamento: { estado: 'por_pagar' },
    customerName: str(req.body.customerName, 60),
    note: str(req.body.note, 300),
    items: lines,
    total: lines.reduce((s, l) => s + l.subtotal, 0),
    status: 'recebido',
    createdAt: now(),
    historico: [{ estado: 'recebido', por: 'Cliente', em: now() }],
  };
  db.orders.push(order);
  registar(r.id, 'pedidos');
  registar(r.id, 'receita', order.total);
  store.save();

  const fmt = n => `${n.toLocaleString('pt-PT')} ${r.currency}`;
  const text = [
    `Pedido #${order.number}${order.table ? ` · Mesa ${order.table}` : ''}`,
    ...lines.map(l => `${l.qty}× ${l.name}${l.variant ? ` (${l.variant})` : ''} — ${fmt(l.subtotal)}`),
    `Total: ${fmt(order.total)}`,
    order.customerName ? `Nome: ${order.customerName}` : '',
    order.note ? `Nota: ${order.note}` : '',
  ].filter(Boolean).join('\n');
  const whatsappUrl = r.whatsapp ? `https://wa.me/${r.whatsapp}?text=${encodeURIComponent(text + `\nAcompanhar: ${PUBLIC_URL}${urlAcompanhar(r, order)}`)}` : '';
  res.status(201).json({ order: pedidoParaCliente(order), acompanhar: urlAcompanhar(r, order), whatsappUrl });
}));

// O cliente acompanha o pedido com um link secreto (sem conta)
const urlAcompanhar = (r, o) => `/m/${r.slug}/pedido/${o.id}?t=${o.segredo}`;
const pedidoParaCliente = o => ({
  id: o.id, number: o.number, table: o.table, items: o.items, total: o.total, note: o.note, customerName: o.customerName,
  status: o.status, rotulo: ROTULO_ESTADO[o.status], createdAt: o.createdAt, pago: o.pagamento?.estado === 'pago',
  linhaTempo: (o.historico || []).map(h => ({ estado: h.estado, rotulo: ROTULO_ESTADO[h.estado] || h.estado, em: h.em })),
});
app.get('/api/pedido/:orderId', wrap(async (req, res) => {
  const o = db.orders.find(x => x.id === req.params.orderId);
  if (!o || !o.segredo || str(req.query.t, 40) !== o.segredo) throw new HttpError(404, 'Pedido não encontrado.');
  const r = findRestaurant(o.restaurantId);
  res.set('Cache-Control', 'no-store').json({ order: pedidoParaCliente(o), restaurante: { nome: r.name, slug: r.slug, moeda: r.currency, logoUrl: r.logoUrl, tema: temaDe(r) } });
}));

// Eventos anónimos do menu do cliente (para o painel da plataforma)
const EVENTOS = { visita: 'visitas', prato: 'pratosVistos', ar: 'ar', impresso: 'impresso' };
app.post('/api/menu/:slug/evento', wrap(async (req, res) => {
  const r = db.restaurants.find(x => x.slug === req.params.slug);
  const campo = EVENTOS[req.body?.tipo];
  if (r && campo) {
    registar(r.id, campo);
    // por prato (para o painel do gerente): vistos e aberturas em AR
    const d = req.body.dishId && db.dishes.find(x => x.id === req.body.dishId && x.restaurantId === r.id);
    if (d && (campo === 'pratosVistos' || campo === 'ar')) {
      const dia = db.stats[r.id][hoje()];
      const k = campo === 'ar' ? 'arPrato' : 'vistoPrato';
      (dia[k] ||= {})[d.id] = (dia[k][d.id] || 0) + 1;
    }
  }
  res.status(204).end();
}));

app.get('/api/restaurants/:id/orders', wrap(async (req, res) => {
  const r = findRestaurant(req.params.id);
  requirePermissao(req, r, 'pedidos');
  const since = Date.now() - 36 * 3600 * 1000;
  const orders = db.orders
    .filter(o => o.restaurantId === r.id && Date.parse(o.createdAt) > since)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ segredo, chave, ...o }) => ({ ...o, rotulo: ROTULO_ESTADO[o.status] }));
  res.json({ orders, estados: ROTULO_ESTADO });
}));

app.patch('/api/orders/:orderId', wrap(async (req, res) => {
  const o = db.orders.find(x => x.id === req.params.orderId);
  if (!o) throw new HttpError(404, 'Pedido não encontrado.');
  const r = findRestaurant(o.restaurantId);
  const para = req.body.status;
  const quem = requirePermissao(req, r, para === 'cancelado' ? 'cancelar' : 'pedidos');
  if (!ESTADOS.includes(para)) throw new HttpError(400, 'Estado inválido.');
  if (!podeMudar(o.status, para)) throw new HttpError(409, `Um pedido "${ROTULO_ESTADO[o.status]}" não pode passar a "${ROTULO_ESTADO[para]}".`);
  if (para === 'cancelado' && o.pagamento?.estado === 'pago') throw new HttpError(409, 'Este pedido já foi pago. Anula o pagamento antes de cancelar.');
  o.status = para;
  o.updatedAt = now();
  (o.historico ||= []).push({ estado: o.status, por: quem.nome, em: now() });
  store.save();
  const { segredo, chave, ...pub } = o;
  res.json({ order: { ...pub, rotulo: ROTULO_ESTADO[o.status] } });
}));

// ---------- pagamentos (registo manual de quem recebeu; não é faturação) ----------
app.post('/api/orders/:orderId/pagamento', wrap(async (req, res) => {
  const o = db.orders.find(x => x.id === req.params.orderId);
  if (!o) throw new HttpError(404, 'Pedido não encontrado.');
  const r = findRestaurant(o.restaurantId);
  exigirFuncionalidade(r, 'pagamentos');
  const quem = requirePermissao(req, r, 'pagamentos');
  if (o.status === 'cancelado') throw new HttpError(409, 'Não se regista pagamento num pedido cancelado.');
  if (o.pagamento?.estado === 'pago') throw new HttpError(409, 'Este pedido já está pago.');
  if (!Object.hasOwn(METODOS, req.body.metodo)) throw new HttpError(400, 'Escolhe como foi pago.');
  o.pagamento = { estado: 'pago', metodo: req.body.metodo, valor: o.total, em: now(), por: quem.nome };
  registar(r.id, 'pago', o.total);
  store.save();
  res.json({ pagamento: o.pagamento });
}));
app.delete('/api/orders/:orderId/pagamento', wrap(async (req, res) => {
  const o = db.orders.find(x => x.id === req.params.orderId);
  if (!o) throw new HttpError(404, 'Pedido não encontrado.');
  const r = findRestaurant(o.restaurantId);
  requireAdmin(req, r); // anular um pagamento é só para o gerente
  if (o.pagamento?.estado !== 'pago') throw new HttpError(409, 'Este pedido não está pago.');
  registar(r.id, 'pago', -o.pagamento.valor);
  (o.pagamentosAnulados ||= []).push({ ...o.pagamento, anuladoEm: now() });
  o.pagamento = { estado: 'por_pagar' };
  store.save();
  res.json({ pagamento: o.pagamento });
}));

// ---------- mesas ----------
app.get('/api/restaurants/:id/mesas', wrap(async (req, res) => {
  const r = findRestaurant(req.params.id);
  const quem = requirePermissao(req, r, 'mesas');
  const lista = (r.mesas || []).map(m => ({ ...estadoMesa(r, m), ...(quem.papel === 'gerente' ? { codigo: m.codigo } : {}) }));
  res.json({ mesas: lista });
}));
app.post('/api/restaurants/:id/mesas', wrap(async (req, res) => {
  const r = findRestaurant(req.params.id);
  requireAdmin(req, r);
  exigirFuncionalidade(r, 'mesas');
  const nomes = (Array.isArray(req.body.nomes) ? req.body.nomes : [req.body.nome]).map(n => str(n, 20)).filter(Boolean);
  if (!nomes.length) throw new HttpError(400, 'Indica o nome ou número da mesa.');
  exigirLimite(r, 'mesas', nomes.length);
  const criadas = [];
  for (const nome of nomes) {
    if ((r.mesas || []).some(m => m.nome.toLowerCase() === nome.toLowerCase())) continue;
    const m = { id: store.id(8), nome, codigo: crypto.randomBytes(8).toString('base64url').slice(0, 10), ativa: true, criadaEm: now(), libertadaEm: '' };
    (r.mesas ||= []).push(m); criadas.push(m);
  }
  r.tables = r.mesas.length;
  store.save();
  res.status(201).json({ mesas: r.mesas, criadas: criadas.length });
}));
app.patch('/api/restaurants/:id/mesas/:mesaId', wrap(async (req, res) => {
  const r = findRestaurant(req.params.id);
  requireAdmin(req, r);
  const m = (r.mesas || []).find(x => x.id === req.params.mesaId);
  if (!m) throw new HttpError(404, 'Mesa não encontrada.');
  if (req.body.nome !== undefined) {
    const nome = str(req.body.nome, 20);
    if (!nome) throw new HttpError(400, 'A mesa precisa de um nome.');
    if (r.mesas.some(x => x !== m && x.nome.toLowerCase() === nome.toLowerCase())) throw new HttpError(409, 'Já existe uma mesa com esse nome.');
    m.nome = nome;
  }
  if (req.body.ativa !== undefined) m.ativa = Boolean(req.body.ativa);
  if (req.body.novoCodigo) m.codigo = crypto.randomBytes(8).toString('base64url').slice(0, 10); // o QR antigo deixa de funcionar
  store.save();
  res.json({ mesa: m });
}));
app.delete('/api/restaurants/:id/mesas/:mesaId', wrap(async (req, res) => {
  const r = findRestaurant(req.params.id);
  requireAdmin(req, r);
  const m = (r.mesas || []).find(x => x.id === req.params.mesaId);
  if (!m) throw new HttpError(404, 'Mesa não encontrada.');
  if (estadoMesa(r, m).abertos) throw new HttpError(409, 'Esta mesa tem pedidos em curso. Termina-os antes de a apagar.');
  r.mesas = r.mesas.filter(x => x !== m);
  r.tables = r.mesas.length;
  store.save();
  res.json({ ok: true });
}));
// Fim do serviço: a mesa volta a ficar livre para os próximos clientes
app.post('/api/restaurants/:id/mesas/:mesaId/libertar', wrap(async (req, res) => {
  const r = findRestaurant(req.params.id);
  const quem = requirePermissao(req, r, 'mesas');
  const m = (r.mesas || []).find(x => x.id === req.params.mesaId);
  if (!m) throw new HttpError(404, 'Mesa não encontrada.');
  const e = estadoMesa(r, m);
  if (!req.body?.mesmoAssim && (e.abertos || e.porPagar)) {
    throw new HttpError(409, e.abertos ? `A mesa tem ${e.abertos} pedido(s) por entregar.` : `A mesa tem ${e.porPagar.toLocaleString('pt-PT')} ${r.currency} por pagar.`);
  }
  m.libertadaEm = now();
  m.libertadaPor = quem.nome;
  store.save();
  res.json({ mesa: estadoMesa(r, m) });
}));

// ---------- equipa (PINs) ----------
const FUNCOES = ['rececao', 'cozinha', 'empregado'];
const pinHash = (rid, pin) => sha(`${rid}:${pin}`);
const membroPublico = m => ({ id: m.id, nome: m.nome, funcao: m.funcao, permissoes: permissoesDe(m), ativo: m.ativo !== false, criadoEm: m.criadoEm, ultimaEntrada: m.ultimaEntrada || '' });
const limparPermissoes = l => (Array.isArray(l) ? [...new Set(l.filter(p => Object.hasOwn(PERMISSOES, p)))] : undefined);

function novoPin(r) {
  for (;;) {
    const pin = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    if (!(r.equipa || []).some(m => m.pinHash === pinHash(r.id, pin))) return pin;
  }
}

function terminarSessoes(rid, membroId) {
  for (const [k, s] of Object.entries(db.sessoes)) if (s.rid === rid && (!membroId || s.membroId === membroId)) delete db.sessoes[k];
}

app.get('/api/restaurants/:id/equipa', wrap(async (req, res) => {
  const r = findRestaurant(req.params.id);
  requireAdmin(req, r);
  res.json({ equipa: (r.equipa || []).map(membroPublico), permissoes: PERMISSOES, porFuncao: PERMISSOES_DA_FUNCAO });
}));

app.post('/api/restaurants/:id/equipa', wrap(async (req, res) => {
  const r = findRestaurant(req.params.id);
  requireAdmin(req, r);
  const nome = str(req.body.nome, 40);
  if (!nome) throw new HttpError(400, 'Indica o nome do funcionário.');
  exigirFuncionalidade(r, 'equipa');
  exigirLimite(r, 'equipa');
  const pin = novoPin(r);
  const funcao = FUNCOES.includes(req.body.funcao) ? req.body.funcao : 'rececao';
  const m = { id: store.id(8), nome, funcao, permissoes: limparPermissoes(req.body.permissoes) || PERMISSOES_DA_FUNCAO[funcao], pinHash: pinHash(r.id, pin), ativo: true, criadoEm: now() };
  (r.equipa ||= []).push(m);
  store.save();
  res.status(201).json({ membro: membroPublico(m), pin });
}));

app.patch('/api/restaurants/:id/equipa/:membroId', wrap(async (req, res) => {
  const r = findRestaurant(req.params.id);
  requireAdmin(req, r);
  const m = (r.equipa || []).find(x => x.id === req.params.membroId);
  if (!m) throw new HttpError(404, 'Funcionário não encontrado.');
  if (req.body.nome !== undefined) m.nome = str(req.body.nome, 40) || m.nome;
  if (FUNCOES.includes(req.body.funcao)) m.funcao = req.body.funcao;
  if (limparPermissoes(req.body.permissoes)) m.permissoes = limparPermissoes(req.body.permissoes);
  if (req.body.ativo !== undefined) { m.ativo = Boolean(req.body.ativo); if (!m.ativo) terminarSessoes(r.id, m.id); }
  store.save();
  res.json({ membro: membroPublico(m) });
}));

app.post('/api/restaurants/:id/equipa/:membroId/novo-pin', wrap(async (req, res) => {
  const r = findRestaurant(req.params.id);
  requireAdmin(req, r);
  const m = (r.equipa || []).find(x => x.id === req.params.membroId);
  if (!m) throw new HttpError(404, 'Funcionário não encontrado.');
  const pin = novoPin(r);
  m.pinHash = pinHash(r.id, pin);
  terminarSessoes(r.id, m.id);
  store.save();
  res.json({ pin });
}));

app.delete('/api/restaurants/:id/equipa/:membroId', wrap(async (req, res) => {
  const r = findRestaurant(req.params.id);
  requireAdmin(req, r);
  r.equipa = (r.equipa || []).filter(x => x.id !== req.params.membroId);
  terminarSessoes(r.id, req.params.membroId);
  store.save();
  res.json({ ok: true });
}));

// Entrada da equipa com PIN — com limite de tentativas por aparelho e restaurante
const tentativas = new Map();
app.post('/api/equipa/entrar', wrap(async (req, res) => {
  const codigo = str(req.body.codigo, 60).toLowerCase();
  const r = db.restaurants.find(x => x.slug === codigo || x.id === str(req.body.codigo, 60));
  const chaveT = `${req.ip}|${codigo}`;
  const t = tentativas.get(chaveT) || { n: 0, desde: Date.now() };
  if (Date.now() - t.desde > 10 * 60_000) { t.n = 0; t.desde = Date.now(); }
  if (t.n >= 8) throw new HttpError(429, 'Demasiadas tentativas. Espera 10 minutos ou pede ajuda ao gerente.');
  const pin = str(req.body.pin, 6);
  const m = r && /^\d{6}$/.test(pin) && (r.equipa || []).find(x => x.ativo !== false && x.pinHash === pinHash(r.id, pin));
  if (!m) {
    t.n += 1; tentativas.set(chaveT, t);
    throw new HttpError(401, r ? 'PIN errado.' : 'Código do restaurante não encontrado.');
  }
  tentativas.delete(chaveT);
  const token = crypto.randomBytes(24).toString('base64url');
  db.sessoes[sha(token)] = { rid: r.id, membroId: m.id, expira: new Date(Date.now() + DURACAO_SESSAO).toISOString() };
  m.ultimaEntrada = now();
  store.save();
  res.json({
    token,
    membro: { nome: m.nome, funcao: m.funcao, permissoes: permissoesDe(m) },
    funcionalidades: planoDe(r).funcionalidades,
    restaurante: { id: r.id, slug: r.slug, nome: r.name, cor: r.color, logoUrl: r.logoUrl, moeda: r.currency },
  });
}));

app.get('/api/equipa/:id/pratos', wrap(async (req, res) => {
  const r = findRestaurant(req.params.id);
  const quem = requireEquipa(req, r);
  const pratos = db.dishes.filter(d => d.restaurantId === r.id && d.visible !== false).sort((a, b) => a.order - b.order)
    .map(d => ({ id: d.id, nome: d.name, categoria: d.category, posterUrl: d.posterUrl || d.photos?.[0] || '', esgotado: esgotado(d) }));
  res.json({ pratos, quem });
}));

// Esgotado só vale para o dia de hoje: amanhã o prato volta sozinho
app.put('/api/dishes/:dishId/esgotado', wrap(async (req, res) => {
  const d = db.dishes.find(x => x.id === req.params.dishId);
  if (!d) throw new HttpError(404, 'Prato não encontrado.');
  requirePermissao(req, findRestaurant(d.restaurantId), 'esgotados');
  d.esgotadoEm = req.body.esgotado ? hoje() : '';
  store.save();
  res.json({ esgotado: esgotado(d) });
}));

// ---------- painel do gerente ----------
const partes = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
const DIAS_SEMANA = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

app.get('/api/restaurants/:id/painel', wrap(async (req, res) => {
  const r = findRestaurant(req.params.id);
  requireAdmin(req, r);
  exigirFuncionalidade(r, 'painel');
  const n = [7, 30, 90].includes(Number(req.query.dias)) ? Number(req.query.dias) : 30;
  const dias = diasAtras(n);
  const antes = diasAtras(2 * n).slice(0, n);
  const st = db.stats[r.id] || {};
  const diaDe = iso => new Date(iso).toLocaleDateString('sv-SE', { timeZone: FUSO });
  const doRest = db.orders.filter(o => o.restaurantId === r.id && o.status !== 'cancelado');
  const noPeriodo = new Set(dias), noAntes = new Set(antes);
  const pedidos = doRest.filter(o => noPeriodo.has(diaDe(o.createdAt)));
  const pedidosAntes = doRest.filter(o => noAntes.has(diaDe(o.createdAt)));
  const soma = (lista, f) => lista.reduce((s, x) => s + f(x), 0);
  const somaStat = (ds, k) => ds.reduce((s, d) => s + (st[d]?.[k] || 0), 0);
  const cancelados = db.orders.filter(o => o.restaurantId === r.id && o.status === 'cancelado' && noPeriodo.has(diaDe(o.createdAt))).length;

  const pagos = p => p.filter(o => o.pagamento?.estado === 'pago');
  const resumo = p => ({
    vendas: soma(p, o => o.total), pedidos: p.length,
    pago: soma(pagos(p), o => o.pagamento.valor), pedidosPagos: pagos(p).length,
    porPagar: soma(p.filter(o => o.pagamento?.estado !== 'pago'), o => o.total),
    ticket: p.length ? Math.round(soma(p, o => o.total) / p.length) : 0,
  });
  const atual = resumo(pedidos), anterior = resumo(pedidosAntes);
  const visitas = somaStat(dias, 'visitas'), visitasAntes = somaStat(antes, 'visitas');

  // série diária
  const porDia = {};
  for (const o of pedidos) { const d = diaDe(o.createdAt); (porDia[d] ||= { vendas: 0, pedidos: 0, pago: 0 }); porDia[d].vendas += o.total; porDia[d].pedidos++; if (o.pagamento?.estado === 'pago') porDia[d].pago += o.pagamento.valor; }
  const serie = dias.map(d => ({ dia: d, vendas: porDia[d]?.vendas || 0, pago: porDia[d]?.pago || 0, pedidos: porDia[d]?.pedidos || 0, visitas: st[d]?.visitas || 0 }));
  const hojeD = hoje();
  const deHoje = doRest.filter(o => diaDe(o.createdAt) === hojeD);
  const metodos = {};
  for (const o of pagos(pedidos)) metodos[o.pagamento.metodo] = (metodos[o.pagamento.metodo] || 0) + o.pagamento.valor;

  // pratos: vendidos, vistos, aberturas em AR
  const pratosRest = db.dishes.filter(d => d.restaurantId === r.id);
  const linhas = new Map(pratosRest.map(d => [d.id, { id: d.id, nome: d.name, posterUrl: d.posterUrl || d.photos?.[0] || '', com3d: Boolean(d.modelUrl), qtd: 0, vendas: 0, vistos: 0, ar: 0 }]));
  for (const o of pedidos) for (const l of o.items) { const x = linhas.get(l.dishId); if (x) { x.qtd += l.qty; x.vendas += l.subtotal; } }
  for (const d of dias) {
    for (const [id, v] of Object.entries(st[d]?.vistoPrato || {})) if (linhas.has(id)) linhas.get(id).vistos += v;
    for (const [id, v] of Object.entries(st[d]?.arPrato || {})) if (linhas.has(id)) linhas.get(id).ar += v;
  }
  const lista = [...linhas.values()];

  // efeito do 3D: conversão (pedidos ÷ vistos) dos pratos com e sem modelo 3D
  const grupo = f => { const g = lista.filter(f); const v = soma(g, x => x.vistos), q = soma(g, x => x.qtd); return { pratos: g.length, vistos: v, pedidos: q, conversao: v ? q / v : null }; };

  // horas de movimento (dia da semana × hora), no fuso do restaurante
  const mapa = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const o of pedidos) {
    const p = Object.fromEntries(partes.formatToParts(new Date(o.createdAt)).map(x => [x.type, x.value]));
    mapa[DIAS_SEMANA[p.weekday]][Number(p.hour)]++;
  }

  // mesas
  const mesas = {};
  for (const o of pedidos) { const k = o.table || 'Balcão'; (mesas[k] ||= { mesa: k, pedidos: 0, vendas: 0 }); mesas[k].pedidos++; mesas[k].vendas += o.total; }

  res.json({
    dias: n, moeda: r.currency,
    atual: { ...atual, visitas, ar: somaStat(dias, 'ar') + somaStat(dias, 'impresso'), cancelados, conversao: visitas ? atual.pedidos / visitas : null },
    anterior: { ...anterior, visitas: visitasAntes, ar: somaStat(antes, 'ar') + somaStat(antes, 'impresso') },
    serie,
    maisVendidos: lista.filter(x => x.qtd).sort((a, b) => b.vendas - a.vendas).slice(0, 8),
    vistosPoucoPedidos: lista.filter(x => x.vistos >= 10).map(x => ({ ...x, conversao: x.qtd / x.vistos })).sort((a, b) => a.conversao - b.conversao).slice(0, 5),
    efeito3d: { com: grupo(x => x.com3d), sem: grupo(x => !x.com3d) },
    mapa,
    mesas: Object.values(mesas).sort((a, b) => b.vendas - a.vendas).slice(0, 8),
    hoje: { ...resumo(deHoje), pendentes: deHoje.filter(o => o.status === 'recebido' || o.status === 'confirmado').length, emCurso: deHoje.filter(o => ABERTOS.includes(o.status)).length },
    metodos: Object.entries(metodos).map(([k, v]) => ({ metodo: METODOS[k] || k, valor: v })),
    funcPagamentos: temFuncionalidade(r, 'pagamentos'),
  });
}));

// ---------- QR codes ----------
app.get('/api/menu/:slug/qr.svg', wrap(async (req, res) => {
  const r = findRestaurant(req.params.slug);
  const table = str(req.query.mesa, 10);
  const codigo = str(req.query.m, 20);
  const target = req.query.tipo === 'impresso' ? `${PUBLIC_URL}/p/${r.slug}`
    : codigo ? `${PUBLIC_URL}/m/${r.slug}?m=${encodeURIComponent(codigo)}`
    : `${PUBLIC_URL}/m/${r.slug}${table ? `?mesa=${encodeURIComponent(table)}` : ''}`;
  const svg = await QRCode.toString(target, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1C2321', light: '#FFFFFF' } });
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(svg);
}));

// ---------- IA: foto → 3D ----------
// O estúdio cria um trabalho; um worker com GPU (ai-worker/) recolhe-o, gera o GLB e devolve-o.
app.post('/api/restaurants/:id/ai-jobs', (req, res, next) => {
  try {
    const r = findRestaurant(req.params.id);
    requireAdmin(req, r);
    exigirFuncionalidade(r, 'ia3d');
    req.uploadScope = r.id;
    multer({
      storage: multer.diskStorage({
        destination: (rq, f, cb) => { const dir = path.join(UPLOAD_DIR, r.id, 'ai'); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
        filename: (rq, f, cb) => cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}${path.extname(f.originalname).toLowerCase()}`),
      }),
      limits: { fileSize: LIMITS.image * 1024 * 1024, files: 4 },
      fileFilter: (rq, f, cb) => ALLOWED.image.includes(path.extname(f.originalname).toLowerCase())
        ? cb(null, true) : cb(new HttpError(400, 'Usa fotos PNG, JPG ou WebP.')),
    }).array('photos', 4)(req, res, err => {
      if (err) return next(err);
      if (!req.files?.length) return next(new HttpError(400, 'Envia pelo menos uma foto do prato.'));
      const job = {
        id: store.id(),
        restaurantId: r.id,
        dishId: str(req.body.dishId, 20),
        quality: ['rapido', 'alto'].includes(req.body.quality) ? req.body.quality : 'alto',
        images: req.files.map(fileUrl),
        status: 'na fila',
        resultUrl: '',
        error: '',
        createdAt: now(),
      };
      db.aiJobs.push(job);
      store.save();
      res.status(201).json({ job, queuePosition: db.aiJobs.filter(j => j.status === 'na fila').length });
    });
  } catch (e) { next(e); }
});

app.get('/api/ai-jobs/:jobId', wrap(async (req, res) => {
  const job = db.aiJobs.find(j => j.id === req.params.jobId);
  if (!job) throw new HttpError(404, 'Trabalho não encontrado.');
  requireAdmin(req, findRestaurant(job.restaurantId));
  res.json({ job, workerConfigured: Boolean(WORKER_TOKEN) });
}));

// Worker: pede o próximo trabalho
app.post('/api/worker/next', wrap(async (req, res) => {
  requireWorker(req);
  db.workers[str(req.body?.worker, 60) || 'worker'] = now();
  const stale = Date.now() - JOB_TIMEOUT_MS;
  for (const j of db.aiJobs) {
    if (j.status === 'a gerar' && Date.parse(j.startedAt) < stale) { j.status = 'na fila'; j.attempts = (j.attempts || 0) + 1; }
  }
  const job = db.aiJobs.find(j => j.status === 'na fila' && (j.attempts || 0) < 3);
  if (!job) return res.status(204).end();
  job.status = 'a gerar';
  job.startedAt = now();
  job.worker = str(req.body?.worker, 60);
  store.save();
  res.json({ job: { ...job, images: job.images.map(u => PUBLIC_URL + u) } });
}));

// Worker: devolve o resultado (GLB) ou a falha
app.post('/api/worker/jobs/:jobId/result', (req, res, next) => {
  try {
    requireWorker(req);
    const job = db.aiJobs.find(j => j.id === req.params.jobId);
    if (!job) throw new HttpError(404, 'Trabalho não encontrado.');
    req.uploadScope = job.restaurantId;
    uploader('model').single('model')(req, res, err => {
      if (err) return next(err);
      if (req.file) {
        job.status = 'pronto';
        job.resultUrl = fileUrl(req.file);
      } else {
        job.status = 'falhou';
        job.error = str(req.body.error, 400) || 'O worker não devolveu modelo.';
      }
      job.finishedAt = now();
      store.save();
      res.json({ job });
    });
  } catch (e) { next(e); }
});

// ---------- painel da plataforma (equipa Kuvê) ----------
const planoExiste = id => planos().some(p => p.id === id);
const ESTADOS_CONTA = ['ativo', 'suspenso'];

function diasAtras(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.now() - i * 864e5).toLocaleDateString('sv-SE', { timeZone: FUSO }));
  return out;
}

function somaStats(rid, dias) {
  const s = db.stats[rid] || {};
  const t = { visitas: 0, pratosVistos: 0, ar: 0, impresso: 0, pedidos: 0, receita: 0, pago: 0 };
  for (const d of dias) for (const k in t) t[k] += s[d]?.[k] || 0;
  return t;
}

let cacheEspaco = { em: 0, valores: {} };
function espacoPorRestaurante() {
  if (Date.now() - cacheEspaco.em < 60_000) return cacheEspaco.valores;
  const valores = {};
  const tamanho = dir => {
    let t = 0;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      t += e.isDirectory() ? tamanho(p) : fs.statSync(p).size;
    }
    return t;
  };
  for (const r of db.restaurants) {
    const dir = path.join(UPLOAD_DIR, r.id);
    valores[r.id] = fs.existsSync(dir) ? tamanho(dir) : 0;
  }
  cacheEspaco = { em: Date.now(), valores };
  return valores;
}

function linhaRestaurante(r, dias30, espaco) {
  const pratos = db.dishes.filter(d => d.restaurantId === r.id);
  const ultimo = db.orders.filter(o => o.restaurantId === r.id).reduce((m, o) => (o.createdAt > m ? o.createdAt : m), '');
  const atividade = Object.keys(db.stats[r.id] || {}).sort().pop() || '';
  return {
    id: r.id, slug: r.slug, nome: r.name, logoUrl: r.logoUrl, cor: r.color, moeda: r.currency,
    whatsapp: r.whatsapp, contacto: r.contacto || '', notas: r.notas || '',
    estado: r.estado || 'ativo', plano: r.plano || 'teste', pagoAte: r.pagoAte || '',
    criadoEm: r.createdAt, mesas: (r.mesas || []).length,
    planoNome: planoDe(r).nome, precoMensal: planoDe(r).precoMensal, uso: usoDe(r), limites: planoDe(r).limites,
    pratos: pratos.length, pratos3d: pratos.filter(d => d.modelUrl).length,
    menuImpresso: Boolean(r.print?.mindUrl),
    ultimoPedido: ultimo, ultimaAtividade: atividade,
    espaco: espaco[r.id] || 0,
    tema: (t => ({ base: t.base, fundo: t.cores.fundo, texto: t.cores.texto, acento: t.cores.acento, destaque: t.cores.destaque, publicado: Boolean(r.tema), rascunho: Boolean(r.temaRascunho) }))(temaDe(r)),
    identidadeBloqueada: Boolean(r.identidadeBloqueada),
    ...somaStats(r.id, dias30),
  };
}

app.post('/api/plataforma/entrar', wrap(async (req, res) => {
  if (!chavePlataformaValida(str(req.body?.chave, 200))) throw new HttpError(401, 'Chave da plataforma inválida.');
  res.json({ ok: true });
}));

app.get('/api/plataforma/resumo', wrap(async (req, res) => {
  requirePlataforma(req);
  const dias30 = diasAtras(30);
  const dias60 = diasAtras(60).slice(0, 30);
  const espaco = espacoPorRestaurante();
  const restaurantes = db.restaurants.map(r => linhaRestaurante(r, dias30, espaco));
  const total = k => restaurantes.reduce((s, r) => s + r[k], 0);
  const anterior = k => db.restaurants.reduce((s, r) => s + somaStats(r.id, dias60)[k], 0);
  const serie = dias30.map(d => {
    const o = { dia: d, visitas: 0, ar: 0, pedidos: 0 };
    for (const r of db.restaurants) {
      const s = db.stats[r.id]?.[d];
      if (s) { o.visitas += s.visitas || 0; o.ar += (s.ar || 0) + (s.impresso || 0); o.pedidos += s.pedidos || 0; }
    }
    return o;
  });
  const hojeIso = hoje();
  const fila = db.aiJobs.slice(-40).reverse().map(j => ({
    id: j.id, restaurante: db.restaurants.find(r => r.id === j.restaurantId)?.name || '—',
    estado: j.status, qualidade: j.quality, fotos: j.images.length, erro: j.error,
    criadoEm: j.createdAt, terminadoEm: j.finishedAt || '', worker: j.worker || '',
  }));
  res.json({
    geradoEm: now(),
    planos: planos(),
    funcionalidades: FUNCIONALIDADES, limitesNomes: LIMITES,
    totais: {
      // receita mensal recorrente estimada: soma dos planos dos restaurantes ativos e com pagamento em dia
      mrr: restaurantes.filter(r => r.estado === 'ativo' && (!r.pagoAte || r.pagoAte >= hoje())).reduce((s, r) => s + r.precoMensal, 0),
      restaurantes: restaurantes.length,
      ativos: restaurantes.filter(r => r.estado === 'ativo').length,
      suspensos: restaurantes.filter(r => r.estado === 'suspenso').length,
      emAtraso: restaurantes.filter(r => r.estado === 'ativo' && r.plano !== 'gratis' && r.pagoAte && r.pagoAte < hojeIso).length,
      pratos: total('pratos'), pratos3d: total('pratos3d'),
      visitas: total('visitas'), visitasAntes: anterior('visitas'),
      ar: total('ar') + total('impresso'), arAntes: anterior('ar') + anterior('impresso'),
      pedidos: total('pedidos'), pedidosAntes: anterior('pedidos'),
      espaco: total('espaco'),
      receitaPorMoeda: restaurantes.reduce((m, r) => { m[r.moeda] = (m[r.moeda] || 0) + r.receita; return m; }, {}),
    },
    serie,
    restaurantes,
    ia: {
      workerConfigurado: Boolean(WORKER_TOKEN),
      workers: Object.entries(db.workers).map(([nome, visto]) => ({ nome, visto })).sort((a, b) => b.visto.localeCompare(a.visto)),
      naFila: db.aiJobs.filter(j => j.status === 'na fila').length,
      aGerar: db.aiJobs.filter(j => j.status === 'a gerar').length,
      prontos: db.aiJobs.filter(j => j.status === 'pronto').length,
      falhados: db.aiJobs.filter(j => j.status === 'falhou').length,
      fila,
    },
  });
}));

app.post('/api/plataforma/restaurantes', wrap(async (req, res) => {
  requirePlataforma(req);
  const name = str(req.body.name, 80);
  if (!name) throw new HttpError(400, 'Indica o nome do restaurante.');
  let slug = slugify(name);
  while (db.restaurants.some(r => r.slug === slug)) slug = `${slugify(name)}-${store.id(4).toLowerCase()}`;
  const adminKey = crypto.randomBytes(18).toString('base64url');
  const r = {
    id: store.id(), slug, name, tagline: '',
    whatsapp: str(req.body.whatsapp, 20).replace(/[^\d]/g, ''), currency: 'Kz', color: '#C8322B', logoUrl: '',
    tables: Math.min(200, Math.max(1, num(req.body.tables, 10))),
    categories: ['Entradas', 'Pratos principais', 'Sobremesas', 'Bebidas'],
    print: { imageUrl: '', mindUrl: '', width: 0, height: 0, hotspots: [] },
    estado: 'ativo', plano: planoExiste(req.body.plano) ? req.body.plano : 'teste',
    pagoAte: /^\d{4}-\d{2}-\d{2}$/.test(req.body.pagoAte || '') ? req.body.pagoAte : new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    notas: str(req.body.notas, 1000), contacto: str(req.body.contacto, 120),
    adminKeyHash: sha(adminKey), createdAt: now(),
  };
  r.mesas = novasMesas(r.tables);
  db.restaurants.push(r);
  store.save();
  res.status(201).json({ restaurante: linhaRestaurante(r, diasAtras(30), espacoPorRestaurante()), adminKey });
}));

app.patch('/api/plataforma/restaurantes/:id', wrap(async (req, res) => {
  requirePlataforma(req);
  const r = findRestaurant(req.params.id);
  const b = req.body || {};
  if (b.estado !== undefined) { if (!ESTADOS_CONTA.includes(b.estado)) throw new HttpError(400, 'Estado inválido.'); r.estado = b.estado; }
  if (b.plano !== undefined) { if (!planoExiste(b.plano)) throw new HttpError(400, 'Plano inválido.'); r.plano = b.plano; }
  if (b.pagoAte !== undefined) {
    if (b.pagoAte && !/^\d{4}-\d{2}-\d{2}$/.test(b.pagoAte)) throw new HttpError(400, 'Data inválida (AAAA-MM-DD).');
    r.pagoAte = b.pagoAte;
  }
  if (b.notas !== undefined) r.notas = str(b.notas, 1000);
  if (b.contacto !== undefined) r.contacto = str(b.contacto, 120);
  store.save();
  res.json({ restaurante: linhaRestaurante(r, diasAtras(30), espacoPorRestaurante()) });
}));

app.post('/api/plataforma/restaurantes/:id/nova-chave', wrap(async (req, res) => {
  requirePlataforma(req);
  const r = findRestaurant(req.params.id);
  const adminKey = crypto.randomBytes(18).toString('base64url');
  r.adminKeyHash = sha(adminKey);
  store.save();
  res.json({ adminKey });
}));

app.post('/api/plataforma/ia/:jobId/repetir', wrap(async (req, res) => {
  requirePlataforma(req);
  const j = db.aiJobs.find(x => x.id === req.params.jobId);
  if (!j) throw new HttpError(404, 'Trabalho não encontrado.');
  Object.assign(j, { status: 'na fila', error: '', attempts: 0, resultUrl: '' });
  store.save();
  res.json({ ok: true });
}));

// ---------- planos (só a plataforma) ----------
app.get('/api/plataforma/planos', wrap(async (req, res) => {
  requirePlataforma(req);
  res.json({ planos: planos(), funcionalidades: FUNCIONALIDADES, limites: LIMITES, uso: Object.fromEntries(planos().map(p => [p.id, db.restaurants.filter(r => r.plano === p.id).length])) });
}));
app.put('/api/plataforma/planos/:planoId', wrap(async (req, res) => {
  requirePlataforma(req);
  const atual = planos().find(p => p.id === req.params.planoId);
  const plano = limparPlano(req.body || {}, atual || { id: req.params.planoId });
  if (!plano.id) throw new HttpError(400, 'Identificador do plano inválido.');
  if (atual) Object.assign(atual, plano); else db.plataforma.planos.push(plano);
  store.save();
  res.json({ plano });
}));
app.delete('/api/plataforma/planos/:planoId', wrap(async (req, res) => {
  requirePlataforma(req);
  if (['teste'].includes(req.params.planoId)) throw new HttpError(400, 'O plano de teste é usado pelos restaurantes novos e não pode ser apagado.');
  const usam = db.restaurants.filter(r => r.plano === req.params.planoId).length;
  if (usam) throw new HttpError(409, `${usam} restaurante(s) usam este plano. Muda-os de plano primeiro, ou desativa-o.`);
  db.plataforma.planos = planos().filter(p => p.id !== req.params.planoId);
  store.save();
  res.json({ ok: true });
}));

// ---------- identidade visual de cada menu (só a plataforma) ----------
const VISUAL = ['base', 'cores', 'letras', 'cantos', 'botoes', 'prato', 'disposicao', 'cabecalho', 'textura', 'luz', 'movimento', 'cssExtra'];
function estadoTema(r) {
  return {
    publicado: temaDe(r),
    temPublicado: Boolean(r.tema),
    rascunho: r.temaRascunho || null,
    rascunhoEm: r.temaRascunhoEm || '',
    historico: (r.temaHistorico || []).slice().reverse(),
    identidadeBloqueada: Boolean(r.identidadeBloqueada),
    restaurante: { id: r.id, slug: r.slug, nome: r.name, logoUrl: r.logoUrl, tagline: r.tagline },
    pratos: db.dishes.filter(d => d.restaurantId === r.id && d.visible !== false).sort((a, b) => a.order - b.order)
      .map(d => ({ id: d.id, nome: d.name, categoria: d.category, imagem: d.posterUrl || d.photos?.[0] || '', tem3d: Boolean(d.modelUrl) })),
  };
}

app.get('/api/plataforma/restaurantes/:id/tema', wrap(async (req, res) => {
  requirePlataforma(req);
  res.json(estadoTema(findRestaurant(req.params.id)));
}));

app.put('/api/plataforma/restaurantes/:id/tema', wrap(async (req, res) => {
  requirePlataforma(req);
  const r = findRestaurant(req.params.id);
  const b = req.body || {};
  if (b.identidadeBloqueada !== undefined) r.identidadeBloqueada = Boolean(b.identidadeBloqueada);
  if (b.tema !== undefined) {
    const tema = limparTema(b.tema, idsPratos(r));
    if (b.publicar) {
      if (r.tema) {
        r.temaHistorico = [...(r.temaHistorico || []), { versao: (r.temaHistorico?.at(-1)?.versao || 0) + 1, em: r.temaPublicadoEm || r.createdAt, tema: r.tema }].slice(-10);
      }
      r.tema = tema;
      r.temaPublicadoEm = now();
      r.color = tema.cores.acento;     // o estúdio e o ecrã da equipa usam a mesma cor
      delete r.temaRascunho; delete r.temaRascunhoEm;
    } else {
      r.temaRascunho = tema;
      r.temaRascunhoEm = now();
    }
  }
  if (b.descartarRascunho) { delete r.temaRascunho; delete r.temaRascunhoEm; }
  store.save();
  res.json(estadoTema(r));
}));

// Modelos guardados: estilos que reutilizas noutros restaurantes (só a parte visual)
app.get('/api/plataforma/modelos', wrap(async (req, res) => {
  requirePlataforma(req);
  res.json({ modelos: db.plataforma.modelos || [] });
}));
app.post('/api/plataforma/modelos', wrap(async (req, res) => {
  requirePlataforma(req);
  const nome = str(req.body?.nome, 40);
  if (!nome) throw new HttpError(400, 'Dá um nome ao modelo.');
  const limpo = limparTema(req.body?.tema);
  const tema = Object.fromEntries(VISUAL.map(k => [k, limpo[k]]));
  db.plataforma.modelos = [...(db.plataforma.modelos || []), { id: store.id(6), nome, tema, criadoEm: now() }].slice(-40);
  store.save();
  res.status(201).json({ modelos: db.plataforma.modelos });
}));
app.delete('/api/plataforma/modelos/:modeloId', wrap(async (req, res) => {
  requirePlataforma(req);
  db.plataforma.modelos = (db.plataforma.modelos || []).filter(m => m.id !== req.params.modeloId);
  store.save();
  res.json({ modelos: db.plataforma.modelos });
}));

// ---------- estáticos e rotas de páginas ----------
const WEB = path.join(ROOT, 'web');
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '30d', immutable: true,
  setHeaders: (res, p) => {
    if (p.endsWith('.glb')) res.type('model/gltf-binary');
    if (p.endsWith('.usdz')) res.type('model/vnd.usdz+zip');
    res.set('Access-Control-Allow-Origin', '*');
  },
}));
app.get('/m/:slug', (req, res) => res.sendFile(path.join(WEB, 'menu.html')));
app.get('/m/:slug/pedido/:orderId', (req, res) => res.sendFile(path.join(WEB, 'pedido.html')));
app.get('/p/:slug', (req, res) => res.sendFile(path.join(WEB, 'print.html')));
app.get('/estudio', (req, res) => res.sendFile(path.join(WEB, 'studio.html')));
app.get('/plataforma', (req, res) => res.sendFile(path.join(WEB, 'plataforma.html')));
app.get('/equipa', (req, res) => res.sendFile(path.join(WEB, 'equipa.html')));
app.use(express.static(WEB, { maxAge: '1h', extensions: ['html'] }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Rota da API não existe.' }));

// erros em JSON, em português
app.use((err, req, res, next) => {
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Erro interno do servidor.' : err.message });
});

process.on('SIGINT', () => { store.flush(); process.exit(0); });
process.on('SIGTERM', () => { store.flush(); process.exit(0); });

app.listen(PORT, () => {
  console.log(`Kuvê a correr em ${PUBLIC_URL}`);
  console.log(`Estúdio: ${PUBLIC_URL}/estudio`);
  if (!WORKER_TOKEN) console.log('Aviso: WORKER_TOKEN não definido — a geração IA fica desligada.');
});
