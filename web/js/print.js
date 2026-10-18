// Menu impresso em AR (Image AR com MindAR, código aberto) — usa a cena desenhada no editor
import * as THREE from 'three';
import { MindARThree } from '/vendor/mindar/mindar-image-three.prod.js';
import { api, dinheiro, aplicarCor, evento } from './comum.js';
import { Cena, cenaDoRestaurante, luzes } from './cena.js';

const $ = s => document.querySelector(s);
const slug = location.pathname.split('/').filter(Boolean)[1];
const mesa = new URLSearchParams(location.search).get('mesa') || '';

let rest, pratos = [], cena;

function erro(msg) {
  const e = $('#erro');
  e.textContent = msg;
  e.classList.remove('oculto');
}

async function iniciar() {
  try {
    ({ restaurant: rest, dishes: pratos } = await api(`/api/menu/${encodeURIComponent(slug)}`));
  } catch (err) { return erro(`Não foi possível abrir este menu: ${err.message}`); }
  aplicarCor(rest.color);
  $('#nome').textContent = rest.name;
  if (rest.logoUrl) { $('#logo').src = rest.logoUrl; $('#logo').classList.remove('oculto'); }
  document.title = `${rest.name} · Menu em AR`;
  if (!rest.print?.mindUrl) {
    $('#comecar').disabled = true;
    return erro('Este restaurante ainda não preparou o menu impresso. Pede o QR do menu normal ao empregado.');
  }
}

$('#comecar').addEventListener('click', async () => {
  $('#comecar').disabled = true;
  $('#comecar').textContent = 'A abrir a câmara…';
  try { await arrancarAR(); }
  catch (err) {
    console.error(err);
    $('#comecar').disabled = false;
    $('#comecar').textContent = 'Abrir a câmara';
    erro(err?.name === 'NotAllowedError'
      ? 'Precisamos da câmara para mostrar os pratos. Autoriza a câmara nas definições do browser e tenta de novo.'
      : 'Não foi possível abrir a câmara neste aparelho.');
  }
});

async function arrancarAR() {
  const mindar = new MindARThree({
    container: $('#ar'),
    imageTargetSrc: rest.print.mindUrl,
    uiScanning: 'no', uiLoading: 'no',
    filterMinCF: 0.0001,
    filterBeta: 0.001,
  });
  const { renderer, scene, camera } = mindar;
  luzes(scene);
  const ancora = mindar.addAnchor(0);
  const aspeto = rest.print.height && rest.print.width ? rest.print.height / rest.print.width : 1.4;
  const cor = getComputedStyle(document.documentElement).getPropertyValue('--dende').trim() || '#E0A12B';
  cena = new Cena({ raiz: ancora.group, aspeto, pratos, corPonto: cor });
  await cena.montar(cenaDoRestaurante(rest.print));

  let visto = false;
  ancora.onTargetFound = () => {
    $('#dica').classList.add('oculto');
    if (!visto) { visto = true; cena.aoDetetar(); }
  };
  ancora.onTargetLost = () => {
    $('#dica-texto').textContent = 'Volta a apontar para o menu';
    $('#dica').classList.remove('oculto');
  };

  // toque → ponto mais próximo
  const raio = new THREE.Raycaster();
  window.addEventListener('pointerup', e => {
    if (e.target.closest('.cartao-prato, .dica')) return;
    const r = renderer.domElement.getBoundingClientRect();
    raio.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const item = cena.tocar(raio);
    if (item?.tipo === 'prato') mostrarCartao(pratos.find(p => p.id === item.dishId));
  });

  evento(slug, 'impresso');
  $('#inicio').classList.add('oculto');
  $('#dica').classList.remove('oculto');
  await mindar.start();
  renderer.setAnimationLoop(() => { cena.atualizar(); renderer.render(scene, camera); });
}

function mostrarCartao(prato) {
  if (!prato) return;
  $('#c-foto').src = prato.posterUrl || prato.photos?.[0] || '';
  $('#c-foto').classList.toggle('oculto', !(prato.posterUrl || prato.photos?.[0]));
  $('#c-nome').textContent = prato.name;
  $('#c-preco').textContent = dinheiro(prato.price, rest.currency);
  $('#c-desc').textContent = prato.description || '';
  $('#c-mesa').href = `/m/${rest.slug}${mesa ? `?mesa=${encodeURIComponent(mesa)}` : ''}#prato=${prato.id}`;
  $('#c-mesa').textContent = prato.modelUrl ? 'Ver na minha mesa' : 'Ver no menu';
  $('#cartao').classList.remove('oculto');
}

$('#c-fechar').addEventListener('click', () => {
  $('#cartao').classList.add('oculto');
  cena?.esconderToques();
});

iniciar();
