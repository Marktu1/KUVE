// Testes dos fluxos críticos e do isolamento entre restaurantes.
// Arranca um servidor real com uma base de dados vazia numa pasta temporária.
// Correr: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { podeMudar, ESTADOS, migrar, permissoesDe } from '../server/dominio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3990 + Math.floor(Math.random() * 9);
const B = `http://127.0.0.1:${PORT}`;
const CHAVE_PLAT = 'chave-de-teste-da-plataforma';
let server, dataDir;

async function api(caminho, { method = 'GET', body, key, plat, equipa } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (key) headers['x-admin-key'] = key;
  if (plat) headers['x-plataforma-key'] = plat;
  if (equipa) headers['x-equipa-token'] = equipa;
  const res = await fetch(B + caminho, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// cria um restaurante com 2 pratos, mesas e um funcionário de cada função
async function restaurante(nome, plano = 'teste') {
  const r = await api('/api/plataforma/restaurantes', { method: 'POST', plat: CHAVE_PLAT, body: { name: nome, plano, tables: 3 } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const id = r.json.restaurante.id, key = r.json.adminKey, slug = r.json.restaurante.slug;
  const p1 = await api(`/api/restaurants/${id}/dishes`, { method: 'POST', key, body: { name: 'Muamba', price: 5000, category: 'Pratos' } });
  const p2 = await api(`/api/restaurants/${id}/dishes`, { method: 'POST', key, body: { name: 'Sumo', price: 1000, category: 'Bebidas' } });
  return { id, key, slug, pratos: [p1.json?.dish, p2.json?.dish] };
}
async function membro(R, funcao) {
  const m = await api(`/api/restaurants/${R.id}/equipa`, { method: 'POST', key: R.key, body: { nome: `Pessoa ${funcao}`, funcao } });
  assert.equal(m.status, 201, JSON.stringify(m.json));
  const s = await api('/api/equipa/entrar', { method: 'POST', body: { codigo: R.slug, pin: m.json.pin } });
  assert.equal(s.status, 200);
  return { ...m.json.membro, token: s.json.token };
}
const pedir = (R, extra = {}) => api(`/api/menu/${R.slug}/orders`, { method: 'POST', body: { items: [{ dishId: R.pratos[0].id, qty: 2 }], ...extra } });

let A, Bx, cozinhaA, rececaoA, rececaoB;
before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu3d-teste-'));
  server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, PLATAFORMA_CHAVE: CHAVE_PLAT, WORKER_TOKEN: '' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(B + '/api/menu/x'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  A = await restaurante('Restaurante A');
  Bx = await restaurante('Restaurante B');
  cozinhaA = await membro(A, 'cozinha');
  rececaoA = await membro(A, 'rececao');
  rececaoB = await membro(Bx, 'rececao');
});
after(() => { server?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

// ---------------------------------------------------------------
test('regras: transições de estado dos pedidos', () => {
  assert.ok(podeMudar('recebido', 'confirmado'));
  assert.ok(podeMudar('em_preparacao', 'pronto'));
  assert.ok(!podeMudar('entregue', 'recebido'), 'entregue não volta atrás');
  assert.ok(!podeMudar('cancelado', 'em_preparacao'), 'cancelado é final');
  assert.ok(!podeMudar('pronto', 'cancelado'), 'pronto já não se cancela');
  for (const e of ESTADOS) assert.ok(!podeMudar(e, e), `${e} → ${e} não é transição`);
});

test('regras: migração dos dados antigos', () => {
  const db = { orders: [{ status: 'novo', historico: [{ estado: 'novo' }] }, { status: 'a preparar' }], restaurants: [{ tables: 3, plano: 'essencial' }], plataforma: {} };
  migrar(db, { novoCodigo: n => 'x'.repeat(n) });
  assert.equal(db.orders[0].status, 'recebido');
  assert.equal(db.orders[0].historico[0].estado, 'recebido');
  assert.equal(db.orders[1].status, 'em_preparacao');
  assert.equal(db.restaurants[0].mesas.length, 3);
  assert.equal(db.restaurants[0].plano, 'profissional');
  assert.ok(db.plataforma.planos.length >= 4);
  assert.deepEqual(permissoesDe({ funcao: 'cozinha' }), ['pedidos', 'esgotados']);
});

test('isolamento: o gerente do restaurante A não toca no restaurante B', async () => {
  const pedidoB = (await pedir(Bx)).json.order;
  const mesaB = (await api(`/api/admin/${Bx.id}`, { key: Bx.key })).json.mesas[0];
  const tentativas = [
    ['ler o estúdio de B', `/api/admin/${Bx.id}`, 'GET'],
    ['ler pedidos de B', `/api/restaurants/${Bx.id}/orders`, 'GET'],
    ['ler o painel de B', `/api/restaurants/${Bx.id}/painel`, 'GET'],
    ['ler a equipa de B', `/api/restaurants/${Bx.id}/equipa`, 'GET'],
    ['ler as mesas de B', `/api/restaurants/${Bx.id}/mesas`, 'GET'],
    ['mudar o restaurante B', `/api/restaurants/${Bx.id}`, 'PUT', { name: 'Roubado' }],
    ['criar prato em B', `/api/restaurants/${Bx.id}/dishes`, 'POST', { name: 'X', price: 1 }],
    ['mudar prato de B', `/api/dishes/${Bx.pratos[0].id}`, 'PUT', { price: 1 }],
    ['apagar prato de B', `/api/dishes/${Bx.pratos[0].id}`, 'DELETE'],
    ['mudar estado de pedido de B', `/api/orders/${pedidoB.id}`, 'PATCH', { status: 'confirmado' }],
    ['registar pagamento em B', `/api/orders/${pedidoB.id}/pagamento`, 'POST', { metodo: 'dinheiro' }],
    ['criar mesa em B', `/api/restaurants/${Bx.id}/mesas`, 'POST', { nome: 'X' }],
    ['libertar mesa de B', `/api/restaurants/${Bx.id}/mesas/${mesaB.id}/libertar`, 'POST', {}],
    ['marcar esgotado em B', `/api/dishes/${Bx.pratos[0].id}/esgotado`, 'PUT', { esgotado: true }],
    ['usar a rota da plataforma', '/api/plataforma/resumo', 'GET'],
  ];
  for (const [nome, url, method, body] of tentativas) {
    const r = await api(url, { method, body, key: A.key, equipa: rececaoA.token });
    assert.ok([401, 403].includes(r.status), `${nome}: esperava 401/403, veio ${r.status}`);
  }
  const prato = (await api(`/api/admin/${Bx.id}`, { key: Bx.key })).json.dishes.find(d => d.id === Bx.pratos[0].id);
  assert.equal(prato.price, 5000, 'o prato de B ficou igual');
  assert.ok(!prato.esgotado);
});

test('isolamento: a sessão da equipa de B não serve em A', async () => {
  for (const url of [`/api/restaurants/${A.id}/orders`, `/api/restaurants/${A.id}/mesas`, `/api/equipa/${A.id}/pratos`]) {
    const r = await api(url, { equipa: rececaoB.token });
    assert.ok([401, 403].includes(r.status), `${url}: veio ${r.status}`);
  }
});

test('pedido: preço vem sempre do servidor; esgotado e prato de outro restaurante recusados', async () => {
  const r = await api(`/api/menu/${A.slug}/orders`, { method: 'POST', body: { items: [{ dishId: A.pratos[0].id, qty: 1, price: 1, unit: 1 }], total: 1 } });
  assert.equal(r.status, 201);
  assert.equal(r.json.order.total, 5000);
  assert.equal((await api(`/api/menu/${A.slug}/orders`, { method: 'POST', body: { items: [{ dishId: Bx.pratos[0].id, qty: 1 }] } })).status, 400);
  await api(`/api/dishes/${A.pratos[1].id}/esgotado`, { method: 'PUT', key: A.key, body: { esgotado: true } });
  assert.equal((await api(`/api/menu/${A.slug}/orders`, { method: 'POST', body: { items: [{ dishId: A.pratos[1].id, qty: 1 }] } })).status, 400);
  await api(`/api/dishes/${A.pratos[1].id}/esgotado`, { method: 'PUT', key: A.key, body: { esgotado: false } });
});

test('pedido: o mesmo envio repetido não cria dois pedidos', async () => {
  const chave = 'envio-' + Math.random();
  const um = await pedir(A, { chave });
  const dois = await pedir(A, { chave });
  assert.equal(um.status, 201);
  assert.equal(dois.status, 200);
  assert.equal(dois.json.order.id, um.json.order.id);
  assert.ok(dois.json.repetido);
});

test('pedido: estados avançam só por transições válidas', async () => {
  const o = (await pedir(A)).json.order;
  const mudar = (status, quem = { key: A.key }) => api(`/api/orders/${o.id}`, { method: 'PATCH', body: { status }, ...quem });
  assert.equal((await mudar('entregue')).status, 409, 'recebido → entregue é recusado');
  assert.equal((await mudar('confirmado')).status, 200);
  assert.equal((await mudar('em_preparacao', { equipa: cozinhaA.token })).status, 200, 'a cozinha pode preparar');
  assert.equal((await mudar('pronto')).status, 200);
  assert.equal((await mudar('entregue')).status, 200);
  assert.equal((await mudar('recebido')).status, 409, 'entregue não volta atrás');
  assert.equal((await mudar('inventado')).status, 400);
});

test('cliente acompanha o pedido só com o link secreto', async () => {
  const r = await pedir(A);
  const u = new URL(B + r.json.acompanhar);
  const orderId = u.pathname.split('/')[4], t = u.searchParams.get('t');
  const ok = await api(`/api/pedido/${orderId}?t=${t}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.order.status, 'recebido');
  assert.equal((await api(`/api/pedido/${orderId}?t=errado`)).status, 404);
  assert.equal((await api(`/api/pedido/${orderId}`)).status, 404);
  await api(`/api/orders/${orderId}`, { method: 'PATCH', key: A.key, body: { status: 'em_preparacao' } });
  assert.equal((await api(`/api/pedido/${orderId}?t=${t}`)).json.order.rotulo, 'Em preparação');
  const lista = (await api(`/api/restaurants/${A.id}/orders`, { key: A.key })).json.orders;
  assert.ok(lista.every(o => !('segredo' in o)), 'o segredo do cliente não vai para o painel');
});

test('mesas: o QR identifica a mesa; códigos não aparecem no menu público', async () => {
  const mesas = (await api(`/api/admin/${A.id}`, { key: A.key })).json.mesas;
  assert.equal(mesas.length, 3);
  const menu = await api(`/api/menu/${A.slug}?m=${mesas[1].codigo}`);
  assert.equal(menu.json.mesa.nome, mesas[1].nome);
  assert.ok(!JSON.stringify(menu.json).includes(mesas[0].codigo), 'os códigos das outras mesas não são públicos');
  const p = await pedir(A, { mesaCodigo: mesas[1].codigo, table: '99' });
  assert.equal(p.json.order.table, mesas[1].nome, 'vale o código, não o número escrito');
  assert.equal((await pedir(A, { mesaCodigo: 'inventado' })).status, 400);
  // gerar novo código: o QR antigo deixa de funcionar
  await api(`/api/restaurants/${A.id}/mesas/${mesas[1].id}`, { method: 'PATCH', key: A.key, body: { novoCodigo: true } });
  assert.equal((await api(`/api/menu/${A.slug}?m=${mesas[1].codigo}`)).json.mesa, null);
});

test('mesas: estado, pagamento e libertar', async () => {
  const mesa = (await api(`/api/admin/${A.id}`, { key: A.key })).json.mesas[2];
  const estado = async () => (await api(`/api/restaurants/${A.id}/mesas`, { equipa: rececaoA.token })).json.mesas.find(m => m.id === mesa.id);
  assert.equal((await estado()).estado, 'livre');
  const o = (await pedir(A, { mesaCodigo: mesa.codigo })).json.order;
  assert.equal((await estado()).estado, 'pendente');
  for (const s of ['em_preparacao', 'pronto', 'entregue']) await api(`/api/orders/${o.id}`, { method: 'PATCH', key: A.key, body: { status: s } });
  assert.equal((await estado()).estado, 'ocupada');
  assert.equal((await estado()).porPagar, 10000);
  const cedo = await api(`/api/restaurants/${A.id}/mesas/${mesa.id}/libertar`, { method: 'POST', equipa: rececaoA.token, body: {} });
  assert.equal(cedo.status, 409, 'não liberta com conta por pagar');
  assert.equal((await api(`/api/orders/${o.id}/pagamento`, { method: 'POST', equipa: cozinhaA.token, body: { metodo: 'dinheiro' } })).status, 403, 'a cozinha não regista pagamentos');
  assert.equal((await api(`/api/orders/${o.id}/pagamento`, { method: 'POST', equipa: rececaoA.token, body: { metodo: 'cheque' } })).status, 400);
  assert.equal((await api(`/api/orders/${o.id}/pagamento`, { method: 'POST', equipa: rececaoA.token, body: { metodo: 'multicaixa' } })).status, 200);
  assert.equal((await api(`/api/orders/${o.id}/pagamento`, { method: 'POST', equipa: rececaoA.token, body: { metodo: 'dinheiro' } })).status, 409, 'não paga duas vezes');
  assert.equal((await api(`/api/orders/${o.id}/pagamento`, { method: 'DELETE', equipa: rececaoA.token })).status, 401, 'só o gerente anula pagamentos');
  assert.equal((await api(`/api/restaurants/${A.id}/mesas/${mesa.id}/libertar`, { method: 'POST', equipa: rececaoA.token, body: {} })).status, 200);
  assert.equal((await estado()).estado, 'livre');
});

test('pagamentos: o painel separa valor pedido de pagamentos confirmados', async () => {
  const p = (await api(`/api/restaurants/${A.id}/painel?dias=7`, { key: A.key })).json;
  assert.ok(p.atual.vendas > p.atual.pago, `pedido ${p.atual.vendas} > pago ${p.atual.pago}`);
  assert.equal(p.atual.pago, 10000);
  assert.equal(p.atual.porPagar, p.atual.vendas - p.atual.pago);
  assert.deepEqual(p.metodos, [{ metodo: 'Multicaixa Express', valor: 10000 }]);
  const pago = (await api(`/api/restaurants/${A.id}/orders`, { key: A.key })).json.orders.find(o => o.pagamento?.estado === 'pago');
  assert.equal((await api(`/api/orders/${pago.id}`, { method: 'PATCH', key: A.key, body: { status: 'cancelado' } })).status, 409, 'pedido pago não se cancela');
});

test('permissões: o gerente decide o que cada pessoa pode fazer', async () => {
  const o = (await pedir(A)).json.order;
  assert.equal((await api(`/api/orders/${o.id}`, { method: 'PATCH', equipa: cozinhaA.token, body: { status: 'cancelado' } })).status, 403, 'cozinha não cancela');
  await api(`/api/restaurants/${A.id}/equipa/${cozinhaA.id}`, { method: 'PATCH', key: A.key, body: { permissoes: ['pedidos', 'esgotados', 'cancelar'] } });
  assert.equal((await api(`/api/orders/${o.id}`, { method: 'PATCH', equipa: cozinhaA.token, body: { status: 'cancelado' } })).status, 200, 'agora pode');
  await api(`/api/restaurants/${A.id}/equipa/${cozinhaA.id}`, { method: 'PATCH', key: A.key, body: { permissoes: ['esgotados'] } });
  assert.equal((await api(`/api/restaurants/${A.id}/orders`, { equipa: cozinhaA.token })).status, 403, 'sem "pedidos" não vê pedidos');
  assert.equal((await api(`/api/restaurants/${A.id}/equipa/${cozinhaA.id}`, { method: 'PATCH', equipa: rececaoA.token, body: { permissoes: ['pedidos'] } })).status, 401, 'a equipa não mexe em permissões');
});

test('planos: funcionalidades e limites aplicados no servidor', async () => {
  const M = await restaurante('Só Menu', 'menu');
  assert.equal((await pedir(M)).status, 403, 'plano Menu não recebe pedidos');
  assert.equal((await api(`/api/restaurants/${M.id}/equipa`, { method: 'POST', key: M.key, body: { nome: 'X' } })).status, 403);
  assert.equal((await api(`/api/restaurants/${M.id}/mesas`, { method: 'POST', key: M.key, body: { nome: '1' } })).status, 403);
  assert.deepEqual((await api(`/api/menu/${M.slug}`)).json.restaurant.funcionalidades, ['identidade']);
  // o dono baixa o limite de pratos do plano Menu para 2 → o 3.º prato é recusado
  const planos = (await api('/api/plataforma/planos', { plat: CHAVE_PLAT })).json.planos;
  const menu = planos.find(p => p.id === 'menu');
  assert.equal((await api('/api/plataforma/planos/menu', { method: 'PUT', plat: CHAVE_PLAT, body: { ...menu, limites: { ...menu.limites, pratos: 2 }, precoMensal: 18000 } })).status, 200);
  assert.equal((await api(`/api/restaurants/${M.id}/dishes`, { method: 'POST', key: M.key, body: { name: 'Terceiro', price: 1 } })).status, 403);
  assert.equal((await api('/api/plataforma/planos/menu', { method: 'PUT', key: M.key, body: { precoMensal: 0 } })).status, 401, 'o restaurante não mexe em planos');
  const resumo = (await api('/api/plataforma/resumo', { plat: CHAVE_PLAT })).json;
  assert.ok(resumo.totais.mrr >= 18000, 'receita mensal estimada inclui o plano Menu');
  assert.equal((await api('/api/plataforma/planos/menu', { method: 'DELETE', plat: CHAVE_PLAT })).status, 409, 'plano em uso não se apaga');
});

test('erros: respostas claras e sem detalhes internos', async () => {
  const r = await fetch(`${B}/api/menu/${A.slug}/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nao é json' });
  const t = await r.text();
  assert.ok(r.status >= 400 && r.status < 500, String(r.status));
  assert.ok(!/at .*\.js:\d+|node_modules/.test(t), 'sem stack trace');
  assert.equal((await api('/api/menu/nao-existe')).status, 404);
});
