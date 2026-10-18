"""Gerador "plano": sem GPU, sem IA.

Põe a foto (vista de cima) num prato 3D com um ligeiro volume. Serve para:
  - testar todo o circuito estúdio → worker → menu sem precisar de GPU;
  - pratos baixos (pizza, bolos, sopas vistas de cima) enquanto não há GPU.
O estúdio depois aplica a escala real em cm.
"""
import io
import math

import numpy as np
import trimesh
from PIL import Image, ImageOps


def _foto_quadrada(caminho, lado=1024):
    img = Image.open(caminho).convert('RGB')
    img = ImageOps.exif_transpose(img)
    return ImageOps.fit(img, (lado, lado), Image.LANCZOS)


def _disco_com_cupula(raio, altura, segmentos=96, aneis=24):
    """Disco com cúpula suave (a comida), com UVs para a foto vista de cima."""
    verts, uvs, faces = [[0.0, altura, 0.0]], [[0.5, 0.5]], []
    for a in range(1, aneis + 1):
        r = raio * a / aneis
        h = altura * math.cos((a / aneis) * math.pi / 2) ** 1.5
        for s in range(segmentos):
            t = 2 * math.pi * s / segmentos
            x, z = r * math.cos(t), r * math.sin(t)
            verts.append([x, h, z])
            uvs.append([0.5 + x / (2 * raio), 0.5 - z / (2 * raio)])
    for s in range(segmentos):
        faces.append([0, 1 + (s + 1) % segmentos, 1 + s])
    for a in range(1, aneis):
        b0, b1 = 1 + (a - 1) * segmentos, 1 + a * segmentos
        for s in range(segmentos):
            s1 = (s + 1) % segmentos
            faces.append([b0 + s, b0 + s1, b1 + s])
            faces.append([b0 + s1, b1 + s1, b1 + s])
    return np.array(verts), np.array(uvs), np.array(faces)


def _prato(raio_ext, raio_int, altura, segmentos=96):
    """Prato de porcelana: base + aba levantada."""
    perfil = [(raio_int * 0.95, 0.0), (raio_int, 0.004), (raio_ext * 0.98, altura), (raio_ext, altura * 0.92)]
    verts, faces = [], []
    for (r, h) in perfil:
        for s in range(segmentos):
            t = 2 * math.pi * s / segmentos
            verts.append([r * math.cos(t), h, r * math.sin(t)])
    for i in range(len(perfil) - 1):
        a0, a1 = i * segmentos, (i + 1) * segmentos
        for s in range(segmentos):
            s1 = (s + 1) % segmentos
            faces.append([a0 + s, a1 + s, a0 + s1])
            faces.append([a0 + s1, a1 + s, a1 + s1])
    # fundo
    centro = len(verts)
    verts.append([0, 0, 0])
    for s in range(segmentos):
        faces.append([centro, (s + 1) % segmentos, s])
    m = trimesh.Trimesh(vertices=np.array(verts), faces=np.array(faces), process=False)
    m.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
        name='porcelana', baseColorFactor=[247, 248, 245, 255], roughnessFactor=0.35, metallicFactor=0.0,
        doubleSided=True))
    return m


def gerar(fotos, qualidade='alto'):
    """fotos: lista de caminhos (usa a primeira, vista de cima). Devolve bytes GLB."""
    foto = _foto_quadrada(fotos[0], 1024 if qualidade == 'alto' else 512)
    v, uv, f = _disco_com_cupula(raio=0.40, altura=0.06)
    comida = trimesh.Trimesh(vertices=v + [0, 0.008, 0], faces=f, process=False)
    comida.visual = trimesh.visual.TextureVisuals(uv=uv, material=trimesh.visual.material.PBRMaterial(
        name='comida', baseColorTexture=foto, roughnessFactor=0.55, metallicFactor=0.0))
    cena = trimesh.Scene()
    cena.add_geometry(_prato(0.5, 0.40, 0.035), node_name='prato')
    cena.add_geometry(comida, node_name='comida')
    buf = io.BytesIO()
    cena.export(buf, file_type='glb')
    return buf.getvalue()
