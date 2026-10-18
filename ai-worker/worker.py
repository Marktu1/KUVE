"""Worker de IA do Menu 3D.

Pede trabalhos ao servidor (foto → 3D), gera o GLB e devolve-o.
Pode correr em qualquer máquina com acesso à Internet (não precisa de IP público):
é o worker que vai buscar o trabalho ao servidor.

Uso:
  MENU3D_URL=https://menu3d.exemplo.ao WORKER_TOKEN=... GERADOR=trellis python worker.py
  GERADOR=plano  → sem GPU (foto num prato 3D), bom para testes
"""
import os
import socket
import sys
import tempfile
import time
import traceback

import requests

URL = os.environ.get('MENU3D_URL', 'http://localhost:3000').rstrip('/')
TOKEN = os.environ.get('WORKER_TOKEN', '')
GERADOR = os.environ.get('GERADOR', 'trellis')
INTERVALO = float(os.environ.get('INTERVALO', '5'))
NOME = os.environ.get('WORKER_NOME', f'{socket.gethostname()}-{GERADOR}')

if not TOKEN:
    sys.exit('Define WORKER_TOKEN (o mesmo valor configurado no servidor).')

if GERADOR == 'trellis':
    from generators import trellis_gen as gerador
    print('A carregar o TRELLIS na GPU (pode demorar uns minutos na primeira vez)…', flush=True)
    gerador.aquecer()
elif GERADOR == 'plano':
    from generators import plano as gerador
else:
    sys.exit(f'GERADOR desconhecido: {GERADOR} (usa trellis ou plano)')

sessao = requests.Session()
sessao.headers['x-worker-token'] = TOKEN


def proximo():
    r = sessao.post(f'{URL}/api/worker/next', json={'worker': NOME}, timeout=30)
    if r.status_code == 204:
        return None
    r.raise_for_status()
    return r.json()['job']


def processar(job):
    with tempfile.TemporaryDirectory() as pasta:
        fotos = []
        for i, u in enumerate(job['images']):
            r = sessao.get(u, timeout=60)
            r.raise_for_status()
            caminho = os.path.join(pasta, f'foto{i}{os.path.splitext(u)[1] or ".jpg"}')
            with open(caminho, 'wb') as f:
                f.write(r.content)
            fotos.append(caminho)
        inicio = time.time()
        glb = gerador.gerar(fotos, job.get('quality', 'alto'))
        print(f'  gerado em {time.time() - inicio:.0f}s, {len(glb) / 1e6:.1f} MB', flush=True)
        r = sessao.post(f'{URL}/api/worker/jobs/{job["id"]}/result',
                        files={'model': (f'ia-{job["id"]}.glb', glb, 'model/gltf-binary')}, timeout=300)
        r.raise_for_status()


def falhar(job, erro):
    try:
        sessao.post(f'{URL}/api/worker/jobs/{job["id"]}/result', data={'error': str(erro)[:380]}, timeout=30)
    except requests.RequestException:
        pass


def main():
    print(f'Worker {NOME} ligado a {URL} (gerador: {GERADOR})', flush=True)
    while True:
        try:
            job = proximo()
        except requests.RequestException as e:
            print(f'Servidor indisponível: {e}. Nova tentativa em 15s.', flush=True)
            time.sleep(15)
            continue
        if not job:
            time.sleep(INTERVALO)
            continue
        print(f'Trabalho {job["id"]}: {len(job["images"])} foto(s), qualidade {job.get("quality")}', flush=True)
        try:
            processar(job)
            print(f'Trabalho {job["id"]} entregue.', flush=True)
        except Exception as e:  # noqa: BLE001 — qualquer falha volta ao estúdio como mensagem
            traceback.print_exc()
            falhar(job, f'{type(e).__name__}: {e}')
        if os.environ.get('UMA_VEZ'):
            break


if __name__ == '__main__':
    main()
