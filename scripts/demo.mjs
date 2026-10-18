// Demonstração com dados fictícios: arranca o servidor numa pasta própria e cria um restaurante completo.
// Uso:  npm run demo              (começa do zero em ./data-demo)
//       npm run demo -- --manter  (mantém os dados da última vez)
// Nada disto toca nos dados reais (./data).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data-demo');
const PORT = Number(process.env.PORT || 3000);
const B = `http://127.0.0.1:${PORT}`;
const PLAT = process.env.PLATAFORMA_CHAVE || 'demo-plataforma';
const AMOSTRAS = path.join(ROOT, 'samples/demo');
const manter = process.argv.includes('--manter');

if (!manter) fs.rmSync(DATA_DIR, { recursive: true, force: true });
const ja = fs.existsSync(path.join(DATA_DIR, 'db.json'));

const server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR, PLATAFORMA_CHAVE: PLAT, PUBLIC_URL: process.env.PUBLIC_URL || `http://localhost:${PORT}` },
  stdio: ['ignore', 'inherit', 'inherit'],
});
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => { server.kill(); process.exit(0); });
// se o servidor cair, a demonstração cai com ele (o alojamento volta a arrancar tudo)
server.on('exit', codigo => process.exit(codigo ?? 1));

async function api(caminho, { method = 'GET', body, key, plat, equipa, form } = {}) {
  const headers = {};
  if (key) headers['x-admin-key'] = key;
  if (plat) headers['x-plataforma-key'] = plat;
  if (equipa) headers['x-equipa-token'] = equipa;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(B + caminho, { method, headers, body: form || (body === undefined ? undefined : JSON.stringify(body)) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${caminho}: ${res.status} ${json?.error || ''}`);
  return json;
}
async function carregar(rid, key, ficheiro, tipo = 'image') {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(path.join(AMOSTRAS, ficheiro))]), ficheiro);
  return (await api(`/api/restaurants/${rid}/upload/${tipo}`, { method: 'POST', key, form })).url;
}

for (let i = 0; i < 50; i++) {
  try { await fetch(B + '/'); break; } catch { await new Promise(r => setTimeout(r, 200)); }
}

if (ja) {
  console.log(`\nDemonstração a correr com os dados guardados em ${DATA_DIR}\n  Painel da plataforma: ${B}/plataforma  (chave: ${process.env.PLATAFORMA_CHAVE ? 'a de PLATAFORMA_CHAVE' : PLAT})\n`);
} else {
  // ---------- restaurante ----------
  const { restaurante, adminKey: key } = await api('/api/plataforma/restaurantes', { method: 'POST', plat: PLAT, body: { name: 'Kianda Demonstração', plano: 'teste', tables: 0, whatsapp: '', contacto: 'Restaurante fictício' } });
  const rid = restaurante.id;
  await api(`/api/restaurants/${rid}`, { method: 'PUT', key, body: {
    tagline: 'Cozinha angolana de casa (restaurante fictício)', logoUrl: await carregar(rid, key, 'logo-kianda.png'),
    categories: ['Entradas', 'Pratos', 'Sobremesas', 'Bebidas'],
  } });

  // ---------- pratos ----------
  const PRATOS = [
    ['Abacate recheado', 'Entradas', 3500, 'Meio abacate com camarão salteado e molho de lima.', { modelo: 'abacate', cm: 10 }],
    ['Salada da casa', 'Entradas', 2800, 'Folhas, tomate e vinagrete de maracujá.', 'salada.png'],
    ['Camarão da Ilha', 'Entradas', 6500, 'Camarão grelhado com alho e limão.', 'camarao.png'],
    ['Muamba de galinha', 'Pratos', 9500, 'Galinha em óleo de palma com quiabos e funge.', 'muamba.png'],
    ['Calulu de peixe', 'Pratos', 9000, 'Peixe seco e fresco com folhas de batata-doce.', 'calulu.png'],
    ['Mufete', 'Pratos', 11000, 'Peixe grelhado, feijão de óleo de palma, banana e mandioca.', 'mufete.png'],
    ['Funge com carne seca', 'Pratos', 7800, 'Funge de bombó e carne seca guisada.', 'funge.png'],
    ['Pizza da casa', 'Pratos', 7500, 'Massa fina, tomate e queijo.', { modelo: 'pizza', cm: 30 }],
    ['Picanha grelhada', 'Pratos', 12500, 'Com arroz e salada.', 'grelhado.png'],
    ['Cocada amarela', 'Sobremesas', 1800, 'Coco ralado e açúcar queimado.', 'cocada.png'],
    ['Pudim de leite', 'Sobremesas', 2200, 'Receita da casa.', 'pudim.png'],
    ['Sumo de múcua', 'Bebidas', 1500, 'Natural e fresco.', 'sumo.png'],
    ['Sumo de groselha', 'Bebidas', 1500, 'Bem gelado.', 'sumo2.png'],
    ['Café de Amboim', 'Bebidas', 800, 'Expresso de café angolano.', 'cafe.png'],
  ];
  const ids = {};
  for (const [i, [name, category, price, description, img]] of PRATOS.entries()) {
    const d = { name, category, price, description, order: i + 1, allergens: name.includes('Camarão') || name.includes('Abacate') ? ['Crustáceos'] : [] };
    if (typeof img === 'string') d.posterUrl = await carregar(rid, key, img);
    else { d.modelUrl = await carregar(rid, key, `${img.modelo}.glb`, 'model'); d.posterUrl = await carregar(rid, key, `${img.modelo}.webp`); d.realSizeCm = img.cm; }
    ids[name] = (await api(`/api/restaurants/${rid}/dishes`, { method: 'POST', key, body: d })).dish.id;
  }

  // ---------- mesas e equipa ----------
  await api(`/api/restaurants/${rid}/mesas`, { method: 'POST', key, body: { nomes: ['1', '2', '3', '4', '5', '6', 'Esplanada A', 'Esplanada B'] } });
  const { mesas } = await api(`/api/restaurants/${rid}/mesas`, { key });
  const codigo = nome => mesas.find(m => m.nome === nome).codigo;
  const joana = await api(`/api/restaurants/${rid}/equipa`, { method: 'POST', key, body: { nome: 'Joana', funcao: 'rececao' } });
  const paulo = await api(`/api/restaurants/${rid}/equipa`, { method: 'POST', key, body: { nome: 'Paulo', funcao: 'cozinha' } });
  const { token } = await api('/api/equipa/entrar', { method: 'POST', body: { codigo: restaurante.slug, pin: joana.pin } });

  // ---------- pedidos em vários estados ----------
  const pedir = (mesa, itens, nota = '') => api(`/api/menu/${restaurante.slug}/orders`, { method: 'POST', body: {
    mesaCodigo: codigo(mesa), note: nota, items: itens.map(([n, qty]) => ({ dishId: ids[n], qty })) } });
  const mudar = (id, ...estados) => estados.reduce((p, status) => p.then(() => api(`/api/orders/${id}`, { method: 'PATCH', equipa: token, body: { status } })), Promise.resolve());
  const pagar = (id, metodo) => api(`/api/orders/${id}/pagamento`, { method: 'POST', equipa: token, body: { metodo } });

  const a = await pedir('2', [['Muamba de galinha', 2], ['Sumo de múcua', 2]]);
  await mudar(a.order.id, 'em_preparacao', 'pronto', 'entregue'); await pagar(a.order.id, 'multicaixa');
  const b = await pedir('Esplanada A', [['Mufete', 1], ['Café de Amboim', 1]]);
  await mudar(b.order.id, 'em_preparacao', 'pronto', 'entregue'); await pagar(b.order.id, 'dinheiro');
  const c = await pedir('4', [['Pizza da casa', 1], ['Sumo de groselha', 2]], 'Sem cebola, por favor');
  await mudar(c.order.id, 'confirmado', 'em_preparacao');
  const d = await pedir('5', [['Calulu de peixe', 1], ['Pudim de leite', 1]]);
  await mudar(d.order.id, 'em_preparacao', 'pronto');
  await pedir('1', [['Abacate recheado', 2], ['Picanha grelhada', 2]]);
  await pedir('6', [['Camarão da Ilha', 1]]);

  // ---------- identidade ----------
  const tema = (await api(`/api/plataforma/restaurantes/${rid}/tema`, { plat: PLAT })).publicado;
  await api(`/api/plataforma/restaurantes/${rid}/tema`, { method: 'PUT', plat: PLAT, body: { publicar: true, tema: {
    ...tema, base: 'tasca', cores: { fundo: '#F1E7D3', superficie: '#FBF6EC', texto: '#33241A', suave: '#7B6450', acento: '#8E2C1C', destaque: '#D19A3B' },
    letras: { titulo: 'playfair', texto: 'lora' }, prato: 'madeira', textura: 'madeira', cantos: 'suave', botoes: 'suave',
    destaques: [ids['Mufete'], ids['Muamba de galinha'], ids['Abacate recheado']],
    aviso: { ativo: true, texto: 'Restaurante fictício para demonstração da Kuvê', ate: '' },
  } } });

  const PUB = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
  // num alojamento a chave vem do ambiente: não a escrevemos nos logs
  const CHAVE_VISIVEL = process.env.PLATAFORMA_CHAVE ? '(a de PLATAFORMA_CHAVE)' : PLAT;
  const linha = '─'.repeat(64);
  console.log(`\n${linha}\nDemonstração pronta (dados fictícios)\n${linha}
  Menu do cliente (mesa 4):  ${PUB}/m/${restaurante.slug}?m=${codigo('4')}
  Estúdio do gerente:        ${PUB}/estudio   código ${rid} · chave ${key}
  Ecrã da equipa:            ${PUB}/equipa    código ${restaurante.slug} · PIN Joana ${joana.pin} · PIN Paulo ${paulo.pin}
  Painel da plataforma:      ${PUB}/plataforma  chave ${CHAVE_VISIVEL}
  Acompanhar um pedido:      ${PUB}${c.acompanhar}
${linha}\nCtrl+C para parar. Os dados ficam em ${DATA_DIR}\n`);
  fs.writeFileSync(path.join(DATA_DIR, 'DEMO.txt'), JSON.stringify({ rid, key, slug: restaurante.slug, pinJoana: joana.pin, pinPaulo: paulo.pin, mesa4: codigo('4'), acompanhar: c.acompanhar, plat: PLAT }, null, 2));
}
