---
name: CotaPro
description: Ferramenta de compras densa, calma e precisa, do escritório ao celular de campo.
colors:
  primary: "#5851ea"
  primary-hover: "#4a42d6"
  primary-fg: "#ffffff"
  primary-soft: "#ecefff"
  primary-line: "#b1bbf1"
  canvas: "#f6f8fa"
  surface: "#ffffff"
  surface-muted: "#f2f4f7"
  surface-sunken: "#fafbfc"
  border: "#e3e8ee"
  border-strong: "#c9d1db"
  ink: "#1a1f36"
  ink-muted: "#4f566b"
  ink-subtle: "#5f6b7d"
  success: "#12784a"
  success-soft: "#e9f1ec"
  warning: "#8f6100"
  warning-soft: "#f1ebe3"
  destructive: "#b42318"
  destructive-soft: "#fbecea"
  info: "#1b62c4"
  info-soft: "#eaf1fb"
  neutral: "#5d5d66"
typography:
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.375
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"cv11\", \"cv05\""
  body-numeric:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"tnum\", \"cv11\", \"cv05\""
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.33
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-fg}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-ghost:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "32px"
  button-destructive:
    backgroundColor: "{colors.destructive-soft}"
    textColor: "{colors.destructive}"
    rounded: "{rounded.md}"
    height: "32px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
    height: "32px"
  badge-default:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
    height: "20px"
  badge-secondary:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "20px"
  filter-chip:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 8px 0 10px"
    height: "28px"
  nav-item:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  nav-item-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
  sidebar:
    backgroundColor: "{colors.surface}"
    width: "224px"
  app-header:
    backgroundColor: "{colors.surface}"
    height: "56px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  table-head:
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    height: "36px"
    padding: "0 12px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
---

# Design System: CotaPro

## Overview

**Creative North Star: "A bancada calma"**

O CotaPro é o padrão da categoria executado com rigor de painel financeiro (referência: Stripe Dashboard): uma ferramenta de trabalho densa, calma e precisa para quem compra o dia inteiro no escritório e para quem confere a carga no celular. Fundo cinza-frio claro, superfícies brancas, fios finos e texto azul-ardósia. A cor quase não fala; quando fala, é para dizer "aqui está a ação", "isto está selecionado" ou "o foco está aqui".

A densidade é de escritório: linhas de tabela em torno de 40px, controles de 32px, texto-base de 14px, valores em colunas tabulares alinhadas. No toque a mesma interface cresce para 44px sem mudar de forma. Não há gradiente, neon nem brilho; a profundidade vem do tom das superfícies e de sombras curtas e difusas.

A interface recusa a pele shadcn sem ajuste: nada de pílulas superarredondadas, indigo cru do Tailwind ou fileira de cartões de KPI no topo de toda lista. Etiquetas são retangulares, a busca mora numa paleta de comandos e as explicações de rotina ficam atrás de um (i).

**Key Characteristics:**
- Um único acento (`primary`), trocável por empresa, restrito à ação principal, à seleção e ao foco.
- Estados com fundo suave e texto colorido, nunca preenchimento saturado.
- Inter com números tabulares; nenhum texto abaixo de 12px.
- Raios de 4 a 8px nos controles e 12px nos contêineres.
- Controles de 32px no mouse e 44px no toque (`pointer: coarse`).
- Tema escuro em carvão neutro, com o acento dividido em tinta e preenchimento.

## Colors

Paleta fria e contida: neutros ardósia carregam quase tudo, um acento roxo-azulado marca o que importa e quatro tons semânticos suaves descrevem estado.

### Primary
- **Roxo-azulado de ação** (`primary`): botão principal, item de menu ativo, segmento ativo, etiqueta de filtro, contador de filtros, linha selecionada da tabela e o anel de foco (contorno de 2px com afastamento de 2px). É o acento padrão; cada empresa pode trocá-lo por `data-accent` (blue, indigo, purple, green, orange, red), e cada variante traz seu próprio `primary-hover` e `primary-fg` com contraste AA para texto branco.
- **Lavanda de seleção** (`primary-soft`, mistura de 10% do acento sobre a superfície): fundo da seleção, do item ativo e das etiquetas de filtro.
- **Fio de seleção** (`primary-line`): borda das etiquetas de filtro.

### Neutral
- **Tela cinza-frio** (`canvas`): fundo da área de trabalho.
- **Superfície branca** (`surface`): sidebar, cabeçalho, cartões, diálogos, campos.
- **Superfície recuada** (`surface-muted`): hover de linha e de item, contadores inativos, badge secundário.
- **Superfície afundada** (`surface-sunken`): gatilho da paleta de comandos no cabeçalho.
- **Fio** (`border`) e **fio forte** (`border-strong`): divisórias, bordas de controle e o hover do gatilho da busca.
- **Tinta ardósia** (`ink`), **tinta média** (`ink-muted`) e **tinta discreta** (`ink-subtle`, 4,9:1 sobre o fundo): texto principal, secundário e dicas. A tinta discreta é o piso de contraste: nada mais claro carrega texto.

### Semânticas
- **Verde-sucesso** (`success`), **âmbar-alerta** (`warning`), **vermelho-erro** (`destructive`), **azul-informação** (`info`) e **cinza neutro** (`neutral`), cada um com seu par `-soft` (mistura de 9 a 12% sobre a superfície) para fundo.

### Tema escuro
Carvão neutro sem dominante azul (fundo `#0f1218`, superfície `#171b22`, texto `#e6e9ef`, nunca branco puro). No escuro o acento se divide: `--primary` vira tinta clara para texto e ícone, e `--primary-solid` é o preenchimento escuro do botão, com texto quase branco. Os pesos 600/700 descem para 560/650 para compensar o contraste.

### Named Rules
**The Three Places Rule.** O acento aparece em três lugares e só neles: a ação principal, a seleção e o foco. Estado nunca usa o acento.

**The Soft State Rule.** Estado é fundo suave mais texto na cor semântica. O badge padrão é informação (`info-soft` com texto `info`), não o acento. Preenchimento sólido é reservado ao botão principal.

**The No Glow Rule.** Zero gradiente, zero neon, zero brilho em qualquer superfície do app.

## Typography

**Display Font:** Inter (com system-ui)
**Body Font:** Inter (com system-ui)
**Label/Mono Font:** Inter para rótulos; Geist Mono só onde há código

**Character:** Uma família só, com as alternativas `cv11` (a de um andar) e `cv05` (1 com base) para que código de produto e quantidade não se confundam. A hierarquia vem de peso e tamanho, não de troca de família.

### Hierarchy
- **Headline** (600, 20px, tracking apertado): título da página no PageHeader.
- **Title** (500, 16px): título de cartão e de diálogo.
- **Body** (400, 14px, 1,45): texto-base de toda a interface, células de tabela, itens de menu, busca. Botão pequeno usa 13px.
- **Body numérico** (14px, `tabular-nums`): toda tabela alinha valores, quantidades e datas em coluna; R$ alinhado à direita. Contadores de segmento e de filtro também são tabulares.
- **Label** (500, 12px): cabeçalho de grupo do menu, badge, contador, tecla de atalho, rótulo da barra de abas do celular, cabeçalho de tabela (600, em `ink-muted`).

### Named Rules
**The 12px Floor Rule.** Nenhum texto fica abaixo de 12px. Rótulos, badges, contadores e atalhos param em 12px.

**The Aligned Numbers Rule.** Todo número que se compara com outro é tabular e alinhado na coluna.

## Layout

A moldura ocupa a viewport (`100dvh`) e não rola; só a área principal rola, por dentro.

- **Sidebar** de 224px no desktop (a partir de `md`), recolhível para 56px com o estado lembrado em cookie. Começa pela marca e segue com os grupos do ciclo de compras; não tem busca.
- **Cabeçalho** de 56px: trilha (breadcrumb) à esquerda, gatilho da paleta de comandos centralizado (256px, 320px a partir de `lg`), notificações e menu da empresa à direita. No celular o gatilho vira um ícone de busca.
- **Área principal** com margem de 24px dos lados no desktop e 16px no celular, aplicada só pela casca. Páginas usam a largura que sobra, sem `max-width` própria; formulários limitam o campo em grade, não a página.
- **Ritmo das listas**: PageHeader (24px abaixo), ListSegments (16px abaixo), ListSearch mais FilterDialog e FilterChips (12px abaixo), depois a tabela, que pode se prender à viewport a partir de `sm` e rolar por dentro, com a paginação encostada no fim.
- **Celular** (abaixo de `md`): sidebar some, entra uma gaveta acessível pelo menu e uma barra de destinos de campo fixa no rodapé (alvos de 56px de altura, respeitando a área segura). A página volta a rolar inteira; a rolagem interna só existe a partir de `sm`.
- **Toque**: em `pointer: coarse` botões, campos, ícones e segmentos crescem para 44px (40px nos tamanhos pequenos), sem mudar de forma.

### Named Rules
**The One Shell Margin Rule.** A margem lateral mora na casca (24/16px). Nenhuma página adiciona a sua.

**The 44px Touch Rule.** Em tela de toque, todo controle tem 44px de altura.

## Elevation & Depth

Plano por padrão, separado por tom. A sequência é tela, superfície, cartão, elevado; a borda confirma o que o tom já separou. Sombras são curtas e difusas, nunca deslocadas e duras.

### Shadow Vocabulary
- **Repouso** (`box-shadow: 0 1px 1px rgba(26,31,54,0.06)`): botões, campos e o gatilho da busca.
- **Leve** (`box-shadow: 0 1px 2px rgba(26,31,54,0.08), 0 1px 1px rgba(26,31,54,0.04)`): superfícies levemente destacadas.
- **Flutuante** (`box-shadow: 0 12px 28px -12px rgba(26,31,54,0.22), 0 2px 4px rgba(26,31,54,0.06)`): paleta de comandos, aviso (toast) e menus.

### Named Rules
**The Tone First Rule.** Planos se separam por tom; sombra só aparece em quem flutua sobre a página.

## Shapes

Cantos discretos e retangulares. Controles e etiquetas usam 4 a 8px (badge, tecla e contador 4px; botão, campo, item de menu e etiqueta de filtro 6px; aviso 8px). Contêineres grandes (cartão, diálogo e paleta de comandos) usam 12px. No celular o diálogo ocupa a tela inteira, sem canto. O círculo fica restrito ao contador de notificações e a pontos de status.

**The Rectangle Tag Rule.** Etiqueta é retângulo de canto curto, nunca pílula.

## Components

### Buttons
Firmes e quietos.
- **Shape:** canto de 6px; 32px de altura (28px no pequeno, 36px no grande; 44px no toque).
- **Primary:** preenchimento `primary` com texto branco, sombra de repouso, 14px médio. Uma ação principal por tela, no canto direito do título.
- **Hover / Focus:** hover escurece o preenchimento; foco com anel na cor do acento; ao pressionar desce 1px. Desabilitado em 50% de opacidade.
- **Outline:** superfície branca com fio, usado no FilterDialog e em ações secundárias.
- **Ghost / Secondary:** sem fundo ou com `surface-muted`, hover em `surface-muted`.
- **Destructive:** fundo vermelho suave com texto vermelho, nunca vermelho sólido.

### Chips
- **Etiquetas de filtro (FilterChips):** fundo `primary-soft`, fio `primary-line`, texto ardósia, canto de 6px, 28px de altura (40px no toque), com um X que tira só aquele filtro. Com mais de um ativo, aparece "limpar" em texto sublinhado.
- **Badges:** 20px, canto de 4px, 12px médio. Padrão é informação; secundário é cinza; destrutivo é vermelho suave.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** superfície branca sobre a tela cinza-frio.
- **Shadow Strategy:** sem sombra; contorno fino de 10% da tinta.
- **Internal Padding:** 16px (12px no tamanho pequeno).

### Inputs / Fields
- **Style:** fundo branco, fio `border`, canto de 6px, 32px (44px no toque), sombra de repouso, 14px (16px no celular para não disparar zoom).
- **Focus:** borda na cor do anel e anel de 3px translúcido do acento.
- **Error / Disabled:** borda e anel vermelhos; desabilitado em 50%.

### Navigation
- **Sidebar:** itens de 14px com ícone de 16px, canto de 6px. Inativo em `ink-muted`, hover em `surface-muted`; ativo em `primary-soft` com texto `primary` médio. Recolhida, mostra só ícones com dica.
- **Trilha:** no cabeçalho, diz onde a pessoa está.
- **Barra do celular:** ícone de 20px sobre rótulo de 12px; ativo em `primary`.

### Paleta de comandos (Ctrl+K)
A busca do app. Gatilho centralizado no cabeçalho em `surface-sunken` com a tecla "Ctrl K"; abre uma caixa de 640px a 12vh do topo, canto de 12px, sombra flutuante, campo de 48px e resultados agrupados. A linha ativa vai para `primary-soft` com ícone no acento. Atalhos de teclado ficam listados num diálogo próprio.

### Listas (ListSearch, FilterDialog, FilterChips, ListSegments)
O padrão de toda lista. **ListSegments**: abas sublinhadas (2px no acento quando ativas) com contagem tabular ao lado de cada rótulo, contagem ativa em `primary-soft`. **ListSearch**: campo de 288px com ícone de lupa e tecla "/" (some no toque). **FilterDialog**: botão outline "Filtros" com contador de ativos, que abre um diálogo. **FilterChips**: as etiquetas do recorte atual.

### PageHeader
Título de 20px, descrição opcional de 14px em `ink-muted` só para o que muda (status, contagem) e um botão (i) de 24px ao lado do título que guarda em dica a explicação fixa da lista. Ação principal à direita.

### Aviso (Toaster)
Confirmação de tarefa concluída: faixa escura invertida (fundo `ink`, texto claro), canto de 8px, sombra flutuante, ícone de check, centralizada embaixo (acima da barra no celular).

## Do's and Don'ts

### Do:
- **Do** usar o acento só na ação principal, na seleção e no foco.
- **Do** mostrar estado com fundo suave e texto semântico; badge padrão é informação.
- **Do** abrir toda lista com ListSegments (com contagem), ListSearch, FilterDialog (outline) e FilterChips.
- **Do** guardar a explicação fixa da lista no (i) do PageHeader e deixar a descrição para o que muda.
- **Do** levar a busca para a paleta Ctrl+K no centro do cabeçalho.
- **Do** dar 44px a todo controle em `pointer: coarse`.
- **Do** usar números tabulares em toda coluna de valores, com R$ à direita.
- **Do** escrever "rodada" para o processo do comprador e "cotação" para o que o fornecedor recebe e responde; "Compras" é a seção do menu que lista as rodadas.

### Don't:
- **Don't** pôr uma fileira de cartões de KPI no topo de uma lista.
- **Don't** usar texto abaixo de 12px.
- **Don't** usar o acento para estado, nem preenchimento sólido em badge ou etiqueta.
- **Don't** usar pílulas de canto total em etiquetas, filtros ou segmentos.
- **Don't** usar gradiente, neon ou brilho.
- **Don't** pôr busca na sidebar.
- **Don't** adicionar margem lateral ou `max-width` própria numa página.
- **Don't** tratar "rodada" e "cotação" como sinônimos.
