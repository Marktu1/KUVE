# Marca Kuvê no código

**Kuvê** é a marca-mãe. O **Menu 3D** é o primeiro produto, para restaurantes. Slogan: **Vê antes de escolher.**

## Onde a marca vive

| O quê | Ficheiro |
| --- | --- |
| Cores, letras, sombras, estados | `web/css/base.css` (bloco `:root`) |
| Símbolo e acento-cubo | `web/img/icones.svg` → `#marca` (32×32) e `#acento` (60×30) |
| Favicon e ícones de instalação | `web/img/kuve.svg`, `kuve-180.png`, `kuve-192.png`, `kuve-512.png` |
| Instalar no tablet / telemóvel | `web/equipa.webmanifest`, `web/estudio.webmanifest` |
| Letra Sora (servida pelo nosso servidor) | `web/vendor/letras/sora*` (gerada por `node scripts/letras.mjs`) |
| Guarda automática | `test/marca.test.mjs` |

Muda uma cor **só** no `:root` de `base.css`. Nenhum outro CSS da ferramenta deve ter cores de marca ou de estado escritas à mão; o teste falha se isso acontecer.

## Paleta

| Token | Valor | Uso |
| --- | --- | --- |
| `--kuve-petroleo` | `#0E2A33` | texto, barras escuras, botão principal |
| `--kuve-petroleo-2` | `#1C3D47` | hover, segunda camada escura |
| `--kuve-laranja` | `#F26B2A` | **a** chamada para a ação, acento-cubo, foco, gráficos |
| `--kuve-laranja-forte` | `#B4491A` | laranja quando é texto sobre fundo claro |
| `--kuve-nevoa` | `#F2F5F5` | fundo das páginas |

Estados (fundo + texto, todos AA): `--ok-*`, `--aviso-*`, `--erro-*`, `--info-*`. A coluna "Em preparação" usa `--estado-preparacao` para se distinguir do laranja dos pedidos novos também em luminosidade, não só em tom.

Contraste verificado pelo teste: petróleo sobre névoa 14:1, petróleo sobre laranja 5:1, laranja-forte sobre névoa 4,9:1.

## Regras de uso

- **Um laranja por ecrã que mande.** O laranja é para a ação principal e para o acento. Botões secundários são brancos ou petróleo.
- **Texto sobre laranja é petróleo, nunca branco** (branco sobre `#F26B2A` dá 3:1 e falha AA para texto normal).
- **A cor do restaurante não pinta a ferramenta.** No estúdio e na equipa, a cor do restaurante fica só no avatar (`--cor-restaurante`). Antes, ela substituía o acento e mudava todos os botões.
- **O menu do cliente é do restaurante.** O tema (`js/temas.js`) substitui todos os tokens. A Kuvê aparece só em "Menu 3D por Kuvê" no rodapé, que liga à página inicial e se desliga em *Personalizar o menu → Mais*.
- **A palavra Kuvê leva sempre o acento-cubo.** Nunca escrevas "Kuvê" em Sora com o ê normal em logótipos; usa o markup do comentário em `base.css` (`.marca`). Leitores de ecrã leem "Kuvê" pelo `<span class="sr">`.

## Compatibilidade mantida de propósito

Estes nomes internos continuam "menu3d" para não partir dados guardados nem sessões abertas:

- o campo `marcaMenu3D` dos temas (base de dados);
- as chaves `menu3d.*` no `localStorage`/`sessionStorage` (sessões do estúdio, da equipa e da plataforma, carrinho do cliente);
- o nome do pacote (`menu3d`), a variável `MENU3D_URL` do worker de IA e o `id="marca-menu3d"` no menu.

Mudar qualquer um destes obriga a uma migração; não vale a pena só pelo nome.
