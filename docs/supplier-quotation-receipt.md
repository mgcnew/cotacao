# Resumo da resposta do fornecedor

Aplique `supabase/migrations/0134_supplier_quotation_receipt.sql` antes de publicar
a aplicação. Não requer novo segredo ou agendamento.

O fornecedor vê as próprias respostas registradas logo após enviar e ao reabrir
o link válido: produtos, preço informado, disponibilidade, embalagem, atributos,
observações e horário do último envio. Em resposta parcial, o resumo também fica
disponível enquanto ele preenche os itens restantes. Não permite editar respostas
já enviadas; correções seguem o fluxo do comprador.

## Comparação opcional

Em **Editar rodada**, marque **Mostrar comparação de preços aos fornecedores**.
O padrão é desativado, inclusive para cotações existentes. Desmarcar e salvar
remove a comparação nas próximas consultas, mantendo o resumo das respostas.

A comparação considera o preço registrado na resposta do próprio fornecedor e
as ofertas vigentes dos demais participantes ativos para o mesmo item. Produtos
indisponíveis, fornecedores retirados e itens removidos não concorrem. As ofertas
são normalizadas pela quantidade da forma de compra ou pelo fator de conversão
quando necessário; sem uma base comum ou outra oferta válida, informa que não
há referência suficiente.

O fornecedor recebe apenas uma classificação: entre os menores, até 5% acima,
mais de 5% e até 10% acima, ou mais de 10% acima. O cálculo ocorre na RPC pelo
token, sem enviar nomes, identificadores ou preços dos concorrentes ao cliente.
As faixas ainda revelam uma referência aproximada de preço; por isso a exibição
exige a escolha do comprador em cada rodada.

As faixas são atualizadas ao consultar ou reabrir o link. Não são uma posição
congelada no momento do envio, nem representam a decisão de compra. O resumo
não publica preços internos de negociação; mostra o preço registrado na resposta.
