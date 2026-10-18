// Cena do menu impresso — partilhada pelo editor (pré-visualização 3D) e pela página de AR.
// Referencial do alvo (MindAR): o menu tem largura 1, origem no centro, Z a sair do papel.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const carregador = new GLTFLoader();
const cacheModelos = new Map();
const cacheTexturas = new Map();

// Cenas antigas (só pontos) → itens do editor
export function cenaDoRestaurante(print) {
  if (Array.isArray(print?.scene)) return print.scene;
  return (print?.hotspots || []).map((h, i) => ({
    id: `p${i}`, tipo: 'prato', dishId: h.dishId, x: h.x, y: h.y,
    tamanho: 0.35, rotacao: 0, altura: 0, deitado: false, quando: 'toque', animacao: 'salto',
  }));
}

export function novoId() {
  return Math.random().toString(36).slice(2, 9);
}

async function modelo(url) {
  if (!cacheModelos.has(url)) cacheModelos.set(url, carregador.loadAsync(url).then(g => g.scene));
  return (await cacheModelos.get(url)).clone(true);
}

function textura(url) {
  if (!cacheTexturas.has(url)) {
    cacheTexturas.set(url, new THREE.TextureLoader().loadAsync(url).then(t => { t.encoding = THREE.sRGBEncoding; return t; }));
  }
  return cacheTexturas.get(url);
}

function claro(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150;
}

function texturaTexto(texto, fundo) {
  const escala = 4, alto = 64 * escala, margem = 28 * escala;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const fonte = `600 ${30 * escala}px "Bricolage Grotesque", "Figtree", system-ui, sans-serif`;
  ctx.font = fonte;
  const largura = Math.ceil(ctx.measureText(texto).width) + margem * 2;
  c.width = largura; c.height = alto;
  ctx.font = fonte;
  ctx.fillStyle = fundo;
  ctx.beginPath();
  ctx.roundRect(0, 0, largura, alto, alto / 2);
  ctx.fill();
  ctx.fillStyle = claro(fundo) ? '#1E2522' : '#FFFFFF';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, margem, alto / 2 + escala * 2);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  return { textura: t, aspeto: alto / largura };
}

function plano(map, largura, aspeto, deitado) {
  const g = new THREE.PlaneGeometry(largura, largura * aspeto);
  if (!deitado) g.translate(0, (largura * aspeto) / 2, 0);   // base pousada no papel
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map, transparent: true, side: THREE.DoubleSide, toneMapped: false }));
}

export class Cena {
  /**
   * raiz   — THREE.Group onde a cena vive (âncora do MindAR ou grupo da pré-visualização)
   * aspeto — altura/largura da imagem do menu
   * pratos — lista de pratos do restaurante (para os modelos)
   */
  constructor({ raiz, aspeto, pratos, corPonto = '#E0A12B' }) {
    Object.assign(this, { raiz, aspeto, pratos, corPonto });
    this.objetos = new Map();   // id → { item, grupo, interior, ponto, nascido, visivel }
    this.relogio = new THREE.Clock();
  }

  posicao(item) {
    return new THREE.Vector3(item.x - 0.5, (0.5 - item.y) * this.aspeto, 0);
  }

  limpar() {
    for (const o of this.objetos.values()) { this.raiz.remove(o.grupo); if (o.ponto) this.raiz.remove(o.ponto); }
    this.objetos.clear();
  }

  async montar(itens, { todosVisiveis = false } = {}) {
    this.limpar();
    await Promise.all(itens.map(i => this.adicionar(i, todosVisiveis)));
  }

  async adicionar(item, visivel = false) {
    const grupo = new THREE.Group();      // posição + altura
    const suporte = new THREE.Group();    // de pé: y do conteúdo passa a sair do papel
    const interior = new THREE.Group();   // rotação e animação
    grupo.add(suporte); suporte.add(interior);
    const deitado = item.tipo !== 'prato' && item.deitado;
    if (!deitado) suporte.rotation.x = Math.PI / 2;

    if (item.tipo === 'prato') {
      const prato = this.pratos.find(p => p.id === item.dishId);
      if (prato?.modelUrl) {
        const m = await modelo(prato.modelUrl);
        const caixa = new THREE.Box3().setFromObject(m);
        const tam = caixa.getSize(new THREE.Vector3());
        const centro = caixa.getCenter(new THREE.Vector3());
        const k = item.tamanho / Math.max(tam.x, tam.z, 1e-6);
        m.scale.setScalar(k);
        m.position.set(-centro.x * k, -caixa.min.y * k, -centro.z * k);
        interior.add(m);
      } else if (prato?.posterUrl) {
        const t = await textura(prato.posterUrl);
        interior.add(plano(t, item.tamanho, 1, false));
      }
    } else if (item.tipo === 'imagem') {
      const t = await textura(item.url);
      const asp = t.image ? t.image.height / t.image.width : 1;
      interior.add(plano(t, item.tamanho, asp, deitado));
    } else if (item.tipo === 'texto') {
      const { textura: t, aspeto } = texturaTexto(item.texto, item.fundo || '#1E2522');
      interior.add(plano(t, item.tamanho, aspeto, deitado));
    }

    if (deitado) interior.rotation.z = THREE.MathUtils.degToRad(-item.rotacao);
    else interior.rotation.y = THREE.MathUtils.degToRad(item.rotacao);
    grupo.position.copy(this.posicao(item)).setZ(0.003 + item.altura);

    let ponto = null;
    if (item.quando === 'toque') {
      ponto = this.criarPonto();
      ponto.position.copy(this.posicao(item)).setZ(0.002);
      ponto.userData.itemId = item.id;
      this.raiz.add(ponto);
    }

    const ver = visivel || item.quando === 'sempre';
    grupo.visible = ver;
    this.raiz.add(grupo);
    this.objetos.set(item.id, { item, grupo, interior, ponto, nascido: this.relogio.getElapsedTime(), visivel: ver });
  }

  criarPonto() {
    const g = new THREE.Group();
    const cor = new THREE.Color(this.corPonto);
    const sombra = new THREE.Mesh(new THREE.CircleGeometry(0.052, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }));
    const aro = new THREE.Mesh(new THREE.CircleGeometry(0.045, 48), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const disco = new THREE.Mesh(new THREE.CircleGeometry(0.032, 48), new THREE.MeshBasicMaterial({ color: cor }));
    const onda = new THREE.Mesh(new THREE.RingGeometry(0.046, 0.052, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    sombra.position.z = -0.0005; disco.position.z = 0.0005;
    onda.userData.onda = true;
    g.add(sombra, aro, disco, onda);
    return g;
  }

  // Menu acabado de detetar: o que é "sempre" aparece, o que é "ao tocar" espera pelo toque
  aoDetetar() {
    const t = this.relogio.getElapsedTime();
    for (const o of this.objetos.values()) {
      if (o.item.quando === 'sempre' && !o.visivel) { o.visivel = true; o.grupo.visible = true; o.nascido = t; }
    }
  }

  // Toque num ponto: mostra esse item e esconde os outros "ao tocar" (troca de prato)
  ativar(id) {
    const t = this.relogio.getElapsedTime();
    for (const o of this.objetos.values()) {
      if (o.item.quando !== 'toque') continue;
      const ver = o.item.id === id;
      if (ver && !o.visivel) o.nascido = t;
      o.visivel = ver; o.grupo.visible = ver;
    }
    return this.objetos.get(id)?.item || null;
  }

  esconderToques() {
    for (const o of this.objetos.values()) if (o.item.quando === 'toque') { o.visivel = false; o.grupo.visible = false; }
  }

  tocar(raio) {
    const pontos = [...this.objetos.values()].filter(o => o.ponto).map(o => o.ponto);
    const hit = raio.intersectObjects(pontos, true)[0];
    if (!hit) return null;
    let n = hit.object;
    while (n && !n.userData.itemId) n = n.parent;
    return n ? this.ativar(n.userData.itemId) : null;
  }

  atualizar() {
    const t = this.relogio.getElapsedTime();
    for (const o of this.objetos.values()) {
      if (o.ponto) {
        const s = 1 + Math.sin(t * 3.2 + o.item.x * 9) * 0.06;
        o.ponto.scale.setScalar(s);
        const onda = o.ponto.children.find(c => c.userData.onda);
        const f = (t * 0.9 + o.item.y) % 1;
        onda.scale.setScalar(1 + f * 0.9);
        onda.material.opacity = 0.8 * (1 - f);
      }
      if (!o.visivel) continue;
      const idade = t - o.nascido;
      let escala = 1;
      if (o.item.animacao === 'salto' || idade < 0.5) {
        const k = Math.min(1, idade / 0.5);
        escala = k < 1 ? k * (1 + Math.sin(k * Math.PI) * 0.22) : 1;
      }
      if (o.item.animacao === 'pulsar') escala *= 1 + Math.sin(t * 3) * 0.05;
      o.grupo.scale.setScalar(Math.max(escala, 0.0001));
      if (o.item.animacao === 'girar') {
        if (o.item.tipo !== 'prato' && o.item.deitado) o.interior.rotation.z -= 0.012;
        else o.interior.rotation.y += 0.012;
      }
    }
  }
}

export function luzes(cena) {
  cena.add(new THREE.HemisphereLight(0xffffff, 0x9aa39c, 1.15));
  const sol = new THREE.DirectionalLight(0xffffff, 1.1);
  sol.position.set(0.4, -0.6, 1.2);
  cena.add(sol);
}
