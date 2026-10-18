// Temas do menu do cliente: cada restaurante tem a sua identidade.
// Este ficheiro é partilhado: o servidor usa os dados e limparTema(); o browser usa aplicarTema().

export const LETRAS = {
  titulo: {
    bricolage: { nome: 'Bricolage Grotesque', q: 'Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800', tipo: 'sans', estilo: 'Moderna' },
    fraunces: { nome: 'Fraunces', q: 'Fraunces:opsz,wght@9..144,500;9..144,700;9..144,800', tipo: 'serif', estilo: 'Clássica calorosa' },
    playfair: { nome: 'Playfair Display', q: 'Playfair+Display:wght@500;700;800', tipo: 'serif', estilo: 'Elegante' },
    dmserif: { nome: 'DM Serif Display', q: 'DM+Serif+Display', tipo: 'serif', estilo: 'Revista' },
    cormorant: { nome: 'Cormorant Garamond', q: 'Cormorant+Garamond:wght@500;600;700', tipo: 'serif', estilo: 'Fine dining' },
    syne: { nome: 'Syne', q: 'Syne:wght@600;700;800', tipo: 'sans', estilo: 'Arrojada' },
    spacegrotesk: { nome: 'Space Grotesk', q: 'Space+Grotesk:wght@500;600;700', tipo: 'sans', estilo: 'Técnica' },
    archivoblack: { nome: 'Archivo Black', q: 'Archivo+Black', tipo: 'sans', estilo: 'Forte' },
    abril: { nome: 'Abril Fatface', q: 'Abril+Fatface', tipo: 'serif', estilo: 'Cartaz' },
    josefin: { nome: 'Josefin Sans', q: 'Josefin+Sans:wght@600;700', tipo: 'sans', estilo: 'Geométrica' },
    unbounded: { nome: 'Unbounded', q: 'Unbounded:wght@600;700;800', tipo: 'sans', estilo: 'Larga' },
    caveat: { nome: 'Caveat', q: 'Caveat:wght@600;700', tipo: 'cursive', estilo: 'Manuscrita' },
  },
  texto: {
    figtree: { nome: 'Figtree', q: 'Figtree:wght@400;500;600;700', tipo: 'sans' },
    dmsans: { nome: 'DM Sans', q: 'DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700', tipo: 'sans' },
    outfit: { nome: 'Outfit', q: 'Outfit:wght@400;500;600;700', tipo: 'sans' },
    manrope: { nome: 'Manrope', q: 'Manrope:wght@400;500;600;700', tipo: 'sans' },
    worksans: { nome: 'Work Sans', q: 'Work+Sans:wght@400;500;600;700', tipo: 'sans' },
    karla: { nome: 'Karla', q: 'Karla:wght@400;500;600;700', tipo: 'sans' },
    nunitosans: { nome: 'Nunito Sans', q: 'Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700', tipo: 'sans' },
    lora: { nome: 'Lora', q: 'Lora:wght@400;500;600;700', tipo: 'serif' },
    librefranklin: { nome: 'Libre Franklin', q: 'Libre+Franklin:wght@400;500;600;700', tipo: 'sans' },
  },
};

export const OPCOES = {
  cantos: { reto: 'Retos', suave: 'Suaves', redondo: 'Redondos' },
  botoes: { pilula: 'Pílula', suave: 'Arredondados', reto: 'Retos' },
  prato: { porcelana: 'Porcelana branca', preto: 'Porcelana preta', ardosia: 'Ardósia', madeira: 'Tábua de madeira', barro: 'Barro', sem: 'Sem prato (foto)' },
  disposicao: { lista: 'Lista com pratos', grelha: 'Grelha de cartões', fotos: 'Fotos grandes' },
  cabecalho: { classico: 'Clássico', centrado: 'Centrado com logo', capa: 'Foto de capa' },
  textura: { linho: 'Linho', papel: 'Papel', madeira: 'Madeira', liso: 'Liso', escuro: 'Escuro' },
  luz: { neutra: 'Neutra', suave: 'Suave', dramatica: 'Dramática' },
  movimento: { calmo: 'Calmo', vivo: 'Vivo' },
  'logo.forma': { circulo: 'Redondo', arredondado: 'Quadrado suave', livre: 'Original (sem recorte)' },
  'logo.tamanho': { pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande' },
};

export const TEXTOS_PADRAO = {
  dica3d: 'Os pratos com este sinal podem ser postos na tua mesa, em tamanho real.',
  botaoAR: 'Ver na minha mesa',
  adicionar: 'Adicionar',
  enviar: 'Enviar pedido',
  destaques: 'Sugestões do chefe',
  rodape: '',
};

const DIAS_PADRAO = Array.from({ length: 7 }, () => ({ aberto: true, abre: '12:00', fecha: '23:00' }));

export const PADRAO = {
  base: 'porcelana',
  cores: { fundo: '#F5F5F1', superficie: '#FFFFFF', texto: '#18201D', suave: '#5F6B63', acento: '#C8322B', destaque: '#E3A532' },
  letras: { titulo: 'bricolage', texto: 'figtree' },
  cantos: 'suave', botoes: 'pilula', prato: 'porcelana', disposicao: 'lista', cabecalho: 'classico',
  textura: 'linho', luz: 'neutra', movimento: 'calmo',
  capaUrl: '',
  logo: { forma: 'circulo', tamanho: 'medio', fundo: true, noLugarDoNome: false },
  textos: { ...TEXTOS_PADRAO },
  aviso: { ativo: false, texto: '', ate: '' },
  destaques: [],
  horario: { ativo: false, pedidosFora: false, dias: DIAS_PADRAO },
  contactos: { instagram: '', facebook: '', tiktok: '', telefone: '', morada: '', mapa: '', site: '' },
  marcaMenu3D: true,
  cssExtra: '',
};

// Estilos de partida. Cada um muda cores, letras, formas, prato e disposição.
export const PREDEFINIDOS = {
  porcelana: {
    nome: 'Porcelana', resumo: 'Claro e calmo. Bom para quase tudo.',
    cores: { fundo: '#F5F5F1', superficie: '#FFFFFF', texto: '#18201D', suave: '#5F6B63', acento: '#C8322B', destaque: '#E3A532' },
    letras: { titulo: 'bricolage', texto: 'figtree' },
    cantos: 'suave', botoes: 'pilula', prato: 'porcelana', disposicao: 'lista', cabecalho: 'classico', textura: 'linho', luz: 'neutra',
  },
  noite: {
    nome: 'Noite', resumo: 'Escuro e dourado, para jantares especiais.',
    cores: { fundo: '#13110F', superficie: '#1E1B18', texto: '#F2ECE2', suave: '#A99F91', acento: '#C9A45C', destaque: '#C9A45C' },
    letras: { titulo: 'cormorant', texto: 'dmsans' },
    cantos: 'reto', botoes: 'reto', prato: 'preto', disposicao: 'lista', cabecalho: 'capa', textura: 'escuro', luz: 'dramatica',
  },
  mercado: {
    nome: 'Mercado', resumo: 'Cores vivas e letras fortes, de rua.',
    cores: { fundo: '#FFF3DC', superficie: '#FFFFFF', texto: '#2A1405', suave: '#7A5B40', acento: '#E4572E', destaque: '#1FA88F' },
    letras: { titulo: 'syne', texto: 'outfit' },
    cantos: 'redondo', botoes: 'pilula', prato: 'barro', disposicao: 'grelha', cabecalho: 'centrado', textura: 'papel', luz: 'neutra', movimento: 'vivo',
  },
  tasca: {
    nome: 'Tasca', resumo: 'Papel, madeira e serifa. Cozinha de casa.',
    cores: { fundo: '#F1E7D3', superficie: '#FBF6EC', texto: '#33241A', suave: '#7B6450', acento: '#8E2C1C', destaque: '#D19A3B' },
    letras: { titulo: 'playfair', texto: 'lora' },
    cantos: 'suave', botoes: 'suave', prato: 'madeira', disposicao: 'lista', cabecalho: 'classico', textura: 'madeira', luz: 'suave',
  },
  mar: {
    nome: 'Marisqueira', resumo: 'Fresco, azul e com fotos grandes.',
    cores: { fundo: '#F2F8F8', superficie: '#FFFFFF', texto: '#0D2C36', suave: '#4E6E78', acento: '#0E7C86', destaque: '#FFB703' },
    letras: { titulo: 'fraunces', texto: 'nunitosans' },
    cantos: 'redondo', botoes: 'pilula', prato: 'porcelana', disposicao: 'fotos', cabecalho: 'capa', textura: 'liso', luz: 'neutra',
  },
  brasa: {
    nome: 'Brasa', resumo: 'Preto e laranja, para grelhados e hambúrgueres.',
    cores: { fundo: '#151413', superficie: '#211F1D', texto: '#FAF6F0', suave: '#B4ABA0', acento: '#FF6A1A', destaque: '#FFC93C' },
    letras: { titulo: 'archivoblack', texto: 'worksans' },
    cantos: 'reto', botoes: 'reto', prato: 'ardosia', disposicao: 'grelha', cabecalho: 'centrado', textura: 'escuro', luz: 'dramatica', movimento: 'vivo',
  },
};

// ---------------- cor ----------------
export const hexValido = h => /^#[0-9a-f]{6}$/i.test(h || '');
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = c => '#' + c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
export const misturar = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v * t + B[i] * (1 - t))); };
export function luminancia(h) {
  const [r, g, b] = rgb(h).map(v => v / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
// texto legível sobre uma cor de fundo
export const textoSobre = (fundo, claro = '#FFFFFF', escuro = '#161616') =>
  contraste(fundo, claro) >= contraste(fundo, escuro) ? claro : escuro;
export const escuro = t => luminancia(t.cores.fundo) < 0.2;

// ---------------- limpeza (servidor) ----------------
const s = (v, max) => (v == null ? '' : String(v).slice(0, max).trim());
const um = (v, lista, d) => (Object.hasOwn(lista, v) ? v : d);
const hora = (v, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v || '') ? v : d);
const urlSegura = v => { const u = s(v, 300); return /^https:\/\/[^\s<>"']+$/i.test(u) ? u : ''; };
const caminhoUpload = v => { const u = s(v, 300); return /^\/uploads\/[\w./-]+$/.test(u) && !u.includes('..') ? u : ''; };

export function limparCss(css) {
  return s(css, 4000)
    .replace(/<\/?\w[^>]*>?/g, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/url\(\s*(?!['"]?\/uploads\/)/gi, 'url(about:invalid ');
}

export function limparTema(t, idsPratos = []) {
  t = t && typeof t === 'object' ? t : {};
  const p = PADRAO;
  const cores = {};
  for (const k of Object.keys(p.cores)) cores[k] = hexValido(t.cores?.[k]) ? t.cores[k].toUpperCase() : p.cores[k];
  const textos = {};
  for (const k of Object.keys(TEXTOS_PADRAO)) textos[k] = s(t.textos?.[k], k === 'dica3d' || k === 'rodape' ? 160 : 40) || TEXTOS_PADRAO[k];
  if (!s(t.textos?.rodape, 160)) textos.rodape = '';
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = t.horario?.dias?.[i] || {};
    return { aberto: d.aberto !== false, abre: hora(d.abre, '12:00'), fecha: hora(d.fecha, '23:00') };
  });
  const ig = s(t.contactos?.instagram, 40).replace(/^@/, '').replace(/[^\w.]/g, '');
  const tk = s(t.contactos?.tiktok, 40).replace(/^@/, '').replace(/[^\w.]/g, '');
  const fb = s(t.contactos?.facebook, 80).replace(/[^\w.-]/g, '');
  return {
    base: um(t.base, PREDEFINIDOS, 'porcelana'),
    cores,
    letras: { titulo: um(t.letras?.titulo, LETRAS.titulo, p.letras.titulo), texto: um(t.letras?.texto, LETRAS.texto, p.letras.texto) },
    cantos: um(t.cantos, OPCOES.cantos, p.cantos),
    botoes: um(t.botoes, OPCOES.botoes, p.botoes),
    prato: um(t.prato, OPCOES.prato, p.prato),
    disposicao: um(t.disposicao, OPCOES.disposicao, p.disposicao),
    cabecalho: um(t.cabecalho, OPCOES.cabecalho, p.cabecalho),
    textura: um(t.textura, OPCOES.textura, p.textura),
    luz: um(t.luz, OPCOES.luz, p.luz),
    movimento: um(t.movimento, OPCOES.movimento, p.movimento),
    capaUrl: caminhoUpload(t.capaUrl),
    logo: {
      forma: um(t.logo?.forma, OPCOES['logo.forma'], 'circulo'),
      tamanho: um(t.logo?.tamanho, OPCOES['logo.tamanho'], 'medio'),
      fundo: t.logo?.fundo !== false,
      noLugarDoNome: Boolean(t.logo?.noLugarDoNome),
    },
    textos,
    aviso: { ativo: Boolean(t.aviso?.ativo) && Boolean(s(t.aviso?.texto, 140)), texto: s(t.aviso?.texto, 140), ate: /^\d{4}-\d{2}-\d{2}$/.test(t.aviso?.ate || '') ? t.aviso.ate : '' },
    destaques: (Array.isArray(t.destaques) ? t.destaques : []).map(x => s(x, 20)).filter(id => idsPratos.includes(id)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 8),
    horario: { ativo: Boolean(t.horario?.ativo), pedidosFora: Boolean(t.horario?.pedidosFora), dias },
    contactos: {
      instagram: ig, tiktok: tk, facebook: fb,
      telefone: s(t.contactos?.telefone, 24).replace(/[^\d+ ]/g, ''),
      morada: s(t.contactos?.morada, 140),
      mapa: urlSegura(t.contactos?.mapa),
      site: urlSegura(t.contactos?.site),
    },
    marcaMenu3D: t.marcaMenu3D !== false,
    cssExtra: limparCss(t.cssExtra),
  };
}

// Junta um estilo de partida a um tema existente, mantendo os conteúdos (textos, horário, contactos…)
export function comPredefinido(tema, id) {
  const pre = PREDEFINIDOS[id];
  if (!pre) return tema;
  const { nome, resumo, ...visual } = pre;
  return { ...tema, ...{ movimento: 'calmo' }, ...visual, base: id, cores: { ...visual.cores }, letras: { ...visual.letras } };
}

// ---------------- horário ----------------
// dias: 0 = domingo … 6 = sábado (como Date.getDay). "fecha" antes de "abre" = passa da meia-noite.
const minutos = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
export function estadoHorario(horario, agora = new Date(), fuso = 'Africa/Luanda') {
  if (!horario?.ativo) return { aberto: true, ativo: false };
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: fuso, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(agora).map(x => [x.type, x.value]));
  const dia = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[partes.weekday];
  const m = Number(partes.hour) * 60 + Number(partes.minute);
  const hojeD = horario.dias[dia], ontem = horario.dias[(dia + 6) % 7];
  const dentro = (d, depoisMeiaNoite) => {
    if (!d?.aberto) return false;
    const a = minutos(d.abre), f = minutos(d.fecha);
    if (f > a) return !depoisMeiaNoite && m >= a && m < f;
    return depoisMeiaNoite ? m < f : m >= a;
  };
  if (dentro(hojeD, false)) return { aberto: true, ativo: true, fecha: hojeD.fecha };
  if (dentro(ontem, true)) return { aberto: true, ativo: true, fecha: ontem.fecha };
  // próxima abertura
  for (let k = 0; k < 7; k++) {
    const d = horario.dias[(dia + k) % 7];
    if (!d.aberto) continue;
    if (k === 0 && minutos(d.abre) <= m) continue;
    return { aberto: false, ativo: true, abre: d.abre, quando: k === 0 ? 'hoje' : k === 1 ? 'amanhã' : ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][(dia + k) % 7] };
  }
  return { aberto: false, ativo: true };
}

// ---------------- aplicar no browser ----------------
const pilha = tipo => (tipo === 'serif' ? 'Georgia, "Times New Roman", serif' : tipo === 'cursive' ? 'cursive' : 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif');
// letras servidas pelo próprio servidor (scripts/letras.mjs), sem depender do Google
export const urlsLetras = t => [`/vendor/letras/${t.letras.titulo}.css`, `/vendor/letras/${t.letras.texto}.css`];

function texturaCss(t) {
  const { fundo, texto } = t.cores;
  const [r, g, b] = rgb(texto);
  const tinta = a => `rgba(${r},${g},${b},${a})`;
  const base = misturar(texto, fundo, escuro(t) ? 0.04 : 0.06);
  switch (t.textura) {
    case 'papel': return `radial-gradient(${tinta(.05)} .7px, transparent .8px) 0 0/6px 6px, radial-gradient(120% 90% at 50% 35%, ${fundo} 0%, ${base} 100%)`;
    case 'madeira': return 'repeating-linear-gradient(92deg, rgba(60,30,10,.08) 0 2px, transparent 2px 9px, rgba(60,30,10,.05) 9px 10px, transparent 10px 23px), linear-gradient(180deg, #A9784C, #8E6038)';
    case 'liso': return base;
    case 'escuro': return `radial-gradient(110% 80% at 50% 30%, ${misturar('#FFFFFF', fundo, 0.05)} 0%, ${misturar('#000000', fundo, 0.35)} 100%)`;
    default: return `repeating-linear-gradient(0deg, ${tinta(.02)} 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, ${tinta(.02)} 0 1px, transparent 1px 3px), radial-gradient(120% 90% at 50% 40%, ${misturar(texto, fundo, 0.02)} 0%, ${base} 100%)`;
  }
}

const PRATOS = {
  porcelana: 'radial-gradient(circle at 50% 50%, #FFFFFF 0 52%, #F1F2EE 53% 56%, #FFFFFF 57% 66%, #E9EAE5 67% 69%, transparent 70%)',
  preto: 'radial-gradient(circle at 50% 50%, #1D1D1D 0 52%, #2B2B2B 53% 56%, #1F1F1F 57% 66%, #383838 67% 69%, transparent 70%)',
  ardosia: 'radial-gradient(circle at 38% 32%, rgba(255,255,255,.07), transparent 45%), radial-gradient(circle at 50% 50%, #34393D 0 66%, #2A2E31 67% 69%, transparent 70%)',
  madeira: 'radial-gradient(circle at 50% 50%, transparent 0 66%, #7C5232 67% 69%, transparent 70%), repeating-radial-gradient(circle at 44% 56%, #C89660 0 3px, #B98550 3px 7px, #C28E58 7px 11px)',
  barro: 'radial-gradient(circle at 50% 50%, #C8714A 0 54%, #B5623D 55% 60%, #C97650 61% 66%, #A5533A 67% 69%, transparent 70%)',
  sem: 'transparent',
};
const CANTOS = { reto: [2, 4, 6, 8, 12], suave: [6, 10, 16, 24, 32], redondo: [10, 16, 24, 32, 40] };
const BOTOES = { pilula: '999px', suave: '12px', reto: '3px' };
export const LUZ = {
  neutra: { 'environment-image': 'neutral', exposure: '1.05', 'shadow-intensity': '1.15', 'shadow-softness': '0.85' },
  suave: { 'environment-image': 'legacy', exposure: '0.95', 'shadow-intensity': '0.8', 'shadow-softness': '1' },
  dramatica: { 'environment-image': 'neutral', exposure: '0.85', 'shadow-intensity': '1.6', 'shadow-softness': '0.4' },
};

// variáveis CSS que o tema define (as mesmas de base.css, para tudo o resto continuar a funcionar)
export function variaveis(t) {
  const c = t.cores, dark = escuro(t);
  const [xs, sm, m, l, xl] = CANTOS[t.cantos];
  const ta = LETRAS.titulo[t.letras.titulo], tt = LETRAS.texto[t.letras.texto];
  return {
    '--porcelana': c.fundo,
    '--branco': c.superficie,
    '--tinta': c.texto,
    '--tinta-2': misturar(c.texto, c.fundo, 0.88),
    '--musgo': c.suave,
    '--nevoa': misturar(c.suave, c.fundo, 0.72),
    '--linha': misturar(c.texto, c.fundo, dark ? 0.14 : 0.1),
    '--linha-forte': misturar(c.texto, c.fundo, dark ? 0.24 : 0.18),
    '--mesa': misturar(c.texto, c.fundo, dark ? 0.08 : 0.05),
    '--acento': c.acento,
    '--acento-texto': textoSobre(c.acento),
    '--dende': c.destaque,
    '--destaque-texto': textoSobre(c.destaque),
    '--dende-escuro': dark ? c.destaque : misturar('#000000', c.destaque, 0.55),
    '--sombra-cor': dark ? '0,0,0' : rgb(c.texto).join(','),
    '--f-titulo': `"${ta.nome}", ${pilha(ta.tipo)}`,
    '--f-texto': `"${tt.nome}", ${pilha(tt.tipo)}`,
    '--r-xs': `${xs}px`, '--r-s': `${sm}px`, '--r-m': `${m}px`, '--r-l': `${l}px`, '--r-xl': `${xl}px`,
    '--r-botao': BOTOES[t.botoes],
    '--prato': PRATOS[t.prato],
    '--linho': texturaCss(t),
  };
}

export function aplicarTema(t, doc = document) {
  const raiz = doc.documentElement;
  for (const [k, v] of Object.entries(variaveis(t))) raiz.style.setProperty(k, v);
  Object.assign(doc.body.dataset, {
    disposicao: t.disposicao, cabecalho: t.cabecalho, prato: t.prato, textura: t.textura, movimento: t.movimento, escuro: String(escuro(t)),
    letraTitulo: t.letras.titulo,
    logoForma: t.logo.forma, logoTamanho: t.logo.tamanho, logoFundo: String(t.logo.fundo), logoNome: String(t.logo.noLugarDoNome),
  });
  // letras
  urlsLetras(t).forEach((url, i) => {
    let link = doc.getElementById(`letras-tema-${i}`);
    if (!link) { link = doc.createElement('link'); link.id = `letras-tema-${i}`; link.rel = 'stylesheet'; doc.head.append(link); }
    if (link.getAttribute('href') !== url) link.setAttribute('href', url);
  });
  // cor do navegador
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.cores.fundo);
  // CSS extra (só a plataforma o escreve)
  let estilo = doc.getElementById('css-extra');
  if (!estilo) { estilo = doc.createElement('style'); estilo.id = 'css-extra'; doc.head.append(estilo); }
  estilo.textContent = t.cssExtra || '';
}
