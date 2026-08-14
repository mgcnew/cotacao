# RPCs e fluxo de integração

## Envio de pedido via Evolution

O banco NÃO chama a Evolution API.

Fluxo recomendado:

1. `rpc_confirm_allocations_generate_orders(...)`
   - confirma alocações
   - cria pedido + revisão em rascunho

2. Backend gera token bruto aleatório.
   - armazena somente SHA-256 em `public_access_tokens`
   - monta URL pública com token bruto

3. Backend chama Evolution API.

4. Se envio funcionar:
   - cria `communication_logs(status='sent')`
   - chama `rpc_mark_order_revision_sent(...)`

5. Se envio falhar:
   - cria `communication_logs(status='failed')`
   - pedido/revisão continuam em rascunho
   - UI oferece reenviar / WhatsApp manual / copiar link

## Cotação pública

- leitura: `rpc_public_get_quotation(token)`
- resposta/complementação: `rpc_public_submit_quotation(token, items)`

O fornecedor não consegue sobrescrever um item já respondido.
Correção continua sendo uma ação do comprador e fica auditável.

## Pedido público

- leitura: `rpc_public_get_order(token)`
- confirmação: `rpc_public_confirm_order(token)`
- divergência: `rpc_public_report_order_divergence(token, divergences)`

## Recebimento

`rpc_post_receipt(...)`:
- exige revisão vigente confirmada;
- registra quantidades logística e de precificação;
- detecta automaticamente divergência de preço;
- atualiza pedido para `partially_received` ou `received`.

`rpc_close_order_balance(...)`:
- encerra explicitamente saldo que não será entregue;
- não altera os números históricos recebidos.
