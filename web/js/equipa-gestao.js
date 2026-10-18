// Gestão da equipa (só o gerente): PINs, funções, ativar/desativar
import { esc } from './comum.js';

const $ = s => document.querySelector(s);
let ctx = null, ligado = false, membros = [];
const FUNCAO = { rececao: 'Receção', empregado: 'Empregado de mesa', cozinha: 'Cozinha' };
const PERMISSOES = { pedidos: 'Pedidos', cancelar: 'Cancelar', pagamentos: 'Pagamentos', mesas: 'Mesas', esgotados: 'Esgotados' };
const PERM_FUNC = { pagamentos: 'pagamentos', mesas: 'mesas' };   // estas só aparecem se o plano as incluir
const ICONE = id => `<svg class="ic" aria-hidden="true"><use href="/img/icones.svg#${id}"/></svg>`;

export async function abrir(contexto) {
  ctx = contexto;
  const rest = ctx.obterRestaurante();
  const url = `${location.origin}/equipa`;
  $('#link-equipa').href = url;
  $('#link-equipa').textContent = url.replace(/^https?:\/\//, '');
  $('#codigo-equipa').textContent = rest.slug;
  if (!ligado) { ligar(); ligado = true; }
  await carregar();
}

const base = () => `/api/restaurants/${ctx.sess.id}/equipa`;

async function carregar() {
  try {
    ({ equipa: membros } = await ctx.api(base(), { key: ctx.chave() }));
    pintar();
  } catch (err) { ctx.toast(err.message); }
}

function mostrarPin(nome, pin) {
  const rest = ctx.obterRestaurante();
  const el = $('#pin-novo');
  el.innerHTML = `<p>PIN de <b>${esc(nome)}</b>. Mostra-o só a essa pessoa; não volta a aparecer.</p>
    <span class="pin">${esc(pin)}</span>
    <p>Para entrar: ${esc(location.host)}/equipa · código <b>${esc(rest.slug)}</b></p>`;
  el.classList.remove('oculto');
}

function pintar() {
  const quando = iso => iso ? new Date(iso).toLocaleString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'nunca entrou';
  $('#membros').innerHTML = membros.length ? membros.map(m => `
    <li class="membro${m.ativo ? '' : ' inativo'}">
      <span class="avatar">${esc(m.nome.trim()[0]?.toUpperCase() || '')}</span>
      <span><strong>${esc(m.nome)}</strong><small>${FUNCAO[m.funcao] || m.funcao} · ${m.ativo ? `última entrada: ${quando(m.ultimaEntrada)}` : 'acesso desativado'}</small>
        <span class="permissoes" role="group" aria-label="O que ${esc(m.nome)} pode fazer">${Object.entries(PERMISSOES)
          .filter(([p]) => !PERM_FUNC[p] || (ctx.obterRestaurante().funcionalidades || []).includes(PERM_FUNC[p]))
          .map(([p, nome]) => `<label class="perm"><input type="checkbox" data-perm="${p}" data-membro="${m.id}" ${m.permissoes.includes(p) ? 'checked' : ''}><span>${nome}</span></label>`).join('')}</span>
      </span>
      <span class="acoes">
        <label class="interruptor" title="${m.ativo ? 'Desativar acesso' : 'Ativar acesso'}"><input type="checkbox" data-ativo="${m.id}" ${m.ativo ? 'checked' : ''}><span class="sr">Acesso ativo</span></label>
        <button class="btn fantasma pequeno" data-pin="${m.id}">Novo PIN</button>
        <button class="btn fantasma pequeno icone" data-rm="${m.id}" aria-label="Remover ${esc(m.nome)}">${ICONE('lixo')}</button>
      </span>
    </li>`).join('') : '<li class="mudo" style="padding:12px 0">Ainda não há ninguém na equipa. Adiciona a primeira pessoa acima.</li>';
}

function ligar() {
  $('#f-membro').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      const r = await ctx.api(base(), { method: 'POST', key: ctx.chave(), body: { nome: f.nome.value, funcao: f.funcao.value } });
      mostrarPin(r.membro.nome, r.pin);
      f.reset();
      await carregar();
    } catch (err) { ctx.toast(err.message); }
  });

  $('#membros').addEventListener('change', async e => {
    if (e.target.dataset.perm) {
      const m = membros.find(x => x.id === e.target.dataset.membro);
      const permissoes = [...document.querySelectorAll(`[data-membro="${m.id}"][data-perm]`)].filter(x => x.checked).map(x => x.dataset.perm);
      // manter as permissões que o plano esconde (para não as perder se o plano mudar)
      for (const p of m.permissoes) if (PERM_FUNC[p] && !(ctx.obterRestaurante().funcionalidades || []).includes(PERM_FUNC[p])) permissoes.push(p);
      try {
        await ctx.api(`${base()}/${m.id}`, { method: 'PATCH', key: ctx.chave(), body: { permissoes } });
        m.permissoes = permissoes;
        ctx.toast(`${m.nome}: permissões guardadas. Vale na próxima vez que entrar.`);
      } catch (err) { ctx.toast(err.message); e.target.checked = !e.target.checked; }
      return;
    }
    const id = e.target.dataset.ativo;
    if (!id) return;
    try {
      await ctx.api(`${base()}/${id}`, { method: 'PATCH', key: ctx.chave(), body: { ativo: e.target.checked } });
      ctx.toast(e.target.checked ? 'Acesso ativado' : 'Acesso desativado em todos os aparelhos');
      await carregar();
    } catch (err) { ctx.toast(err.message); }
  });

  $('#membros').addEventListener('click', async e => {
    const pin = e.target.closest('[data-pin]'), rm = e.target.closest('[data-rm]');
    const m = membros.find(x => x.id === (pin || rm)?.dataset[pin ? 'pin' : 'rm']);
    if (!m) return;
    try {
      if (pin) {
        if (!confirm(`Gerar um PIN novo para ${m.nome}? O PIN antigo deixa de funcionar.`)) return;
        const r = await ctx.api(`${base()}/${m.id}/novo-pin`, { method: 'POST', key: ctx.chave() });
        mostrarPin(m.nome, r.pin);
      } else {
        if (!confirm(`Remover ${m.nome} da equipa? O acesso termina logo.`)) return;
        await ctx.api(`${base()}/${m.id}`, { method: 'DELETE', key: ctx.chave() });
        ctx.toast(`${m.nome} saiu da equipa`);
      }
      await carregar();
    } catch (err) { ctx.toast(err.message); }
  });
}
