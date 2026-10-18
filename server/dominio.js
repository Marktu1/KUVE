// Regras de negócio do Menu 3D num só sítio: estados dos pedidos, pagamentos, permissões, planos.
// O servidor (index.js) usa estas regras; os testes (test/) verificam-nas.

// ---------- pedidos ----------
export const ESTADOS = ['recebido', 'confirmado', 'em_preparacao', 'pronto', 'entregue', 'cancelado'];
export const ROTULO_ESTADO = {
  recebido: 'Recebido', confirmado: 'Confirmado', em_preparacao: 'Em preparação',
  pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado',
};
// Transições permitidas. "recebido → em_preparacao" existe para a cozinha não ter de confirmar primeiro.
export const TRANSICOES = {
  recebido: ['confirmado', 'em_preparacao', 'cancelado'],
  confirmado: ['em_preparacao', 'cancelado'],
  em_preparacao: ['pronto', 'cancelado'],
  pronto: ['entregue'],
  entregue: [],
  cancelado: [],
};
export const ABERTOS = ['recebido', 'confirmado', 'em_preparacao', 'pronto'];
export const podeMudar = (de, para) => (TRANSICOES[de] || []).includes(para);
// Estados das versões anteriores
export const ESTADO_ANTIGO = { novo: 'recebido', 'a preparar': 'em_preparacao' };

// ---------- pagamentos ----------
// Registo manual de quem recebeu o dinheiro. Não é faturação fiscal.
export const METODOS = { dinheiro: 'Dinheiro', multicaixa: 'Multicaixa Express', tpa: 'TPA (cartão)', transferencia: 'Transferência' };

// ---------- equipa ----------
export const PERMISSOES = {
  pedidos: 'Ver pedidos e mudar o estado',
  cancelar: 'Cancelar pedidos',
  pagamentos: 'Registar pagamentos',
  mesas: 'Ver mesas e libertá-las',
  esgotados: 'Marcar pratos esgotados',
};
export const PERMISSOES_DA_FUNCAO = {
  rececao: ['pedidos', 'cancelar', 'pagamentos', 'mesas', 'esgotados'],
  empregado: ['pedidos', 'pagamentos', 'mesas', 'esgotados'],
  cozinha: ['pedidos', 'esgotados'],
};
export const permissoesDe = m => (Array.isArray(m.permissoes) ? m.permissoes : PERMISSOES_DA_FUNCAO[m.funcao] || ['pedidos'])
  .filter(p => Object.hasOwn(PERMISSOES, p));

// ---------- planos SaaS ----------
export const FUNCIONALIDADES = {
  pedidos: 'Pedidos pelo telemóvel',
  mesas: 'Gestão de mesas',
  equipa: 'Equipa com PIN',
  pagamentos: 'Registo de pagamentos',
  painel: 'Painel de vendas',
  impresso: 'Menu impresso em AR',
  ia3d: 'IA: foto → 3D',
  identidade: 'Identidade visual personalizada',
};
export const LIMITES = { pratos: 'Pratos', modelos3d: 'Pratos com 3D', mesas: 'Mesas', equipa: 'Pessoas na equipa' };
const todas = Object.keys(FUNCIONALIDADES);
// Valores de partida. Os preços são exemplos a validar com os restaurantes-piloto
// e editam-se no painel da plataforma (ficam na base de dados, não no código).
export const PLANOS_INICIAIS = [
  { id: 'teste', nome: 'Teste', precoMensal: 0, ativo: true, limites: { pratos: 60, modelos3d: 10, mesas: 20, equipa: 5 }, funcionalidades: todas },
  { id: 'menu', nome: 'Menu', precoMensal: 15000, ativo: true, limites: { pratos: 60, modelos3d: 10, mesas: 0, equipa: 0 }, funcionalidades: ['identidade'] },
  { id: 'profissional', nome: 'Profissional', precoMensal: 35000, ativo: true, limites: { pratos: 200, modelos3d: 40, mesas: 40, equipa: 10 }, funcionalidades: ['pedidos', 'mesas', 'equipa', 'pagamentos', 'painel', 'identidade'] },
  { id: 'premium', nome: 'Premium', precoMensal: 65000, ativo: true, limites: { pratos: 600, modelos3d: 150, mesas: 150, equipa: 40 }, funcionalidades: todas },
  { id: 'gratis', nome: 'Parceiro (grátis)', precoMensal: 0, ativo: true, limites: { pratos: 600, modelos3d: 150, mesas: 150, equipa: 40 }, funcionalidades: todas },
];
export const PLANO_ANTIGO = { essencial: 'profissional' };

export function limparPlano(p, base = {}) {
  const n = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100000, Math.round(Number(v)))) : d);
  const limites = {};
  for (const k of Object.keys(LIMITES)) limites[k] = n(p.limites?.[k], base.limites?.[k] ?? 0);
  return {
    id: base.id || String(p.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30),
    nome: String(p.nome ?? base.nome ?? '').trim().slice(0, 40) || base.nome || 'Plano',
    precoMensal: n(p.precoMensal, base.precoMensal ?? 0),
    ativo: p.ativo === undefined ? base.ativo !== false : Boolean(p.ativo),
    limites,
    funcionalidades: (Array.isArray(p.funcionalidades) ? p.funcionalidades : base.funcionalidades || []).filter(f => Object.hasOwn(FUNCIONALIDADES, f)),
  };
}

// ---------- migrações ----------
// Corre no arranque; cada versão só corre uma vez.
export function migrar(db, { novoCodigo }) {
  const v = db.versao || 1;
  if (v < 2) {
    for (const o of db.orders) {
      if (ESTADO_ANTIGO[o.status]) o.status = ESTADO_ANTIGO[o.status];
      for (const h of o.historico || []) if (ESTADO_ANTIGO[h.estado]) h.estado = ESTADO_ANTIGO[h.estado];
      o.pagamento ||= { estado: 'por_pagar' };
    }
    for (const r of db.restaurants) {
      if (!Array.isArray(r.mesas)) {
        r.mesas = Array.from({ length: Math.max(0, Number(r.tables) || 0) }, (_, i) => ({
          id: novoCodigo(8), nome: String(i + 1), codigo: novoCodigo(10), ativa: true, criadaEm: new Date().toISOString(), libertadaEm: '',
        }));
      }
      if (PLANO_ANTIGO[r.plano]) r.plano = PLANO_ANTIGO[r.plano];
      r.plano ||= 'teste';
    }
    db.plataforma.planos ||= structuredClone(PLANOS_INICIAIS);
    db.versao = 2;
  }
  return db;
}
