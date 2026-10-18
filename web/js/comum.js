// Utilidades partilhadas pelas páginas do Menu 3D
export async function api(path, { method = 'GET', body, key, form } = {}) {
  const headers = {};
  if (key) headers['x-admin-key'] = key;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(path, { method, headers, body: payload });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function dinheiro(n, moeda = 'Kz') {
  return `${Number(n || 0).toLocaleString('pt-PT', { maximumFractionDigits: 2 })} ${moeda}`;
}

let toastTimer;
export function toast(msg, ms = 2600) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.remove('oculto');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('oculto'), ms);
}

// Cor do restaurante → acento da página (garante contraste mínimo com branco)
export function aplicarCor(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  document.documentElement.style.setProperty('--acento', lum > 0.35 ? '#1E2522' : hex);
}

export const ALERGENOS = ['Glúten', 'Crustáceos', 'Ovos', 'Peixe', 'Amendoim', 'Soja', 'Leite', 'Frutos secos',
  'Aipo', 'Mostarda', 'Sésamo', 'Sulfitos', 'Tremoço', 'Moluscos'];

// Evento anónimo para as estatísticas da plataforma (sem dados pessoais)
export function evento(slug, tipo, dishId) {
  try {
    const corpo = new Blob([JSON.stringify({ tipo, dishId })], { type: 'application/json' });
    if (!navigator.sendBeacon?.(`/api/menu/${encodeURIComponent(slug)}/evento`, corpo)) {
      fetch(`/api/menu/${encodeURIComponent(slug)}/evento`, { method: 'POST', body: corpo, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
    }
  } catch { /* estatística nunca bloqueia o cliente */ }
}
