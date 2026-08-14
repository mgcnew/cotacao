# Documento Mestre — Sistema de Compras e Cotações

> Consolidação funcional e conceitual das decisões definidas para a reconstrução do sistema.

## 1. Visão do Produto

O sistema será uma plataforma SaaS multiempresa para gestão do ciclo de compras, inicialmente baseada no fluxo operacional de um açougue, mas arquitetada para atender outras empresas no futuro.

O sistema deverá cobrir o ciclo completo:

**Necessidade → Rodada de Compras → Cotação → Resposta → Negociação → Decisão/Alocação → Pedido → Confirmação → Recebimento → Divergências → Análises.**

Princípios gerais:

- produtividade operacional;
- poucos cliques para ações recorrentes;
- histórico completo e auditável;
- isolamento rigoroso entre empresas;
- números derivados de dados transacionais confiáveis;
- flexibilidade para diferentes estruturas de equipe;
- preservar o processo comercial humano, especialmente negociação por telefone e WhatsApp;
- complexidade técnica no backend, simplicidade na interface.

---

## 2. Multiempresa, Usuários, Papéis e Permissões

### 2.1 Estrutura

**Plataforma → Empresas → Usuários vinculados → Papéis → Permissões.**

Cada empresa terá dados independentes. Um mesmo usuário poderá participar de mais de uma empresa e possuir permissões diferentes em cada uma.

### 2.2 Papéis iniciais

- **Super Admin da Plataforma:** administra o SaaS.
- **Administrador da Empresa:** administra a própria empresa e seus usuários.
- **Comprador:** executa o processo de compras.
- **Operacional/Recebimento:** registra entregas e divergências.
- **Gerente:** supervisiona operação e análises.
- **Consulta:** acesso somente leitura conforme autorização.

Papéis serão modelos. As permissões individuais serão a regra efetiva de autorização.

### 2.3 Permissões

Permissões serão granulares por módulo e ação, incluindo produtos, fornecedores, rodadas, cotações, negociação, fechamento, pedidos, recebimentos, divergências, análises, usuários e configurações.

Ações sensíveis deverão possuir auditoria, como:

- alterar permissões;
- negociar ou corrigir preços;
- fechar compra;
- modificar pedido enviado;
- resolver divergências;
- cancelar operações;
- exportar dados sensíveis.

### 2.4 Segurança

Ocultar botões não será considerado segurança. Toda operação protegida deverá validar no backend:

**usuário + empresa + permissão.**

O banco deverá impedir acesso cruzado entre empresas.

---

## 3. Produtos, Categorias e Grupos de Compra

### 3.1 Produto

O catálogo será único e incluirá tanto produtos de revenda quanto itens de uso interno.

Campos básicos atuais:

- nome;
- unidade;
- categoria;
- foto;
- observações.

O modelo evoluirá para distinguir, quando necessário:

- unidade de compra;
- unidade de precificação;
- unidade de comparação;
- finalidade do produto;
- atributos específicos.

### 3.2 Categorias

Cada produto terá inicialmente uma única categoria principal. Categorias serão configuráveis por empresa e poderão suportar hierarquia opcional no futuro.

Exemplos: Aves, Bovinos, Embutidos, Embalagens.

Não serão introduzidas múltiplas categorias/tags sem necessidade operacional concreta.

### 3.3 Categoria x Grupo da Cotação

São conceitos diferentes:

- **Categoria:** classificação estrutural do produto.
- **Grupo:** organização operacional dentro da Rodada de Compras.

Exemplo: produtos de categorias distintas podem ser reunidos em um grupo chamado **Produtos para Feijoada**.

---

## 4. Produtos de Uso Interno, Embalagens e Comparação Normalizada

Não haverá um módulo separado de insumos. Diferenças entre tipos de produto serão tratadas por atributos, unidades e regras de comparação.

Exemplo de sacola:

- Fornecedor A: R$ 49,00 / pacote com 400 → R$ 0,1225/unidade.
- Fornecedor B: R$ 49,00 / pacote com 500 → R$ 0,0980/unidade.

O sistema deverá exibir o preço comercial e o preço normalizado.

Categorias como Embalagens poderão solicitar atributos específicos, por exemplo:

- quantidade por pacote;
- dimensão;
- espessura;
- peso/gramatura;
- material.

Esses campos só aparecerão quando relevantes.

Valores históricos poderão ser sugeridos em compras futuras, mas deverão ser confirmáveis/editáveis. Alterações de apresentação deverão permanecer no histórico para evitar conclusões incorretas sobre redução/aumento de preço.

---

## 5. Fornecedores e Contatos

### 5.1 Fornecedor

Dados principais poderão incluir:

- nome da empresa;
- razão social;
- CNPJ;
- limite de compras;
- categorias;
- agenda/dias de compra;
- observações;
- status.

O histórico deverá preservar cotações, respostas, pedidos, preços, divergências e comportamento ao longo do tempo.

### 5.2 Múltiplos contatos

Um fornecedor poderá ter vários contatos.

Cada contato poderá possuir:

- nome;
- função;
- WhatsApp;
- telefone;
- e-mail;
- observações;
- status;
- indicador de contato principal.

Contatos antigos serão inativados, não apagados, preservando o histórico de com quem cada negociação/comunicação ocorreu.

### 5.3 Fornecedor × Produto

A relação deverá acumular conhecimento e possuir estados como:

- **Confirmado:** já respondeu preço ou houve compra;
- **Provável:** compatibilidade por categoria ou indicação ainda sem evidência forte;
- **Não fornece:** fornecedor informou que não trabalha com o item;
- **Inativo:** relação histórica que não deve ser sugerida atualmente.

A evidência que originou a classificação deverá ser preservada. Métricas como última cotação, última resposta, última compra, quantidade de respostas e compras poderão alimentar sugestões automáticas.

### 5.4 Agenda de compras

Fornecedores poderão possuir dias/categorias recorrentes de compra. O sistema deverá usar isso para lembrar e sugerir Rodadas de Compras no dia apropriado.

---

## 6. Rodada de Compras

A **Rodada de Compras** será o contêiner principal de um ciclo operacional.

Exemplo:

**Rodada — Quinta-feira, 13/08**

- Frango;
- Embutidos;
- Miúdos;
- outros grupos.

Cada grupo poderá avançar independentemente. Um grupo pode estar fechado enquanto outro aguarda respostas.

### 6.1 Princípios

- **Rodada coordena.**
- **Grupo organiza.**
- **Item compara.**
- **Fornecedor comunica.**
- **Alocação decide.**
- **Pedido executa.**

### 6.2 Link único por fornecedor

Se um fornecedor participar de vários grupos na mesma Rodada, deverá receber preferencialmente um único link com todos os produtos organizados por grupo.

A unificação deixa de ser uma ação posterior: nasce da arquitetura.

### 6.3 Central da Rodada

A Central da Rodada deverá concentrar:

- produtos;
- grupos;
- fornecedores;
- envios;
- respostas;
- negociações;
- melhores preços;
- alocações;
- pedidos gerados;
- pendências.

Deverá oferecer visões **por produto** e **por fornecedor**.

Indicadores poderão mostrar quantidade de produtos, fornecedores, respostas, itens negociados, itens prontos para fechamento e pedidos gerados.

### 6.4 Alterações após envio

Antes do envio, edição livre.

Depois do envio, produtos ou fornecedores poderão ser adicionados excepcionalmente através de atualização controlada e auditada. O mesmo link poderá continuar válido, destacando novos itens. Respostas anteriores não serão apagadas.

Quanto mais o processo avançar, menor será a liberdade de edição direta.

---

## 7. Respostas e Negociação

### 7.1 Resposta inicial

A resposta original do fornecedor será preservada como **Preço Cotado Original**.

Pode vir:

- diretamente pelo link;
- por lançamento manual do comprador, quando o fornecedor responde por telefone/WhatsApp.

A origem deverá ser registrada.

### 7.2 Negociação

Negociação é separada da resposta inicial. O fornecedor não precisará retornar ao link para informar descontos obtidos por telefone ou WhatsApp.

Exemplo:

- Cotado: R$ 6,00;
- Negociação 1: R$ 5,90;
- Negociação 2: R$ 5,80.

Todas as etapas serão preservadas.

Cada negociação poderá registrar:

- preço anterior;
- novo preço;
- diferença;
- percentual;
- data/hora;
- usuário;
- canal;
- observação opcional.

O último valor válido será o **preço atual considerado**, sem apagar o histórico.

### 7.3 Correção x negociação

Correção de erro de digitação não é negociação. Correções deverão ser auditadas separadamente.

### 7.4 Respostas parciais

O fornecedor poderá responder apenas parte dos itens. O comprador poderá começar a negociar os itens respondidos sem esperar o restante.

---

## 8. Comparação, Alocação e Fechamento

O sistema deverá sugerir os melhores preços, mas o comprador sempre terá decisão final.

Um produto poderá ser dividido entre vários fornecedores.

Exemplo:

- necessidade: 500 kg;
- fornecedor A: 400 kg;
- fornecedor B: 100 kg para teste.

A alocação será uma intenção editável até a confirmação da compra.

O sistema deverá mostrar continuamente:

- necessidade;
- quantidade alocada;
- saldo;
- economia estimada pela negociação;
- impacto de escolhas fora do menor preço.

Escolhas deliberadas por preço maior poderão registrar motivos como teste, qualidade, disponibilidade, prazo, relacionamento ou outro.

### 8.1 Economia

A economia deverá ser calculada principalmente pela negociação, e não pela diferença entre o fornecedor mais caro e o mais barato.

O sistema distinguirá:

- economia negociada;
- economia realizada;
- impacto de divergências;
- impacto de decisões deliberadas fora do menor preço.

---

## 9. Geração e Envio de Pedidos

O fluxo principal será:

**Comparar → Negociar → Alocar → Revisar → Confirmar compra → Gerar e enviar pedidos.**

A Central da Rodada agrupará automaticamente itens por fornecedor e oferecerá uma revisão consolidada.

A ação principal será **Confirmar compra e enviar pedidos**.

Também haverá **Salvar pedidos como rascunho** para exceções.

A página de Pedidos continuará existindo, mas deixará de ser etapa obrigatória após a cotação. Seu papel será acompanhamento de confirmação, entrega, atraso, recebimento, divergências e pedidos diretos.

Falha de WhatsApp/Evolution não deverá apagar ou duplicar pedidos. Pedido e comunicação são eventos relacionados, mas independentes.

---

## 10. Pedido, Revisões e Confirmação do Fornecedor

O fornecedor receberá um link com:

- empresa compradora;
- razão social/CNPJ;
- produtos;
- quantidades;
- unidades;
- preços;
- previsão de entrega;
- observações.

Ações:

- **Confirmar pedido**;
- **Informar divergência**.

### 10.1 Divergência antes da entrega

Tipos possíveis:

- quantidade;
- preço;
- prazo/data;
- indisponibilidade;
- especificação;
- outro.

O fornecedor poderá informar uma condição disponível, mas isso não alterará automaticamente o pedido.

O comprador poderá aceitar, ajustar, manter o original, cancelar item ou cancelar pedido.

### 10.2 Revisões

Mudanças em pedidos já enviados gerarão novas revisões.

Exemplo:

- Revisão 1: 400 kg a R$ 12,00;
- fornecedor informa disponibilidade de 300 kg;
- negociação fecha em 350 kg;
- Revisão 2: 350 kg a R$ 12,00;
- Revisão 2 é reenviada e confirmada.

A confirmação será sempre vinculada a uma revisão específica.

---

## 11. Recebimento

Um pedido poderá possuir vários recebimentos.

Exemplo:

- pedido: 400 kg;
- entrega 1: 250 kg;
- entrega 2: 150 kg.

O recebimento registrará:

- quantidade logística recebida;
- quantidade utilizada para precificação;
- preço efetivamente praticado;
- valor realizado;
- observações;
- responsável.

### 11.1 Peso e quantidade variáveis

O sistema deverá suportar produtos cuja quantidade comercial e peso financeiro são diferentes.

Exemplo:

- compra: 20 metades suínas;
- estimativa: 550 kg;
- realizado: 563,8 kg.

O peso realizado será usado nos cálculos financeiros definitivos.

Históricos de conversão poderão sugerir estimativas futuras.

### 11.2 Encerramento de saldo

Se uma diferença pequena não for complementada, o comprador poderá **Encerrar saldo** explicitamente, preservando o motivo.

---

## 12. Divergências Comerciais

O sistema deverá comparar o acordado com o realizado.

Exemplo:

- negociado: R$ 12,00/kg;
- recebido/faturado: R$ 12,10/kg;
- quantidade realizada: 563,8 kg;
- impacto desfavorável: R$ 56,38.

Isso deverá afetar a economia realizada e permanecer no histórico do fornecedor para futuras decisões e contestações.

Variações naturais de peso não deverão ser automaticamente classificadas como falha.

---

## 13. Dashboard — Central Operacional

O Dashboard não será apenas um painel de estatísticas. Sua prioridade será responder:

1. O que precisa da minha atenção agora?
2. Como estão as compras em andamento?
3. Existe alguma pendência ou problema?
4. Como está o desempenho financeiro?

### 13.1 Indicadores principais

Sugestões:

- Rodada atual;
- aguardando respostas;
- entregas pendentes/atrasadas;
- economia realizada no mês.

### 13.2 Central de Atenção

Exemplos:

- pedido atrasado;
- fornecedor sem resposta;
- falha de envio;
- divergência comercial;
- compra prevista para o dia;
- rodada aguardando fechamento;
- produto sem alocação;
- pedido aguardando nova confirmação.

Cada item deverá levar diretamente à ação necessária.

### 13.3 Indicadores financeiros

Separar claramente:

- total comprado;
- economia negociada;
- economia realizada;
- impacto das divergências.

Top fornecedores poderá ser analisado por volume, competitividade, confiabilidade, economia e taxa de resposta.

Atividade recente terá prioridade inferior às pendências acionáveis.

---

## 14. Central de Análises e Inteligência de Compras

O Dashboard mostra situação; a Central de Análises explica comportamento.

Filtros globais:

- período;
- categoria;
- produto;
- fornecedor.

Perspectivas poderão incluir:

- Visão Geral;
- Preços;
- Economia;
- Fornecedores;
- Compras.

### 14.1 Análise de preços

Visualizar por produto e fornecedor:

- preço cotado;
- preço negociado;
- preço realizado;
- média;
- menor/maior;
- variação;
- tendência.

### 14.2 Negociação

Analisar:

- preço inicial médio;
- preço final;
- percentual médio de redução;
- frequência de negociação;
- economia gerada;
- quantidade média de negociações.

### 14.3 Taxa de captura da negociação

Exemplo:

- economia negociada: R$ 10.000;
- economia realizada: R$ 9.200;
- taxa de captura: 92%.

### 14.4 Fornecedores

Indicadores:

- competitividade;
- taxa de resposta;
- cumprimento de preços;
- entregas no prazo;
- economia gerada;
- volume;
- divergências;
- tendência de desempenho.

### 14.5 Drill-down

Todo número importante deverá permitir chegar à origem: indicador → fornecedor/produto/categoria → cotação/pedido/recebimento.

### 14.6 Inteligência futura

A arquitetura deverá permitir futuramente consultas assistidas por IA, como:

- “Quais produtos mais aumentaram nos últimos três meses?”
- “Por que minha economia caiu?”
- “Quais fornecedores merecem atenção?”

A IA interpretará dados; cálculos fundamentais continuarão determinísticos.

---

## 15. Modelo de Dados Conceitual

Entidades principais previstas:

- Empresa;
- Usuário;
- Vínculo Usuário × Empresa;
- Papel;
- Permissão;
- Categoria;
- Produto;
- Atributos de Produto;
- Fornecedor;
- Contato do Fornecedor;
- Fornecedor × Categoria;
- Fornecedor × Produto;
- Agenda de Compras;
- Rodada de Compras;
- Grupo de Cotação;
- Item da Cotação;
- Participação do Fornecedor;
- Produto Enviado ao Fornecedor;
- Resposta da Cotação;
- Resposta por Produto;
- Histórico de Negociação;
- Alocação de Compra;
- Pedido;
- Item do Pedido;
- Revisão do Pedido;
- Confirmação do Fornecedor;
- Recebimento;
- Item de Recebimento;
- Conversão Observada;
- Divergência Comercial;
- Log de Comunicação;
- Notificação;
- Log de Auditoria.

### 15.1 Fonte de verdade

Dados transacionais são a fonte de verdade: respostas, negociações, alocações, pedidos, recebimentos e divergências.

Taxas, scores, ticket médio, economia mensal e rankings são dados derivados e deverão poder ser recalculados.

### 15.2 Preservação histórica

Não sobrescrever:

- preço cotado com preço negociado;
- quantidade pedida com quantidade recebida;
- preço negociado com preço realizado;
- revisão antiga com revisão nova.

Cada estágio terá identidade própria.

---

## 16. Máquina de Estados Consolidada

O sistema distinguirá **estado**, **condição** e **evento**.

### 16.1 Rodada

Estados principais:

- Preparação;
- Em andamento;
- Parcialmente fechada;
- Concluída;
- Cancelada.

Condições calculadas poderão incluir aguardando respostas, falha de envio, itens em negociação, itens sem alocação e divergências.

### 16.2 Grupo

- Preparação;
- Aberto;
- Fechado;
- Cancelado.

### 16.3 Participação do fornecedor

- Preparado;
- Enviado;
- Acessado;
- Respondido;
- Encerrado.

Condições: envio falhou, resposta parcial, novos itens, resposta manual, pendências.

### 16.4 Resposta

- Não iniciada;
- Em preenchimento;
- Parcial;
- Concluída.

Negociações serão eventos, não estados.

### 16.5 Item comercial

- Aberto;
- Alocado;
- Confirmado para compra;
- Encerrado sem compra;
- Cancelado.

### 16.6 Alocação

- Em preparação;
- Confirmada;
- Substituída;
- Cancelada.

### 16.7 Pedido

- Rascunho;
- Aguardando confirmação;
- Aguardando entrega;
- Parcialmente recebido;
- Recebido;
- Cancelado.

Condições: envio falhou, fornecedor não visualizou, divergência, revisão pendente, atraso, saldo atrasado.

### 16.8 Revisão do pedido

- Preparação;
- Enviada;
- Confirmada;
- Contestada;
- Substituída;
- Cancelada.

### 16.9 Recebimento

- Em registro;
- Registrado;
- Corrigido, preservando histórico.

### 16.10 Atraso

Atraso será condição calculada quando a data atual superar a previsão e houver saldo pendente.

### 16.11 Regra de edição

- Antes da comunicação externa: edição direta.
- Depois da comunicação: alterações controladas/auditadas.
- Depois da confirmação: revisão.
- Depois do recebimento: correção com histórico.

### 16.12 UX

O usuário não deverá alterar status manualmente na maior parte dos casos. Ele executará ações de negócio como:

- Enviar cotação;
- Registrar negociação;
- Confirmar compra;
- Reenviar pedido;
- Registrar entrega;
- Encerrar saldo.

O sistema determinará automaticamente as transições correspondentes.

---

## 17. Comunicação, Notificações e Auditoria

### 17.1 Comunicação

Integrações de WhatsApp/Evolution serão desacopladas da transação comercial.

Logs registrarão:

- canal;
- destinatário;
- data/hora;
- sucesso/falha;
- erro;
- recurso relacionado.

### 17.2 Notificações

Eventos como resposta de fornecedor, confirmação de pedido, atraso e divergência poderão gerar notificações internas e, conforme configuração, WhatsApp.

Notificações não serão estados de negócio.

### 17.3 Auditoria

Ações relevantes deverão registrar:

- empresa;
- usuário/ator;
- ação;
- entidade;
- valor anterior;
- novo valor;
- data/hora;
- contexto.

Usuários inativados continuarão identificados nos históricos.

---

## 18. Princípios Arquiteturais para a Próxima Etapa

A próxima fase deverá transformar este documento funcional em arquitetura técnica.

Pontos a definir:

- arquitetura frontend/backend;
- organização do projeto React;
- Supabase/PostgreSQL;
- autenticação;
- multi-tenancy;
- RLS;
- permissões no backend;
- realtime;
- Evolution API;
- filas/jobs e retentativas;
- notificações;
- estratégia de auditoria;
- versionamento;
- testes;
- observabilidade;
- backups e migrações;
- estratégia de implantação.

A implementação não deverá começar criando telas e tabelas isoladamente. O domínio e as relações definidos neste documento deverão orientar a arquitetura.

---

## 19. Regra Central do Sistema

O sistema deverá ser capaz de reconstruir, de ponta a ponta:

**o que precisava ser comprado → quem foi consultado → o que respondeu → como o preço evoluiu → por que o fornecedor foi escolhido → o que foi pedido → o que o fornecedor confirmou → o que realmente chegou → quanto realmente foi pago → qual foi o resultado financeiro.**

Essa rastreabilidade será a base tanto da operação diária quanto das análises futuras.
