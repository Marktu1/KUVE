// Acompanhar o pedido: link secreto, sem conta, atualiza a cada 10 s
import { api, esc, dinheiro } from './comum.js';
import { aplicarTema, limparTema } from './temas.js';

const $ = s => document.querySelector(s);
const [, , slug, , orderId] = location.pathname.split('/');
const t = new URLSearchParams(location.search).get('t') || '';
const PASSOS = [
  ['recebido', 'Recebido', 'O restaurante recebeu o teu pedido.'],
  ['confirmado', 'Confirmado', 'O pedido foi confirmado pela equipa.'],
  ['em_preparacao', 'Em preparação', 'A cozinha está a preparar o teu pedido.'],
  ['pronto', 'Pronto', 'Está pronto! Vai já para a tua mesa.'],
  ['entregue', 'Entregue', 'Bom apetite!'],
];
let temaAplicado = false, temporizador = null;
$('#voltar').href = `/m/${slug}`;

async function atualizar() {
  clearTimeout(temporizador);
  try {
    const { order: o, restaurante: r } = await api(`/api/pedido/${encodeURIComponent(orderId)}?t=${encodeURIComponent(t)}`);
    if (!temaAplicado) {
      aplicarTema(limparTema(r.tema));
      temaAplicado = true;
      document.title = `Pedido #${o.number} · ${r.nome}`;
      $('#rest-nome').textContent = r.nome;
      if (r.logoUrl) { $('#logo').src = r.logoUrl; $('#logo').classList.remove('oculto'); }
    }
    const moeda = n => dinheiro(n, r.moeda);
    $('#numero').textContent = `Pedido #${o.number}`;
    $('#mesa').textContent = o.table ? `Mesa ${o.table}` : '';
    $('#mesa').classList.toggle('oculto', !o.table);
    $('#estado').textContent = o.rotulo;
    const cancelado = o.status === 'cancelado';
    $('#cartao').classList.toggle('cancelado', cancelado);
    $('#frase').textContent = cancelado ? 'O restaurante cancelou este pedido. Fala com a equipa se tiveres dúvidas.' : (PASSOS.find(p => p[0] === o.status)?.[2] || '');
    const quando = Object.fromEntries(o.linhaTempo.map(h => [h.estado, h.em]));
    const atual = PASSOS.findIndex(p => p[0] === o.status);
    // "confirmado" é opcional (a cozinha pode começar logo): só aparece se aconteceu
    const passos = PASSOS.filter(([k]) => k !== 'confirmado' || quando.confirmado);
    $('#passos').innerHTML = cancelado ? '' : passos.map(([k, nome]) => {
      const i = PASSOS.findIndex(p => p[0] === k);
      const cls = i < atual || (i === atual && k === 'entregue') ? 'feito' : i === atual ? 'agora feito' : '';
      const h = quando[k] ? new Date(quando[k]).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '';
      return `<li class="${cls}"><span class="bola"><svg class="ic"><use href="/img/icones.svg#certo"/></svg></span><span>${nome}</span><time>${h}</time></li>`;
    }).join('');
    $('#itens').innerHTML = o.items.map(i => `<li><span><b>${i.qty}×</b>${esc(i.name)}${i.variant ? ` · ${esc(i.variant)}` : ''}</span><span>${moeda(i.subtotal)}</span></li>`).join('');
    $('#total').textContent = moeda(o.total);
    $('#pago').textContent = o.pago ? 'Pago' : cancelado ? '' : 'Pagas no restaurante, como de costume.';
    $('#pago').classList.toggle('sim', o.pago);
    $('#erro').classList.add('oculto');
    if (!['entregue', 'cancelado'].includes(o.status)) temporizador = setTimeout(atualizar, 10000);
  } catch (err) {
    $('#estado').textContent = 'Pedido não encontrado';
    $('#erro').textContent = 'Verifica se o link está completo. Se acabaste de fazer o pedido, volta ao menu.';
    $('#erro').classList.remove('oculto');
    if (!temaAplicado) { aplicarTema(limparTema({})); temaAplicado = true; }
  }
  document.documentElement.classList.remove('a-carregar');
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizar(); });
atualizar();
