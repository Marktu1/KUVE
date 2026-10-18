# Alterações

## 0.2.1 · Deploy no Render (18 out 2026)

- `render.yaml`: blueprint pronto para o Render, plano grátis, região Frankfurt, chaves geradas pelo Render.
- `scripts/arranque.mjs`: arranque para alojamento. Com `KUVE_DEMO=1` começa sempre com o restaurante de demonstração; sem ele é o servidor normal. Usa `RENDER_EXTERNAL_URL` quando falta `PUBLIC_URL`.
- `scripts/demo.mjs`: para limpo com `SIGTERM` (o sinal do Render), cai se o servidor cair, mostra os links com o endereço público e não escreve a chave da plataforma nos logs quando vem do ambiente.

## 0.2.0 · Marca Kuvê (18 out 2026)

Identidade nova em toda a ferramenta. O servidor, a API, a base de dados e os fluxos ficam como estavam; mudaram só textos de erro onde aparecia o nome da marca.

**Marca**
- Página inicial, estúdio, painel da plataforma e ecrã da equipa com a identidade Kuvê: azul-petróleo, laranja, letra Sora nos títulos, símbolo com o acento-cubo.
- Página inicial refeita à volta do slogan "Vê antes de escolher".
- Menu do cliente: o restaurante mantém a sua identidade; o rodapé passa a "Menu 3D por Kuvê", com ligação à página inicial (continua desligável no editor de identidade).
- Favicon, ícone para iPhone e ficheiros de instalação (`/estudio` e `/equipa` podem ser adicionados ao ecrã principal do tablet).
- Sora entra no mesmo caminho das outras letras (`scripts/letras.mjs`), servida pelo nosso servidor, e fica disponível como letra de título nos temas dos restaurantes.

**Por baixo**
- Todas as cores da ferramenta saem de tokens em `web/css/base.css`, incluindo os estados (ok, aviso, erro, informação). Acabaram as cores de estado escritas à mão nos outros CSS.
- A cor do restaurante deixou de substituir o acento da ferramenta no estúdio e na equipa: fica no avatar (`--cor-restaurante`). Os botões são sempre Kuvê.
- Texto sobre laranja é petróleo (o branco falhava o contraste AA).
- "Em preparação" tem cor própria, distinta do laranja dos pedidos novos também em luminosidade.
- Ecrã da equipa: os botões de cada pedido partem a linha em vez de cortar o texto ("Confirmar" ficava cortado em colunas estreitas).
- Novo `test/marca.test.mjs`: falha se a paleta antiga voltar, se faltar o favicon ou a marca numa página, ou se um par de cores da marca perder o contraste AA.
- Guia `docs/MARCA.md` com tokens, regras de uso e os nomes internos `menu3d` mantidos de propósito por compatibilidade.
