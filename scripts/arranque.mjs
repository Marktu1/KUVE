// Arranque para alojamento (Render e semelhantes).
//   KUVE_DEMO=1  → começa sempre com o restaurante de demonstração (bom para o plano grátis,
//                  onde o disco se apaga quando o serviço adormece)
//   sem KUVE_DEMO → servidor normal, com os dados em DATA_DIR (para um disco persistente)
// O endereço público vem de PUBLIC_URL ou, no Render, de RENDER_EXTERNAL_URL (definido pelo Render).
if (!process.env.PUBLIC_URL && process.env.RENDER_EXTERNAL_URL) process.env.PUBLIC_URL = process.env.RENDER_EXTERNAL_URL;

if (process.env.KUVE_DEMO === '1') await import('./demo.mjs');
else await import('../server/index.js');
