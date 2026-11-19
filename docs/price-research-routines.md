# Pesquisas de preços recorrentes

Aplique `supabase/migrations/0135_price_research_routines.sql` antes de publicar o
código. Não exige novo segredo nem novo cron. A criação da cotação e o envio aos
fornecedores continuam sendo ações explícitas do comprador.

## Uso

1. Abra **Compras → Pesquisas de preços** e crie uma rotina. Segunda e quinta já
   vêm selecionadas; escolha a data em que a obrigação começa.
2. Adicione os produtos, quantidades de referência e fornecedores consultados.
   Fornecedores precisam estar ativos e ter um contato ativo.
3. Clique em **Preparar coleta** na data prevista. O sistema cria uma cotação em
   preparação, com os produtos e participantes. Repetir a ação abre a mesma
   cotação; uma coleta cancelada pode ser preparada novamente.
4. Revise, inicie e envie a cotação pelo fluxo existente. Cada data tem sua
   própria cotação, independentemente das demais.
5. Abra **Relatório da pesquisa** na cotação, ou pelo detalhe da rotina. É
   possível imprimir ou salvar PDF. Não é necessário gerar pedidos.
6. Conclua a cotação para congelar o relatório da coleta. O fechamento normal
   pode encerrar os itens sem compra. Coletas abertas são identificadas como
   prévias e seus preços ainda podem mudar.

O dashboard destaca coletas ainda não preparadas nos últimos 30 dias e cotações
em aberto. O detalhe mostra os últimos 30 dias e a próxima semana para preparar
coletas. A visão de evolução aceita um intervalo de até 92 dias.

## Evolução

As colunas representam as datas previstas das coletas, incluindo lacunas sem
cotação preparada. O relatório individual informa a preparação e o fechamento
reais; preparar uma ocorrência atrasada não significa ter coletado preços
historicamente naquela data.

Cada linha corresponde ao produto e à unidade-base de comparação. O padrão é o
menor preço comparável; o filtro de fornecedor permite acompanhar uma empresa
específica. Os valores não são somados. A variação usa as duas últimas datas do
período, sem pular uma coleta ausente para usar um preço antigo.

Falta de resposta, indisponibilidade ou falta de conversão não viram preço zero.
Mudanças de unidade-base criam linhas diferentes. A conversão usa a apresentação
do fornecedor, a equivalência da forma de compra ou o fator de conversão efetivo
do produto/categoria. Produtos retirados da lista continuam nas coletas que já
foram preparadas. Alterações na rotina afetam apenas novas coletas.

O banco guarda os preços, nomes e unidades no fechamento. Negociações e mudanças
posteriores no cadastro não alteram o retrato da coleta concluída. As consultas
exigem as permissões de visualizar rodadas e respostas e respeitam a empresa.

## Agenda de compras existente

A agenda antiga continua reconhecendo atividades do fornecedor, agora entre
ocorrências consecutivas, em vez de considerar toda a semana. Assim, uma cotação
na segunda não resolve a atividade prevista para quinta. Essa agenda ainda usa
atividades do fornecedor como indício de atendimento. Cotações exclusivas de
pesquisa não satisfazem a agenda de compras; pedidos efetivamente criados continuam
contando normalmente. As novas pesquisas usam
vínculo explícito entre rotina, data prevista e cotação.
