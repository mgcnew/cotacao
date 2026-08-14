-- 0005_seed_permissions.sql
-- Catálogo inicial de permissões.
-- Idempotente por `permissions.key`.

begin;

insert into public.permissions (key, module, action, description)
values
  ('company_member.view', 'company_member', 'view', 'Visualizar membros da empresa'),
  ('company_member.invite', 'company_member', 'invite', 'Convidar/adicionar membro'),
  ('company_member.update', 'company_member', 'update', 'Alterar papel/status de membro'),
  ('company_member.deactivate', 'company_member', 'deactivate', 'Desativar membro'),

  ('role.view', 'role', 'view', 'Visualizar papéis'),
  ('role.manage', 'role', 'manage', 'Criar e alterar papéis e permissões'),
  ('permission_override.manage', 'permission_override', 'manage', 'Gerenciar exceções individuais de permissão'),

  ('product.view', 'product', 'view', 'Visualizar produtos e catálogo'),
  ('product.create', 'product', 'create', 'Criar produtos, categorias e unidades'),
  ('product.update', 'product', 'update', 'Editar produtos, categorias, unidades e atributos'),
  ('product.deactivate', 'product', 'deactivate', 'Desativar produtos'),

  ('supplier.view', 'supplier', 'view', 'Visualizar fornecedores'),
  ('supplier.create', 'supplier', 'create', 'Criar fornecedores'),
  ('supplier.update', 'supplier', 'update', 'Editar fornecedores'),
  ('supplier.deactivate', 'supplier', 'deactivate', 'Desativar fornecedores'),
  ('supplier.history.view', 'supplier', 'history_view', 'Visualizar histórico comercial do fornecedor'),

  ('purchase_round.view', 'purchase_round', 'view', 'Visualizar rodadas de compra'),
  ('purchase_round.create', 'purchase_round', 'create', 'Criar rodada'),
  ('purchase_round.update', 'purchase_round', 'update', 'Editar rodada em estado permitido'),
  ('purchase_round.send', 'purchase_round', 'send', 'Enviar cotações da rodada'),
  ('purchase_round.close', 'purchase_round', 'close', 'Concluir decisões da rodada'),
  ('purchase_round.cancel', 'purchase_round', 'cancel', 'Cancelar rodada'),

  ('quotation_response.view', 'quotation_response', 'view', 'Visualizar respostas de cotação'),
  ('quotation_response.manual_create', 'quotation_response', 'manual_create', 'Registrar resposta manual'),
  ('quotation_response.correct', 'quotation_response', 'correct', 'Corrigir lançamento de resposta'),

  ('negotiation.view', 'negotiation', 'view', 'Visualizar negociações'),
  ('negotiation.create', 'negotiation', 'create', 'Registrar negociação'),
  ('negotiation.correct', 'negotiation', 'correct', 'Corrigir registro de negociação'),

  ('purchase_allocation.view', 'purchase_allocation', 'view', 'Visualizar alocações'),
  ('purchase_allocation.create', 'purchase_allocation', 'create', 'Criar alocações'),
  ('purchase_allocation.update', 'purchase_allocation', 'update', 'Alterar alocações em preparação'),
  ('purchase_allocation.confirm', 'purchase_allocation', 'confirm', 'Confirmar decisão de compra'),

  ('order.view', 'order', 'view', 'Visualizar pedidos'),
  ('order.create', 'order', 'create', 'Criar pedido'),
  ('order.update_draft', 'order', 'update_draft', 'Editar pedido em rascunho'),
  ('order.send', 'order', 'send', 'Enviar pedido'),
  ('order.revise', 'order', 'revise', 'Criar revisão de pedido'),
  ('order.cancel', 'order', 'cancel', 'Cancelar pedido'),

  ('receipt.view', 'receipt', 'view', 'Visualizar recebimentos'),
  ('receipt.create', 'receipt', 'create', 'Criar recebimento'),
  ('receipt.post', 'receipt', 'post', 'Confirmar/postar recebimento'),
  ('receipt.void', 'receipt', 'void', 'Invalidar recebimento'),

  ('commercial_divergence.view', 'commercial_divergence', 'view', 'Visualizar divergências comerciais'),
  ('commercial_divergence.create', 'commercial_divergence', 'create', 'Registrar divergência comercial'),
  ('commercial_divergence.manage', 'commercial_divergence', 'manage', 'Resolver/contestar divergência'),

  ('analytics.view', 'analytics', 'view', 'Visualizar análises'),
  ('analytics.financial.view', 'analytics', 'financial_view', 'Visualizar análises financeiras'),
  ('analytics.supplier.view', 'analytics', 'supplier_view', 'Visualizar análises de fornecedores'),
  ('analytics.export', 'analytics', 'export', 'Exportar dados analíticos')
on conflict (key) do update
set
  module = excluded.module,
  action = excluded.action,
  description = excluded.description;

commit;
