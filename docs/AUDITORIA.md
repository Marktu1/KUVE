# Auditoria do Menu 3D (18 out 2026)

Comparação do código atual com o prompt "Menu 3D — Plataforma SaaS para Restaurantes".
Nada foi reconstruído do zero: a stack atual serve o MVP.

## Stack

| Peça | Tecnologia | Avaliação |
| --- | --- | --- |
| Servidor | Node 22, Express 5, ficheiros estáticos | Simples, barato de alojar. Mantém-se. |
| Dados | `data/db.json` com escrita atómica | Fiável para dezenas de restaurantes num só servidor. Limite: um processo só; trocar por Postgres quando houver mais de ~50 restaurantes ativos (a interface `store.js` isola essa troca). |
| Ficheiros | `data/uploads/<restaurante>/` | Separados por restaurante. |
| 3D/AR | `<model-viewer>` (Scene Viewer no Android, Quick Look no iPhone, WebXR) | AR real, não simulado. |
| Menu impresso em AR | MindAR + three.js | Reconhecimento de imagem real no browser. |
| IA foto→3D | Worker Python (TRELLIS em GPU, ou "plano" sem GPU) | Opcional, fora do servidor principal. |
| Frontend | HTML/CSS/JS sem framework, mobile-first | Leve em redes móveis lentas. |

## Estado das funcionalidades (antes desta etapa)

✅ concluído · 🟡 parcial · ❌ não existia

### Plataforma (dono do Menu 3D)
- ✅ Criar restaurantes, suspender/reativar, plano, "pago até", notas, nova chave, entrar no estúdio do restaurante.
- ✅ Uso da plataforma (visitas, AR, pedidos, espaço), fila de IA, alertas de pagamento.
- ✅ Identidade visual configurável por restaurante, com versões.
- 🟡 Planos: só um nome (teste/essencial/profissional/grátis). **Sem preço, sem limites, sem funcionalidades por plano.**
- ❌ Funcionalidades ligadas/desligadas por plano.

### Gerente do restaurante (`/estudio`)
- ✅ Pratos, categorias, preços, fotos, alergénios, variantes, modelo 3D (carregar, preparar, substituir, remover), IA foto→3D.
- ✅ Painel com vendas, pedidos, ticket médio, mais vendidos, efeito do 3D, horas de pico.
- 🟡 "Vendas" eram a soma dos pedidos não cancelados: **não distinguia valor pedido de pagamento recebido**.
- ✅ Equipa com PIN e funções.
- 🟡 Permissões fixas por sessão de equipa; **o gerente não escolhia o que cada pessoa pode fazer**.
- ❌ Ver o plano contratado e o estado da subscrição.
- 🟡 Mesas: só um número (ex.: 10) para gerar QR codes. **Sem nomes, sem estado, sem libertar mesa.**

### Equipa (`/equipa`)
- ✅ Quadro de pedidos com som, esgotados.
- 🟡 Estados: novo → a preparar → pronto → entregue / cancelado, **sem transições validadas** (era possível passar de "entregue" para "novo").

### Cliente final (`/m/<restaurante>`)
- ✅ Menu por QR, sem conta, 3D/AR com alternativa em foto, carrinho, resumo, envio.
- ✅ Preço e esgotados validados no servidor; horário.
- ❌ **Acompanhar o estado do pedido** depois de enviar.
- ❌ Pesquisa no menu.
- 🟡 Mesa vinha de `?mesa=4` no link: **qualquer pessoa podia mudar o número** e pedir para outra mesa.
- ❌ Proteção contra **pedidos duplicados** (duplo toque ou rede lenta a repetir o envio).

### Qualidade
- ✅ Isolamento entre restaurantes verificado à mão (chave por restaurante, sessões da equipa presas ao restaurante).
- 🟡 Testes: scripts de teste existiam fora do repositório. **Sem `npm test`.**
- ✅ Segredos fora do código (variáveis de ambiente), chaves e PINs só em hash.
- ❌ Dados de demonstração reproduzíveis.

## Problemas críticos encontrados
1. Pedido podia mudar para qualquer estado (incluindo voltar atrás depois de entregue).
2. Um envio repetido criava dois pedidos.
3. A mesa do pedido não era verificável.
4. Receita mostrada como "vendas" sem confirmação de pagamento.
5. Planos sem limites: um restaurante no plano mais barato tinha tudo.

## Fora do âmbito (de propósito)
- Faturação fiscal certificada (AGT): o Menu 3D faz **gestão operacional interna**, não emite faturas.
- Pagamentos automáticos (Multicaixa Express, etc.): só depois de validação técnica e comercial.
- Stock, fichas técnicas, fornecedores, caixa, filiais: módulos futuros.

## Plano executado nesta etapa
1. Pedidos: estados recebido → confirmado → em preparação → pronto → entregue / cancelado, transições validadas no servidor, chave anti-duplicado, página de acompanhamento para o cliente.
2. Mesas: mesas com nome e código secreto no QR, estado (livre, com pedido pendente, ocupada), libertar mesa.
3. Pagamentos registados por pedido (dinheiro, Multicaixa, TPA, transferência); o painel separa "valor pedido" de "pagamentos confirmados".
4. Planos configuráveis (preço, limites, funcionalidades) aplicados no servidor; o gerente vê o seu plano.
5. Permissões por membro da equipa.
6. Pesquisa no menu.
7. `npm test` com testes de isolamento e dos fluxos críticos; `npm run demo` com dados fictícios.


## Estado depois da implementação (18 out 2026)

Tudo o que estava no plano acima foi feito, no servidor **e** nas interfaces:

| Requisito do prompt | Estado | Onde |
| --- | --- | --- |
| Menu público por link/QR, sem conta | ✅ | `/m/<restaurante>` |
| Pesquisa no menu | ✅ | aparece com 8+ pratos |
| 3D/AR real com alternativa em foto | ✅ (já existia) | model-viewer |
| Pedido sem duplicados, preço do servidor | ✅ | chave por envio; teste 5 e 6 |
| Acompanhar o pedido | ✅ | `/m/<restaurante>/pedido/<id>?t=…` |
| Estados explícitos e transições válidas | ✅ | `server/dominio.js`; teste 7 |
| Mesas com QR seguro, estado, libertar | ✅ | estúdio → Mesas e QR; equipa → Mesas |
| Pagamentos registados, painel separa valor pedido de pago | ✅ | equipa, estúdio, painel |
| Permissões por pessoa | ✅ | estúdio → Equipa |
| Planos com preço, limites e funcionalidades | ✅ | plataforma → Planos; teste 13 |
| Gerente vê plano e uso | ✅ | estúdio → Restaurante |
| Isolamento entre restaurantes testado | ✅ | testes 3 e 4 |
| `npm test` e `npm run demo` | ✅ | `test/`, `scripts/demo.mjs` |
| Faturação fiscal certificada | ❌ fora do âmbito | ver acima |

Por validar no terreno: AR em telemóveis reais com HTTPS, tablets de restaurante com rede instável, preços dos planos com restaurantes-piloto.
