// Ferramentas GLB que correm no browser do estúdio (sem servidor, sem custos):
// inspecionar, pôr à escala real, afinar materiais, reduzir texturas e polígonos.
import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsClearcoat } from '@gltf-transform/extensions';
import { getBounds, dedup, prune, weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

function makeIO() {
  return new WebIO().registerExtensions(ALL_EXTENSIONS);
}

export async function readGlb(arrayBuffer) {
  return makeIO().readBinary(new Uint8Array(arrayBuffer));
}

export function inspect(doc) {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const { min, max } = getBounds(scene);
  let triangles = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      triangles += idx ? idx.getCount() / 3 : (pos ? pos.getCount() / 3 : 0);
    }
  }
  const textures = root.listTextures().map(t => {
    const size = t.getSize();
    return { name: t.getName(), mime: t.getMimeType(), width: size?.[0] || 0, height: size?.[1] || 0, bytes: t.getImage()?.byteLength || 0 };
  });
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return {
    size, // em unidades do ficheiro (glTF = metros)
    footprintM: Math.max(size[0], size[2]),
    triangles: Math.round(triangles),
    materials: root.listMaterials().length,
    textures,
    animations: root.listAnimations().length,
  };
}

// Redimensiona uma textura com o canvas do browser. Mantém PNG se tiver transparência.
async function resizeImage(bytes, mime, maxSize, keepAlpha) {
  const blob = new Blob([bytes], { type: mime });
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
  if (scale === 1 && mime === 'image/jpeg') { bmp.close(); return null; }
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const outMime = keepAlpha ? 'image/png' : 'image/jpeg';
  const out = await canvas.convertToBlob({ type: outMime, quality: 0.86 });
  return { bytes: new Uint8Array(await out.arrayBuffer()), mime: outMime };
}

/**
 * Prepara o modelo para AR.
 * opts.realSizeCm   — maior dimensão horizontal real do prato, em cm (ex.: 26)
 * opts.roughness    — 0..1 ou null para manter
 * opts.metalness    — 0..1 ou null para manter
 * opts.clearcoat    — 0..1 (brilho de verniz para bebidas e molhos)
 * opts.maxTexture   — lado máximo das texturas em px (ex.: 1024)
 * opts.maxTriangles — teto de triângulos (ex.: 60000)
 */
export async function prepare(doc, opts = {}, onStep = () => {}) {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];

  onStep('A limpar o modelo');
  await doc.transform(dedup(), prune());

  // 1) Escala real + centrar na mesa (base em y = 0)
  if (opts.realSizeCm) {
    onStep('A aplicar a escala real');
    const { min, max } = getBounds(scene);
    const footprint = Math.max(max[0] - min[0], max[2] - min[2]) || 1;
    const s = (opts.realSizeCm / 100) / footprint;
    const pivot = doc.createNode('Menu3D_raiz')
      .setScale([s, s, s])
      .setTranslation([
        -((min[0] + max[0]) / 2) * s,
        -min[1] * s,
        -((min[2] + max[2]) / 2) * s,
      ]);
    for (const child of [...scene.listChildren()]) {
      scene.removeChild(child);
      pivot.addChild(child);
    }
    scene.addChild(pivot);
  }

  // 2) Materiais
  if (opts.roughness != null || opts.metalness != null || opts.clearcoat) {
    onStep('A afinar materiais');
    const ccExt = opts.clearcoat ? doc.createExtension(KHRMaterialsClearcoat) : null;
    for (const m of root.listMaterials()) {
      if (opts.roughness != null) m.setRoughnessFactor(opts.roughness);
      if (opts.metalness != null) m.setMetallicFactor(opts.metalness);
      if (ccExt) {
        m.setExtension('KHR_materials_clearcoat',
          ccExt.createClearcoat().setClearcoatFactor(opts.clearcoat).setClearcoatRoughnessFactor(0.08));
      }
    }
  }

  // 3) Polígonos
  if (opts.maxTriangles) {
    const info = inspect(doc);
    if (info.triangles > opts.maxTriangles) {
      onStep('A reduzir polígonos');
      await MeshoptSimplifier.ready;
      const ratio = Math.max(0.02, opts.maxTriangles / info.triangles);
      await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002 }));
    }
  }

  // 4) Texturas
  if (opts.maxTexture) {
    onStep('A otimizar texturas');
    const alphaTextures = new Set();
    for (const m of root.listMaterials()) {
      if (m.getAlphaMode() !== 'OPAQUE' && m.getBaseColorTexture()) alphaTextures.add(m.getBaseColorTexture());
    }
    for (const t of root.listTextures()) {
      const img = t.getImage();
      if (!img) continue;
      const mime = t.getMimeType();
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) continue;
      // texturas de dados (normal/ORM) ficam em PNG para não criar artefactos
      const isColor = root.listMaterials().some(m => m.getBaseColorTexture() === t || m.getEmissiveTexture() === t);
      const keepPng = alphaTextures.has(t) || !isColor;
      const out = await resizeImage(img, mime, opts.maxTexture, keepPng);
      if (out && out.bytes.byteLength < img.byteLength) {
        t.setImage(out.bytes).setMimeType(out.mime);
        if (t.getURI()) t.setURI(t.getURI().replace(/\.\w+$/, out.mime === 'image/png' ? '.png' : '.jpg'));
      }
    }
  }

  onStep('A gravar o GLB');
  await doc.transform(prune());
  return makeIO().writeBinary(doc);
}
