# Kuvê · Menu 3D

> **Vê antes de escolher.** Kuvê é a marca; o Menu 3D é o primeiro produto (restaurantes).

Plataforma própria para restaurantes: o cliente lê o QR na mesa, vê cada prato em 3D, põe-no em cima da mesa ao tamanho real e faz o pedido. Tudo em software aberto e nosso, sem pagar tokens a plataformas de terceiros.

## O que está incluído

| Parte | Endereço | Para quem |
| --- | --- | --- |
| Estúdio do restaurante | `/estudio` | Dono / gerente |
| Menu do cliente com AR | `/m/<restaurante>?mesa=4` | Cliente na mesa |
| Menu impresso com Image AR | `/p/<restaurante>` | Cliente com o menu de papel |
| Painel de pedidos | separador **Pedidos** no estúdio | Cozinha / balcão |
| **Painel da plataforma** | `/plataforma` | Tu, a equipa Kuvê |
| Worker de IA (foto → 3D) | `ai-worker/` | Servidor com GPU |

**Estúdio**
- Criar o restaurante e receber a chave de administração; abrir noutro aparelho com código + chave.
- Pratos: nome, categoria, preço, descrição, ingredientes, 14 alergénios, calorias, variantes com preço próprio, fotos e visibilidade.
- 3D: carregar um GLB ou gerar a partir de 1 a 4 fotos (IA). O modelo é preparado **no browser**: escala real em cm com a base pousada na mesa, rugosidade, metalicidade, verniz (clearcoat), redução de texturas e polígonos. No teste, um GLB de 7,7 MB ficou com 1,6 MB.
- Imagem do prato para a lista do menu, gerada automaticamente a partir do 3D.
- QR por mesa, pronto a imprimir.
- **Editor de cena do menu impresso** (estilo Kivicube, mas enxuto): sobre a imagem do menu colocas pratos 3D, imagens e etiquetas de texto. Arrasta para posicionar e ajusta tamanho, rotação, altura sobre o papel, posição (de pé ou deitado), quando aparece (ao ver o menu ou ao tocar no ponto) e animação (girar, pulsar, salto). A **pré-visualização 3D** mostra a cena tal como vai aparecer e deixa testar os toques. O reconhecimento do menu prepara-se no browser, em segundos.
- Pedidos em quadro (Novos → A preparar → Prontos → Entregue), atualizados a cada 5 s.

**Menu do cliente**
- Lista por categorias com o prato num "palco" redondo.
- Página do prato com o modelo 3D, que roda com o dedo, e o botão **Ver na minha mesa**:
  - Android → Scene Viewer (ARCore)
  - iPhone → Quick Look (ARKit), com o USDZ gerado na hora a partir do GLB
  - `ar-scale="fixed"`: o prato aparece a 100% do tamanho real e não pode ser esticado.
- Carrinho com variantes e quantidades. O pedido vai para a cozinha com o número da mesa e abre o WhatsApp do restaurante, se estiver configurado.
- O preço é sempre calculado no servidor; o cliente não consegue alterá-lo.

**Menu impresso (estilo Kivicube, mas nosso)**
- Reconhecimento de imagem com MindAR (WebAssembly + TensorFlow.js, código aberto).
- Mostra a cena desenhada no editor: itens "sempre" aparecem logo que o menu é reconhecido; os "ao tocar" ficam à espera de um toque no ponto dourado, e tocar troca de prato (como no vídeo da Kivicube).
- Cartão com preço e o link **Ver na minha mesa**, que abre o mesmo prato em AR à escala real.

**Painel da plataforma (`/plataforma`)**
- Visão geral dos últimos 30 dias, comparada com os 30 anteriores: restaurantes ativos, visitas aos menus, aberturas em AR, pedidos e valor pedido.
- Gráficos diários de visitas, AR e pedidos, com o valor de cada dia ao passar o rato.
- Lista de todos os restaurantes: estado, plano, data de pagamento (atrasos a vermelho), pratos com 3D, uso, pedidos, receita e espaço ocupado. Pesquisa e filtros: ativos, em atraso, suspensos.
- Gerir cada restaurante: suspender ou reativar (suspenso = o menu deixa de abrir para os clientes), plano, "pago até" com atalhos +30 dias / +3 meses / +1 ano, contacto, notas internas, gerar nova chave do estúdio e **abrir o estúdio do restaurante** para o ajudar.
- Criar restaurantes em nome do cliente e entregar-lhe o código e a chave.
- Estado da IA: worker ligado ou não, fila, falhas com o erro e botão para repetir.
- Alertas no topo para pagamentos em atraso e gerações 3D falhadas.

As estatísticas são anónimas e agregadas por dia (visitas, pratos vistos, aberturas de AR, pedidos). Não guardam dados pessoais dos clientes.

### Identidade de cada menu (painel `/plataforma` → Personalizar o menu)

Cada restaurante tem o seu menu, com a sua cara. No teu painel, o pincel em cada linha (ou "Personalizar o menu" na gaveta) abre um editor com um telemóvel ao vivo ao lado:

- **Estilo:** 6 estilos de partida (Porcelana, Noite, Mercado, Tasca, Marisqueira, Brasa), os teus modelos guardados e "copiar o estilo de outro restaurante".
- **Cores:** 6 cores com verificação de contraste (WCAG) e **paletas sugeridas a partir do logo** (clara, viva, escura).
- **Letras:** 12 letras de título e 9 de texto, servidas pelo próprio servidor (sem Google Fonts; mais rápido em rede móvel).
- **Forma:** disposição (lista, grelha, fotos grandes), cabeçalho (clássico, centrado com logo, foto de capa), prato (porcelana branca/preta, ardósia, madeira, barro, sem prato), mesa por trás do 3D, cantos, botões, luz do 3D e movimento.
- **Conteúdo:** logo, aviso no topo com data de fim, até 8 sugestões do chefe, textos dos botões, frase do rodapé, Instagram/TikTok/Facebook, telefone, morada, mapa e site.
- **Horário:** aberto/fechado por dia (aceita fecho depois da meia-noite). Fora de horas o menu mostra "Fechado · abre às…" e o servidor recusa pedidos, a não ser que ligues "aceitar pedidos fora de horas".
- **Mais:** tirar "Menu 3D por Kuvê" do rodapé, bloquear a cor para o gerente não a mudar, CSS extra (filtrado) e versões publicadas para repor.

As alterações ficam num **rascunho** que se guarda sozinho e que os clientes não veem. Só mudam o menu quando carregas em **Publicar**; a versão anterior fica guardada (últimas 10).

### Três níveis de acesso

| Quem | Onde | Como entra | O que vê |
| --- | --- | --- | --- |
| Dono da plataforma | `/plataforma` | chave da plataforma | todos os restaurantes, pagamentos, IA |
| Gerente do restaurante | `/estudio` | código + chave do estúdio | painel de vendas, menu, preços, AR, equipa |
| Equipa (receção, mesa, cozinha) | `/equipa` | código + PIN de 6 dígitos | só o que o gerente marcar: pedidos, cancelar, pagamentos, mesas, esgotados |
| Cliente | `/m/<restaurante>` (QR da mesa) | sem conta | menu, 3D/AR, pedido e acompanhamento por link secreto |

### Pedidos, mesas e pagamentos

- **Estados:** recebido → confirmado (opcional) → em preparação → pronto → entregue, ou cancelado. O servidor só aceita estas transições (não se volta atrás depois de entregue; um pedido pago não se cancela sem anular o pagamento).
- **Sem duplicados:** cada envio leva uma chave; se a rede falhar e o cliente tocar outra vez, devolve-se o mesmo pedido.
- **Acompanhar:** depois de enviar, o cliente vê o estado no menu e numa página própria (`/m/<restaurante>/pedido/<id>?t=<segredo>`), sem conta. Sem o segredo, o pedido não aparece.
- **Mesas:** o gerente cria mesas com nome (ex.: "12", "Esplanada A"). Cada QR leva um código secreto da mesa: o pedido chega identificado e não dá para pedir para outra mesa mudando o link. Estado: livre, pedido por confirmar, ocupada. "Libertar" fecha o serviço da mesa. "Novo QR" invalida o QR antigo.
- **Pagamentos:** registo manual de quem pagou e como (dinheiro, Multicaixa Express, TPA, transferência). Só o gerente anula um pagamento. **Não é faturação fiscal certificada (AGT)**: é o controlo interno do restaurante.
- **Painel:** separa *valor pedido* (soma dos pedidos não cancelados) de *pagamentos confirmados*, com o que falta pagar e o total por método.

### Planos (painel `/plataforma` → Planos)

- Cada plano tem preço mensal, limites (pratos, pratos com 3D, mesas, pessoas na equipa) e funcionalidades (pedidos, mesas, equipa, pagamentos, painel, menu impresso em AR, IA foto→3D, identidade personalizada).
- Os planos ficam na base de dados e editam-se no painel; não há preços no código. Os valores de partida (Menu 15 000 Kz, Profissional 35 000 Kz, Premium 65 000 Kz) são exemplos a validar com os restaurantes-piloto.
- O servidor aplica os limites e as funcionalidades (erro claro, sem detalhes internos). O gerente vê o seu plano, o uso e o que está incluído no separador Restaurante.
- A Kuvê não cobra nada automaticamente: o pagamento da mensalidade regista-se em "Pago até" na gaveta do restaurante.

### Painel do gerente (`/estudio`, separador Painel)

- Vendas, pedidos, ticket médio, visitas, conversão e cancelados em 7, 30 ou 90 dias, comparados com o período anterior.
- Gráficos diários de vendas e pedidos.
- Pratos mais vendidos.
- **Efeito do 3D:** pedidos por cada 100 aberturas, para quem viu o prato em AR e para quem não viu. A conclusão só aparece com pelo menos 20 visualizações em cada grupo.
- Mapa de horas de pico (dia da semana × hora, no fuso de Luanda).
- Pratos muito vistos e pouco pedidos (a partir de 10 visualizações): sinal de preço ou foto a rever.
- Mesas com mais pedidos.

### Equipa e ecrã do balcão (`/equipa`)

- O gerente cria cada pessoa com nome e função. O PIN aparece uma única vez. Pode gerar um PIN novo, desativar (termina a sessão em todos os aparelhos) ou remover.
- O ecrã da equipa é feito para tablet: colunas Novos / Em preparação / Prontos a servir / Entregues por pagar, tempo de espera (vermelho a partir de 15 min), som quando chega um pedido, registo de quem mexeu em cada pedido, registo de pagamentos e separador Mesas.
- O gerente escolhe, pessoa a pessoa, o que cada uma pode fazer (pedidos, cancelar, pagamentos, mesas, esgotados). O servidor verifica sempre.
- **Esgotado hoje:** a equipa ou o gerente marcam um prato que acabou. O cliente deixa de o poder pedir (o servidor também recusa) e no dia seguinte volta a ficar disponível sozinho.
- A equipa não vê faturação, preços de custo, estatísticas nem pode editar o menu: essas rotas devolvem 401 com um token de equipa.
- Proteção do PIN: no máximo 8 tentativas em 10 minutos por aparelho e restaurante; os PINs e as sessões são guardados só como hash.

**Chave da plataforma:** define `PLATAFORMA_CHAVE` nas variáveis de ambiente. Se não a definires, o servidor cria uma no primeiro arranque, mostra-a no terminal e guarda-a em `DATA_DIR/CHAVE-DA-PLATAFORMA.txt`. Guarda-a num gestor de palavras-passe e apaga esse ficheiro.

## Marca Kuvê

A ferramenta (página inicial, estúdio, plataforma, equipa) usa a identidade Kuvê: azul-petróleo `#0E2A33`, laranja `#F26B2A`, letra **Sora** nos títulos e **Figtree** no texto. O símbolo é o acento do "ê" desenhado como a aresta de um cubo 3D.

O menu do cliente continua com a identidade de cada restaurante; a Kuvê aparece só no rodapé ("Menu 3D por Kuvê"), que se desliga no editor de identidade.

Tudo sai de `web/css/base.css` (tokens) e `web/img/icones.svg` (símbolos `marca` e `acento`). Regras de uso, contraste e o que não fazer: [`docs/MARCA.md`](docs/MARCA.md). O teste `test/marca.test.mjs` falha se a paleta antiga voltar ou se um par de cores perder o contraste AA.

## Arquitetura

```
 Telemóvel do cliente            Servidor Kuvê (Node)                  Worker IA (GPU)
 ─────────────────────           ───────────────────────              ───────────────
 /m/… model-viewer  ──API──▶     Express + ficheiros       ◀──puxa──  worker.py
 /p/… MindAR + three             /api, /uploads, QR (SVG)   ──GLB──▶  TRELLIS (MIT)
 Estúdio: glb-tools (WASM)       data/db.json + uploads/              ou "plano" (sem GPU)
```

O worker **vai buscar** os trabalhos ao servidor. Pode, por isso, correr numa GPU alugada à hora, em qualquer lado, sem IP público.

## Correr localmente

Precisa de Node 22 ou mais recente.

```bash
npm install
npm start                     # http://localhost:3000/estudio
npm test                      # testes dos fluxos críticos e do isolamento entre restaurantes
npm run demo                  # restaurante fictício completo em ./data-demo (não toca em ./data)
```

`npm run demo` mostra no fim os links e as chaves do estúdio, os PINs da equipa e a chave da plataforma (`demo-plataforma`). Todos os dados (restaurante, pratos, ilustrações, pedidos) são fictícios.

`web/vendor/` já vem construído (incluindo as letras em `web/vendor/letras`). Só é preciso `npm run build` se atualizares as bibliotecas. Para incluir o MindAR no build, instala-o antes com `npm i mind-ar@1.2.5 --no-save --ignore-scripts`.

Variáveis de ambiente:

| Variável | Para quê | Exemplo |
| --- | --- | --- |
| `PORT` | Porta do servidor | `3000` |
| `PUBLIC_URL` | Endereço público; vai dentro dos QR codes | `https://menu3d.ao` |
| `DATA_DIR` | Onde guardar a base de dados e os ficheiros | `/data` |
| `WORKER_TOKEN` | Segredo partilhado com o worker de IA | gera um valor longo e aleatório |
| `PLATAFORMA_CHAVE` | Chave do teu painel `/plataforma` | gera um valor longo e aleatório |

## Pôr no ar

A câmara e o AR **só funcionam em HTTPS**.

1. **Servidor:** qualquer VPS ou serviço com Docker. Usa `docker build -t menu3d .` e corre com um volume em `/data`. Põe à frente um proxy com HTTPS automático (por exemplo, Caddy: `menu3d.ao { reverse_proxy localhost:3000 }`).
2. Define `PUBLIC_URL` com o domínio final **antes** de imprimir os QR codes.
3. **IA:** ver `ai-worker/README.md`.
4. **Cópias de segurança:** guarda a pasta `DATA_DIR` com regularidade (db.json + uploads).

## Testado

Testes automáticos num Chromium sem ecrã, com WebGL por software:

- Estúdio: criar restaurante, criar prato, carregar GLB, preparar (escala de 4,3 cm → 10 cm; 7,7 MB → 1,6 MB) e gravar a imagem automática.
- Geração por IA, ponta a ponta, com o gerador `plano`: estúdio → fila → worker → GLB → preparação → menu.
- Menu do cliente no formato de telemóvel: lista, prato em 3D, variante, carrinho, pedido com mesa e link de WhatsApp. O preço foi validado no servidor.
- Menu impresso: reconhecimento preparado em cerca de 6 s; uma câmara simulada a filmar o menu encontrou o alvo; tocar no ponto fez aparecer o prato 3D.
- Identidade: 6 restaurantes com estilos diferentes no telemóvel; editor com pré-visualização ao vivo, paleta do logo, rascunho invisível ao público, publicar e repor versão.
- Segurança da identidade: só a chave da plataforma edita; CSS extra sem `<`, `@import` nem imagens de fora; links só `https`; pedidos fora de horas recusados; gerente bloqueado recebe 403 ao mudar a cor.
- Painel do gerente, criação de equipa com PIN, entrada no ecrã do balcão, mudar estados de pedidos e marcar esgotado (refletido no menu do cliente).
- Permissões: a equipa recebe 401 no painel, na lista da equipa e ao editar pratos ou o restaurante; pedido com prato esgotado recusado; 9.º PIN errado bloqueado (429); membro desativado perde a sessão.
- API: chave errada recusada (401), tipos de ficheiro recusados, preços falsificados ignorados.

- `npm test` (14 testes, servidor real com base de dados temporária): transições de estado, migração de dados antigos, isolamento entre restaurantes (gerente e equipa), preço do servidor, envio repetido, acompanhamento só com o link secreto, mesas e QR, pagamentos e painel, permissões por pessoa, planos e limites, erros sem detalhes internos.
- No browser (Chromium, telemóvel e tablet simulados): pesquisa no menu, mesa vinda do QR, duplo toque a enviar sem duplicar, página de acompanhamento; ecrã da equipa com receção (tudo) e cozinha (sem pagamentos nem cancelar); estúdio com pedidos, pagamentos, anular pagamento, mesas, permissões e plano; restaurante no plano Menu sem pedidos nem painel; editor de planos.

**Ainda por testar em aparelhos reais:**

- Abrir o AR nativo (Scene Viewer e Quick Look) num Android e num iPhone.
- O TRELLIS numa GPU real.
- O menu impresso com uma câmara de telemóvel verdadeira e luz de restaurante.

## Limites desta versão (MVP)

- Base de dados em ficheiro JSON: chega para dezenas de restaurantes. Para escalar, troca `server/store.js` por Postgres mantendo a mesma interface.
- O gerente entra com uma chave por restaurante (não há várias contas de gerente nem recuperação por e-mail).
- O ecrã da equipa atualiza de 4 em 4 segundos (sem notificações push).
- Não há pagamentos online nem faturação fiscal certificada; o pagamento regista-se à mão.
- O cliente acompanha o pedido por atualização periódica (10–15 s), sem notificações push.
- Um só processo de servidor (JSON). Para várias instâncias, passar a Postgres.
- Módulos futuros, de propósito fora do MVP: stock, fichas técnicas, fornecedores, caixa, filiais, entregas, pagamentos locais integrados.
- O USDZ gerado na hora para o iPhone não leva animações. Para pratos animados no iPhone, carrega um `.usdz` próprio no campo `iosModelUrl`.

## Licenças das peças usadas

| Peça | Licença |
| --- | --- |
| model-viewer (Google) | Apache-2.0 |
| MindAR | MIT |
| three.js | MIT |
| glTF-Transform | MIT |
| meshoptimizer | MIT |
| TRELLIS (Microsoft) | MIT; alguns submódulos têm licenças próprias |
| Express, Multer, qrcode | MIT |
