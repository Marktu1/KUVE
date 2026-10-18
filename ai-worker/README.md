# Worker de IA: foto → 3D

O worker pede trabalhos ao servidor do Menu 3D, gera o modelo e devolve um GLB. O estúdio trata do resto: escala real, materiais e compressão.

## Geradores

| `GERADOR` | Precisa de | Resultado |
| --- | --- | --- |
| `trellis` | GPU NVIDIA com 16 GB+ de VRAM, Linux | Modelo 3D completo e texturizado, a partir de 1 a 4 fotos |
| `plano` | Nada (CPU) | A foto vista de cima num prato 3D com volume. Serve para testes e para pratos baixos (pizza, bolos) |

## Correr o gerador `plano` (teste rápido)

```bash
pip install -r requirements.txt
MENU3D_URL=http://localhost:3000 WORKER_TOKEN=o-mesmo-do-servidor GERADOR=plano python worker.py
```

## Correr o TRELLIS numa GPU alugada

Testado pela Microsoft em A100 e A6000, só em Linux. Precisa de pelo menos 16 GB de VRAM. Qualquer GPU de 24 GB (L4, A10G, RTX 4090) é uma escolha segura.

```bash
git clone --recurse-submodules https://github.com/microsoft/TRELLIS.git
cd TRELLIS
. ./setup.sh --new-env --basic --xformers --flash-attn --diffoctreerast --spconv --mipgaussian --kaolin --nvdiffrast
cd ..
pip install -r menu3d/ai-worker/requirements.txt

export PYTHONPATH=$PWD/TRELLIS
export MENU3D_URL=https://menu3d.ao
export WORKER_TOKEN=o-mesmo-do-servidor
export GERADOR=trellis
python menu3d/ai-worker/worker.py
```

- Da primeira vez descarrega o modelo `microsoft/TRELLIS-image-large` do Hugging Face.
- Cada prato leva tipicamente 1 a 3 minutos. A qualidade **Rápida** usa menos passos e texturas de 1024 px.
- Para poupar dinheiro: liga a GPU, deixa a fila esvaziar e desliga-a. Os trabalhos ficam guardados na fila até haver um worker ligado.

Variáveis opcionais: `TRELLIS_MODEL`, `TRELLIS_SEED`, `INTERVALO` (segundos entre pedidos à fila), `WORKER_NOME`.

## Dicas de fotografia (melhoram muito o resultado)

- Prato no centro, fundo liso, luz difusa e sem sombras duras.
- Uma foto a 45° costuma dar o melhor resultado. Com 2 a 4 ângulos (frente, 45°, de cima), as texturas ficam mais completas.
- Nada a tapar o prato: talheres, mãos ou guardanapos.

## Nota

O código do TRELLIS foi escrito segundo a documentação oficial do repositório (`run`, `run_multi_image`, `to_glb`), mas ainda não foi executado numa GPU. Valida-o na primeira sessão com GPU.
