# HANDOFF — Site "Mestre da Manipulação" (para o Claude Code)

Leia este arquivo inteiro antes de mexer em qualquer coisa. Todos os prints estão em `prints/`.

## 1. O que é
Página única de vendas do e-book **"Mestre da Manipulação"** (autor: Mauricio S), marca **Mestre(s) da Manipulação** (TikTok @o_mestre_da_manipulacao).

- Oferta: **Compre 1 e leve 2. De R$ 200,00 por R$ 49,99** (75% OFF). O 2º e-book é brinde enviado **por e-mail**.
- 5 capítulos, +100 páginas, acesso vitalício, garantia de 7 dias (ainda a confirmar).
- Checkout: https://pay.kiwify.com.br/j7abOv3 (6 botões apontam para ele, via `openBuy` e diálogo "Seu pedido").
- Idioma: **português do Brasil**. Todo texto novo deve estar em português.

## 2. Estado atual (importante)
| Versão | Artefato | Situação |
|---|---|---|
| Original (oficial) | https://claude.ai/artifact/4tLi1Fk4NL1VAufHXjL924 (slug `1f767e3c-0024-4ea5-8a8f-92731574d8b5`) | **Público, sem as melhorias da v2.** É o link que o usuário quer manter. |
| Versão 2 (melhorada) | https://claude.ai/artifact/TPjK141NeyXTM4YvYpRcdf (slug `d5ba0af4-004b-4450-b155-9d5317f7c00a`) | Privado. Contém tudo abaixo. É a base deste handoff (`source/Main.dc.html`). |

**Artefato público é imutável** (não aceita publish nem upload). Para levar a v2 ao link oficial: o usuário deixa o original **privado** (Compartilhar > privado), avisa, publica-se `source/Main.dc.html` + `canvas.json` com `publish_files` (modo patch, `base_version` atual) e o usuário torna público de novo. Atenção aos ids de imagem (seção 6).

## 3. Formato do arquivo (não quebre)
`source/Main.dc.html` é um **artefato Claude Design/canvas**, não HTML comum:
- `<x-dc>` com marcação; `<helmet>` com fontes e `<style>`; `<script type="text/x-dc" data-dc-script>` com `class Component extends DCLogic`.
- Buracos `{{...}}` aceitam só **lookups pontuados** vindos de `renderVals()` (ex.: `{{f.q}}`, `{{sndLabel}}`). Nada de expressões.
- Condicional `<sc-if value="{{x}}">`, laço `<sc-for list="{{faqs}}" as="f">`.
- Refs por `ref="{{walkRef}}"`. Imagens por `/_blob/<id>`.
- Sem rede/fetch. `localStorage` só com try/catch.
- `./support.js` é o runtime do canvas e **não está no pacote**. Por isso o arquivo só renderiza dentro do Claude. Para ver localmente use `tools/static_render.py` (seção 8).
- Validar JS: extraia o bloco do script e rode `node --check`.

## 4. Design system ("luxo sombrio")
- Fundo `#070707`; superfícies `#0E0E0E`/`#121212`; bordas `#262626`, destaque `#5A0F14`.
- Vermelho de marca `#E50914` (prop `accent`, 80 usos de `{{accent}}`), hover/neon `#FF3B45`/`#FF2A35`. Texto `#E2E2E2`/`#DADADA`.
- Fontes (Google Fonts no `<helmet>`): **Bebas Neue** (títulos), **Cinzel** (detalhes/assinatura), **Lora itálico** (frases), **Inter** (corpo e botões, `tnum`).
- Efeitos: neon/flicker, glitch, brasas, meteoros (7), marquee, beam cônico nas bordas do card de oferta, 3D do livro (`mm-sway`), scroll-driven animations (`animation-timeline: view()`) com fallback, `@property` para contadores, `content-visibility` nas seções, `prefers-reduced-motion` respeitado.
- Inspirações já aplicadas: shadcn/ui (accordion, cards, tabs), Magic UI (beams, marquee, meteors, shine), Flowbite (stepper, carrossel), Modern Web Guidance (a11y/performance).

## 5. Estrutura da página (prints correspondentes)
Desktop em 1440px e mobile em 390px (2x). Prefixo `desktop-`/`mobile-` + nome:

1. `01-hero` — #inicio. "NADA FICARÁ NO NOSSO CAMINHO." chips "75% OFF" e "2 E-BOOKS POR R$ 49,99", botão "COMPRE 1 E LEVE 2" com preço, linha "Cada e-book sai por menos de R$ 25", 3 selos, imagem do Mestre com anel neon.
2. `02-dores` — "Você já sentiu alguma dessas?" 4 cards + conclusão "É NÃO CONHECER O JOGO."
3. `03-aprender` — 5 cards do que se aprende.
4. `04-como-funciona` — stepper de 3 passos da compra (brinde chega por e-mail).
5. `05-ebook-oferta` — #ebook: livro 3D + celular com a capa original, lista, **card de oferta** (4 itens, "75% OFF", botão "Quero meus 2 e-books").
6. `06-para-voce` — "Este e-book é para você?" duas colunas.
7. `07-depoimentos` — #depoimentos: "2 milhões de visualizações", carrossel de 3 depoimentos **com placeholders**.
8. `08-faq` — #faq: selo "7 dias de garantia" + acordeão de 4 perguntas.
9. `09-cta-final` — "COMEÇA AQUI." + CTA final e meteoros.
10. `10-rodape` — logo, @, aviso educativo.
- `mobile-viewport-barra-de-preco.png` — barra fixa inferior mobile: "De R$ 200,00 + e-book grátis de brinde / por R$ 49,99" + "Garantir agora".
- `desktop-fullpage.png`, `mobile-fullpage.png` — visão geral.

Elementos fixos/flutuantes (não aparecem nos prints de seção): cabeçalho com botão de som "LIGUE O SOM", barra de preço mobile, botão "voltar ao topo", toast, diálogo "Seu pedido", **mascote Shimeji** e bolha de fala.

## 6. Funcionalidades que NÃO podem ser removidas
- **Mascote Shimeji** (engine do usuário, `source/engine.js` + `map.json` + `data.json` + `sheet.webp`): tick 30 ms, sprite 20 colunas × 200 px, estados (andar, escalar, pular, cair, arrastar, arremessar, emotes, espiar, sumir/aparecer). Limites medidos pelo DOM: nunca cobrir cabeçalho, toast, barra de preço (piso) nem a pista do botão "topo"; pausa com o diálogo aberto; z-index abaixo da UI.
- **Bolha de fala**: uma só, semitransparente, com pontinha via `clip-path`, posicionamento por candidatos (cima/lados/baixo) pontuando sobreposição com CTAs e títulos. Frases estoicas/persuasivas, assinadas **— O MESTRE DA MANIPULAÇÃO**. Inclui "Está esperando o quê para aproveitar os 75% de desconto?".
- **Trilha sonora generativa** (Web Audio, 180 BPM, ré menor, estilo suspense): botão no cabeçalho com texto "LIGUE O SOM" dentro (sem pop-up flutuante, que quebrava no mobile), fade no master, suspende com a aba oculta.
- **Sincronia de UI**: "topo" sobe conforme a altura medida da barra de preço (`topBottom`); nada se sobrepõe.
- SEO: `<title>`, meta description, theme-color, og/twitter, JSON-LD Product/Offer BRL 49.99.
- Acessibilidade: 0 imagens sem alt, botões tipados e rotulados, `aria-*` no acordeão/abas/som, foco gerenciado.

**Ids de imagem (`/_blob/...`)** — na v2: hero `3775b614…`, prova `75c52b75…`, capa `e5569998…`, sprite `2313cbc0…`. No artefato original: hero `fe4366b8…`, prova `00f6bca9…`, capa `2e43f41a…`, sprite `7314186f…`. As versões WebP estão em `source/` (`hero.webp`, `prova.webp`, `capa.webp`, `sheet.webp`). Ao publicar em outro artefato, ou reenvie os WebP com `upload_asset` e remapeie os ids, ou mantenha os ids do destino.

## 7. Pendências (dependem do usuário)
1. **Preço**: R$ 49,99 ou R$ 49,90? (pergunta aberta num comentário do Doc "Comando-mestre"). Hoje o site usa 49,99.
2. **Depoimentos reais** (hoje placeholders "[DEPOIMENTO REAL DE UM CLIENTE]").
3. Confirmar "**2 milhões de visualizações**" e a **garantia de 7 dias**.
4. **Kiwify**: título do produto está com erro "MANIPULAÇÂO"; confirmar preço e cadastrar o 2º e-book como brinde por e-mail; remover o texto "lote esgotado"; fazer uma compra-teste real.
5. A **capa original** também tem o erro "MANIPULAÇÂO" (só o usuário pode trocar o arquivo).
6. Fazer a v2 chegar ao link oficial (seção 2).

## 8. Como os prints foram feitos (e limites)
O link do Claude exige login, então o navegador embutido não conseguiu abrir o artefato. Os prints vêm de uma **renderização estática** local:
- `tools/static_render.py` extrai o `<x-dc>` de `source/Main.dc.html`, resolve os `{{buracos}}` com valores fixos, expande o acordeão (1º item aberto) e troca `/_blob/` pelos arquivos de `assets/`. Gera `preview.html`.
- `tools/shoot.py` e `tools/shoot_bar.py` (Playwright + `/usr/bin/google-chrome`) fotografam desktop 1440 e mobile 390 @2x, com `reduced-motion` e `content-visibility` desligado.

**Limites dos prints — leia antes de julgar o visual:**
- Esta máquina **não tinha as fontes Bebas Neue, Cinzel e Lora** (sem rede). Os títulos saíram em Arial/fallback, por isso aparecem mais largos (ex.: "MANIPULAÇ…" cortado no card do e-book). No site real isso não ocorre.
- Sem JavaScript do componente: **não aparecem** mascote, bolha, som, barra de preço no fluxo normal, partículas, animações, 3D do livro e as imagens de livro/celular (o livro aparece vazio).
- Os prints servem como **referência de layout, hierarquia, espaçamento e copy**, não como prova pixel-perfect.

## 9. Regras de trabalho para o Claude Code
1. Faça **backup** antes de editar (`cp Main.dc.html Main.dc.html.bak`).
2. Não remova funcionalidade existente nem mude a identidade visual, a menos que seja para melhorar e o usuário concorde.
3. Mobile-first; sem sobreposição entre mascote, bolha, barra de preço, "topo", cabeçalho e CTAs.
4. Qualidade de imagem Full HD; bordas de imagem dissolvidas por máscara (nada de "quadrado" aparente).
5. Após qualquer mudança: `node --check` no JS, conferir que todos os `href="#..."` existem, que os 6 links de checkout seguem apontando para a Kiwify e que não há `{{buraco}}` sem valor em `renderVals()`.
6. Responda ao usuário sempre em português.
