// Painel do gerente: vendas, pratos, efeito do 3D, horas de movimento, mesas
import { esc } from './comum.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let ctx = null, dias = 30, ligado = false;

const n = v => Number(v || 0).toLocaleString('pt-PT', { maximumFractionDigits: 0 });
const pct = v => v == null ? '—' : `${(v * 100).toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%`;
const ICONE = id => `<svg class="ic" aria-hidden="true"><use href="/img/icones.svg#${id}"/></svg>`;

export async function abrir(contexto) {
  ctx = contexto;
  if (!ligado) {
    $$('.periodo [data-dias]').forEach(b => b.addEventListener('click', () => {
      dias = Number(b.dataset.dias);
      $$('.periodo [data-dias]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
      carregar();
    }));
    ligado = true;
  }
  await carregar();
}

async function carregar() {
  try {
    const d = await ctx.api(`/api/restaurants/${ctx.sess.id}/painel?dias=${dias}`, { key: ctx.chave() });
    pintar(d);
  } catch (err) { ctx.toast(err.message); }
}

function delta(agora, antes, inverso = false) {
  if (!antes && !agora) return '<span class="delta">sem dados ainda</span>';
  if (!antes) return '<span class="delta sobe">novo neste período</span>';
  const p = Math.round(((agora - antes) / antes) * 100);
  const bom = inverso ? p < 0 : p > 0;
  return `<span class="delta ${p === 0 ? '' : bom ? 'sobe' : 'desce'}">${p > 0 ? '▲' : p < 0 ? '▼' : '='} ${Math.abs(p)}% vs. ${dias} dias antes</span>`;
}

function pintar(d) {
  const a = d.atual, b = d.anterior, m = esc(d.moeda);
  $('#painel-sub').textContent = `Últimos ${d.dias} dias, comparados com os ${d.dias} anteriores.`;
  // acima de 100% os dados não são fiáveis (visitas não registadas, por exemplo pedidos feitos noutro aparelho)
  const fiavel = v => (v != null && v <= 1 ? v : null);
  const conv = fiavel(a.conversao), convAntes = fiavel(b.visitas ? b.pedidos / b.visitas : null);
  // hoje: o que interessa durante o serviço
  const h = d.hoje || {};
  $('#painel-hoje').innerHTML = `
    <span class="hoje-titulo">Hoje</span>
    <div><b>${n(h.pedidos)}</b><span>pedidos</span></div>
    <div><b>${n(h.vendas)} <small>${m}</small></b><span>valor pedido</span></div>
    ${d.funcPagamentos ? `<div><b class="ok">${n(h.pago)} <small>${m}</small></b><span>pagamentos confirmados</span></div>
    <div><b class="${h.porPagar ? 'aviso' : ''}">${n(h.porPagar)} <small>${m}</small></b><span>por pagar</span></div>` : ''}
    <div><b class="${h.pendentes ? 'aviso' : ''}">${n(h.pendentes)}</b><span>por confirmar ou preparar</span></div>
    <div><b>${n(h.emCurso)}</b><span>em curso</span></div>`;
  $('#painel-kpis').innerHTML = `
    <div class="cartao kpi"><span class="rotulo">Valor pedido pelo menu</span><span class="valor">${n(a.vendas)}<small>${m}</small></span>${delta(a.vendas, b.vendas)}<span class="explica">Soma dos pedidos não cancelados. Não é dinheiro recebido.</span></div>
    ${d.funcPagamentos ? `<div class="cartao kpi"><span class="rotulo">Pagamentos confirmados</span><span class="valor">${n(a.pago)}<small>${m}</small></span>${delta(a.pago, b.pago)}<span class="explica">${n(a.pedidosPagos)} pedidos pagos · ${n(a.porPagar)} ${m} por pagar${d.metodos?.length ? `<br>${d.metodos.map(x => `${esc(x.metodo)}: ${n(x.valor)}`).join(' · ')}` : ''}</span></div>` : ''}
    <div class="cartao kpi"><span class="rotulo">Pedidos</span><span class="valor">${n(a.pedidos)}</span>${delta(a.pedidos, b.pedidos)}</div>
    <div class="cartao kpi"><span class="rotulo">Valor médio por pedido</span><span class="valor">${n(a.ticket)}<small>${m}</small></span>${delta(a.ticket, b.ticket)}</div>
    <div class="cartao kpi"><span class="rotulo">Visitas que viram pedido</span><span class="valor">${pct(conv)}</span>${conv != null && convAntes != null ? delta(conv, convAntes) : `<span class="explica">${n(a.visitas)} visitas ao menu</span>`}</div>
    <div class="cartao kpi"><span class="rotulo">Pratos postos na mesa (AR)</span><span class="valor">${n(a.ar)}</span>${delta(a.ar, b.ar)}</div>`;

  linha($('#g-vendas'), 'Valor pedido por dia', d.serie, 'vendas', v => `${n(v)} ${d.moeda}`);
  linha($('#g-pedidos'), 'Pedidos por dia', d.serie, 'pedidos', v => `${n(v)} pedidos`);

  // mais vendidos
  const max = Math.max(1, ...d.maisVendidos.map(x => x.vendas));
  $('#b-vendidos').innerHTML = `<h3>Mais vendidos <small>por valor</small></h3>` + (d.maisVendidos.length ? `<ol class="ranking">${d.maisVendidos.map(x => `
    <li><span class="mini">${x.posterUrl ? `<img src="${esc(x.posterUrl)}" alt="">` : ''}</span>
      <span><span class="nome">${esc(x.nome)}</span><span class="barra"><i style="width:${(x.vendas / max) * 100}%"></i></span></span>
      <span class="valores"><b>${n(x.vendas)} ${m}</b><span>${n(x.qtd)} vendidos</span></span></li>`).join('')}</ol>`
    : '<p class="nada">Ainda não há pedidos neste período.</p>');

  // efeito do 3D
  const c = d.efeito3d.com, s = d.efeito3d.sem;
  const suficiente = c.vistos >= 20 && s.vistos >= 20;
  const por100 = g => g.conversao == null ? '—' : n(g.conversao * 100);
  let conclusao = 'Ainda há poucas visitas para comparar. Esta conta fica fiável a partir de 20 visitas em cada grupo.';
  if (suficiente && c.conversao && s.conversao) {
    const r = c.conversao / s.conversao;
    conclusao = r >= 1.1 ? `Os pratos com 3D são pedidos <b>${r.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}× mais</b> por cada vez que são vistos. Vale a pena pôr em 3D os pratos que ainda não têm.`
      : r <= 0.9 ? 'Os pratos com 3D estão a converter menos do que os outros. Revê a qualidade dos modelos e as fotos.'
      : 'Os pratos com e sem 3D convertem de forma parecida.';
  }
  $('#b-3d').innerHTML = `<h3>Efeito do 3D <small>pedidos por cada 100 vezes que o prato é aberto</small></h3>
    <div class="comparar-3d">
      <div><span class="t">${ICONE('cubo')}Com 3D</span><b>${por100(c)}</b><small>${n(c.pratos)} pratos · ${n(c.vistos)} aberturas</small></div>
      <div><span class="t">Sem 3D</span><b>${por100(s)}</b><small>${n(s.pratos)} pratos · ${n(s.vistos)} aberturas</small></div>
    </div>
    <p class="conclusao">${conclusao}</p>`;

  // horas de movimento
  calor($('#b-horas'), d.mapa);

  // vistos mas pouco pedidos
  $('#b-atencao').innerHTML = `<h3>Muito vistos, pouco pedidos</h3>` + (d.vistosPoucoPedidos.length
    ? `<ul class="lista-simples">${d.vistosPoucoPedidos.map(x => `<li><span>${esc(x.nome)}<br><span class="sec">${n(x.vistos)} aberturas · ${n(x.qtd)} pedidos</span></span><b>${pct(x.conversao)}</b></li>`).join('')}</ul>
       <p class="mudo pequeno">Os clientes abrem estes pratos mas não os pedem. Revê o preço, a foto ou a descrição.</p>`
    : '<p class="nada">Ainda não há pratos com visitas suficientes (mínimo 10).</p>');

  // mesas
  $('#b-mesas').innerHTML = `<h3>Mesas que mais vendem</h3>` + (d.mesas.length
    ? `<ul class="lista-simples">${d.mesas.map(x => `<li><span>${/^\d+$/.test(x.mesa) ? `Mesa ${esc(x.mesa)}` : esc(x.mesa)}<br><span class="sec">${n(x.pedidos)} pedidos</span></span><b>${n(x.vendas)} ${m}</b></li>`).join('')}</ul>`
    : '<p class="nada">Ainda não há pedidos neste período.</p>');
}

// ---------- gráfico de linha (uma medida por gráfico) ----------
let dica = null;
function linha(el, titulo, serie, campo, formato) {
  dica ||= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'dica-grafico oculto' });
  const valores = serie.map(x => x[campo]);
  const total = valores.reduce((p, q) => p + q, 0);
  const W = 360, H = 150, L = 34, R = 8, T = 10, B = 22;
  const max = Math.max(4, ...valores);
  const passo = Math.pow(10, Math.floor(Math.log10(max)));
  const topo = Math.ceil(max / passo) * passo;
  const N = serie.length;
  const x = i => L + (i / (N - 1)) * (W - L - R);
  const y = v => T + (1 - v / topo) * (H - T - B);
  const pts = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const curto = v => v >= 1e6 ? `${(v / 1e6).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} M` : v >= 1e3 ? `${Math.round(v / 1e3)} mil` : n(v);
  const dia = iso => { const [, mm, dd] = iso.split('-'); return `${Number(dd)}/${Number(mm)}`; };
  const marcas = [0, Math.floor((N - 1) / 2), N - 1];
  el.innerHTML = `
    <div class="grafico-cab"><h3>${titulo}</h3><strong>${formato(total)}</strong></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${titulo}: total ${formato(total)}">
      ${[0, topo / 2, topo].map(t => `<line class="grelha" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="eixo" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${curto(t)}</text>`).join('')}
      <path class="area" d="M${x(0)},${y(0)} L${pts.join(' L')} L${x(N - 1)},${y(0)} Z"/>
      <polyline class="linha" points="${pts.join(' ')}"/>
      ${marcas.map((i, k) => `<text class="eixo" x="${x(i)}" y="${H - 4}" text-anchor="${k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}">${dia(serie[i].dia)}</text>`).join('')}
      ${total ? '' : `<text class="vazio-grafico" x="${(L + W - R) / 2}" y="${y(topo / 2) + 4}" text-anchor="middle">Ainda sem pedidos neste período</text>`}
      <line class="cursor oculto" y1="${T}" y2="${H - B}"/><circle class="ponto oculto" r="4.5"/>
      <rect class="alvo" x="${L}" y="0" width="${W - L - R}" height="${H - B}" fill="transparent"/>
    </svg>`;
  const svg = el.querySelector('svg'), cursor = el.querySelector('.cursor'), ponto = el.querySelector('.ponto');
  svg.querySelector('.alvo').addEventListener('pointermove', ev => {
    const box = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(N - 1, Math.round((((ev.clientX - box.left) / box.width) * W - L) / (W - L - R) * (N - 1))));
    cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i)); cursor.classList.remove('oculto');
    ponto.setAttribute('cx', x(i)); ponto.setAttribute('cy', y(valores[i])); ponto.classList.remove('oculto');
    dica.innerHTML = `${new Date(serie[i].dia).toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' })} · <b>${formato(valores[i])}</b>`;
    dica.style.left = `${box.left + (x(i) / W) * box.width}px`;
    dica.style.top = `${box.top + (y(valores[i]) / H) * box.height}px`;
    dica.classList.remove('oculto');
  });
  svg.querySelector('.alvo').addEventListener('pointerleave', () => { cursor.classList.add('oculto'); ponto.classList.add('oculto'); dica.classList.add('oculto'); });
}

// ---------- mapa de calor: dia da semana × hora (uma só cor, claro → escuro) ----------
function cor(t) {
  // laranja Kuvê, claro → escuro: #FDE2D2 → #F26B2A → #7A2E0C
  const a = [[253, 226, 210], [242, 107, 42], [122, 46, 12]];
  const [p, q, k] = t < 0.5 ? [a[0], a[1], t * 2] : [a[1], a[2], (t - 0.5) * 2];
  return `rgb(${p.map((v, i) => Math.round(v + (q[i] - v) * k)).join(',')})`;
}

function calor(el, mapa) {
  const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const totais = Array.from({ length: 24 }, (_, h) => mapa.reduce((s, d) => s + d[h], 0));
  const comDados = totais.map((t, h) => (t ? h : null)).filter(h => h != null);
  const ini = comDados.length ? Math.min(8, comDados[0]) : 8;
  const fim = comDados.length ? Math.max(23, comDados.at(-1)) : 23;
  const horas = Array.from({ length: fim - ini + 1 }, (_, i) => ini + i);
  const max = Math.max(1, ...mapa.flat());
  const pico = mapa.flatMap((d, i) => d.map((v, h) => ({ v, d: i, h }))).sort((p, q) => q.v - p.v)[0];
  el.innerHTML = `<h3>Horas de movimento <small>${pico?.v ? `pico: ${DIAS[pico.d].toLowerCase()} às ${pico.h}h` : 'pedidos por dia e hora'}</small></h3>
    <div class="mapa-calor" style="--horas:${horas.length}" role="img" aria-label="Pedidos por dia da semana e hora">
      <span></span>${horas.map(h => `<span class="hora">${h % 2 === 0 ? h : ''}</span>`).join('')}
      ${mapa.map((linha, d) => `<span class="dia">${DIAS[d]}</span>${horas.map(h => {
        const v = linha[h];
        return `<span class="c" data-t="${DIAS[d]} às ${h}h · ${v} ${v === 1 ? 'pedido' : 'pedidos'}" style="${v ? `background:${cor(v / max)}` : ''}"></span>`;
      }).join('')}`).join('')}
    </div>
    <div class="legenda-calor"><span>menos</span><i></i><span>mais pedidos</span></div>`;
  el.querySelectorAll('.c').forEach(c => {
    c.addEventListener('pointerenter', () => {
      const b = c.getBoundingClientRect();
      dica.innerHTML = c.dataset.t;
      dica.style.left = `${b.left + b.width / 2}px`; dica.style.top = `${b.top}px`;
      dica.classList.remove('oculto');
    });
    c.addEventListener('pointerleave', () => dica.classList.add('oculto'));
  });
}
