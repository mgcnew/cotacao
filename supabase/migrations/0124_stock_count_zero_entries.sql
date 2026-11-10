-- 0124_stock_count_zero_entries.sql
-- Lançamento com saldo zero na contagem de estoque.
--
-- "Procurei e não tem" é informação: o produto entra na conferência com 0, em
-- vez de simplesmente não aparecer — o que não diria se foi contado ou esquecido.

begin;

alter table public.stock_count_entries
  drop constraint stock_count_entries_quantity_check,
  add constraint stock_count_entries_quantity_check check (quantity >= 0);

commit;
