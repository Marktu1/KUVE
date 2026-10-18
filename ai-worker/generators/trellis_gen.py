"""Gerador TRELLIS (Microsoft, licença MIT): foto(s) → modelo 3D texturizado, em GPU.

Requisitos: GPU NVIDIA com 16 GB+ de VRAM (ex.: A10G, L4, RTX 4090, A100), CUDA 11.8/12.x,
e o repositório https://github.com/microsoft/TRELLIS instalado (ver ai-worker/README.md).
O modelo é carregado uma única vez quando o worker arranca.
"""
import io
import os

from PIL import Image, ImageOps

_pipeline = None


def _carregar():
    global _pipeline
    if _pipeline is None:
        os.environ.setdefault('SPCONV_ALGO', 'native')  # arranque mais rápido para poucas imagens
        from trellis.pipelines import TrellisImageTo3DPipeline  # import tardio: só existe na máquina com GPU
        _pipeline = TrellisImageTo3DPipeline.from_pretrained(os.environ.get('TRELLIS_MODEL', 'microsoft/TRELLIS-image-large'))
        _pipeline.cuda()
    return _pipeline


def aquecer():
    _carregar()


def gerar(fotos, qualidade='alto'):
    """fotos: 1 a 4 caminhos de imagem. Devolve bytes GLB."""
    from trellis.utils import postprocessing_utils

    pipeline = _carregar()
    imagens = [ImageOps.exif_transpose(Image.open(f)).convert('RGBA') for f in fotos[:4]]
    passos = {'alto': (12, 12), 'rapido': (8, 8)}[qualidade if qualidade in ('alto', 'rapido') else 'alto']
    params = dict(
        seed=int(os.environ.get('TRELLIS_SEED', '1')),
        sparse_structure_sampler_params={'steps': passos[0], 'cfg_strength': 7.5},
        slat_sampler_params={'steps': passos[1], 'cfg_strength': 3},
    )
    if len(imagens) > 1:
        saida = pipeline.run_multi_image(imagens, **params)
    else:
        saida = pipeline.run(imagens[0], **params)

    glb = postprocessing_utils.to_glb(
        saida['gaussian'][0], saida['mesh'][0],
        simplify=0.95,                                  # reduz triângulos; o estúdio afina depois
        texture_size=2048 if qualidade == 'alto' else 1024,
    )
    buf = io.BytesIO()
    glb.export(buf, file_type='glb')
    return buf.getvalue()
