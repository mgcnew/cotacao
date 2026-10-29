# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Hoje o uso é interno, da nossa própria operação (mercado/açougue). Vender o CotaPro como SaaS multiempresa para outros negócios é plano futuro, não realidade atual.

- **Comprador:** passa o dia no computador do escritório montando cotações, mandando links para fornecedores, comparando respostas, decidindo a compra e gerando e enviando pedidos. É usuário recorrente e experiente: o mesmo fluxo se repete várias vezes por dia.
- **Recebimento / operação de loja:** trabalha no celular, na loja ou na doca, conferindo o que chegou contra o pedido e a NF-e, imprimindo etiquetas e mantendo a lista de compras.
- **Fornecedor (externo):** responde a cotação pelo link público `/q/[token]` sem criar conta, quase sempre no celular.

## Product Purpose

Cobrir o ciclo de compras de ponta a ponta: necessidade → rodada de compras → cotação → resposta do fornecedor → negociação → decisão/alocação → pedido → confirmação → recebimento → divergências → análises. O sucesso é comprar melhor (preço comparado e histórico real), com menos cliques nas ações recorrentes e com o ciclo fechado pela nota fiscal.

## Positioning

O fornecedor responde por link, sem cadastro, e a negociação humana por telefone e WhatsApp continua dentro do fluxo, em vez de ser substituída. A NF-e fecha o ciclo e alimenta o histórico de preço efetivamente pago, que embasa a próxima decisão.

## Operating Context

- **Duas situações de uso:** o escritório (computador, sessões longas, teclado e mouse) e o campo (celular, uma mão, interrupções, recebimento e etiquetas).
- O WhatsApp é canal central de envio de cotações e pedidos e de conversa com fornecedores.
- A conferência do recebimento é feita contra a NF-e importada. O fornecedor não cita nosso número de pedido na nota, então o casamento é feito pelo conteúdo.
- Há uma página pública do fornecedor (`/q`, `/o`, `/r`, `/n`) com tema claro forçado.

## Capabilities and Constraints

- Next.js 16 (com breaking changes; ver AGENTS.md), Tailwind 4, componentes base do shadcn/Radix, Supabase. Hospedagem na Vercel; push na `main` vai direto para produção.
- O banco é arquitetura fixa: mudanças de schema exigem aprovação e são aplicadas pelo usuário no SQL Editor.
- Multiempresa com papéis e permissões granulares. Esconder botão não é segurança: o backend valida usuário + empresa + permissão.
- **Vocabulário (decidido em 29/10/2026, segue o documento mestre):**
  - **rodada** é o processo do comprador, que reúne itens, fornecedores e decisão;
  - **cotação** é o que cada fornecedor recebe e responde dentro da rodada;
  - **Compras** é a seção do menu que lista as rodadas.

  Não são sinônimos, e textos novos devem respeitar essa divisão.
- Funciona como PWA instalável e tem página offline.

## Brand Commitments

- O nome **CotaPro** é o único elemento intocável.
- Logo, cor da marca e tipografia podem ser substituídos (decisão do usuário em 29/10/2026).
- **Voz:** português do Brasil, direto, no vocabulário de quem compra ("próximo passo", "quem confirma o envio é gente").

## Evidence on Hand

- `docs/documento_mestre_sistema_compras.md`: visão e regras funcionais.
- `design/Compras DS.dc.html`: protótipo, que é referência visual antiga com dados mock.
- Críticas anteriores ficam em `.impeccable/critique/`.
- Não há clientes externos, depoimentos nem números públicos. Não inventar.

## Product Principles

1. **Poucos cliques para o que se repete.** O comprador experiente vem primeiro, sem esconder o caminho de quem está começando.
2. **Complexidade no backend, simplicidade na interface.**
3. **Números confiáveis:** todo valor exibido deriva de dado transacional, e a decisão mostra o histórico real pago.
4. **Preservar o processo humano:** telefone e WhatsApp fazem parte do fluxo, e enviar para fora é sempre uma ação consciente.
5. **Cada lugar de trabalho tem sua interface:** densidade e teclado no escritório, toque e foco no celular de campo.

## Accessibility & Inclusion

Contraste WCAG AA nos dois temas (claro e escuro), uso completo por teclado no fluxo do comprador e alvos de toque adequados nas tarefas de campo feitas no celular.
