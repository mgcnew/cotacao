-- A publicação chamava private.require_permission() como SECURITY INVOKER.
-- O helper privado não é executável diretamente por authenticated, por desenho,
-- então tanto a publicação individual quanto a publicação em lote falhavam.
--
-- A RPC já valida product.create, limita e valida todos os IDs recebidos e
-- restringe todas as leituras/escritas à empresa informada. SECURITY DEFINER é
-- o mesmo padrão usado pelas demais RPCs transacionais do domínio.

begin;

alter function public.rpc_publish_product_import_items(uuid, uuid, uuid[])
  security definer;

alter function public.rpc_publish_product_import_items(uuid, uuid, uuid[])
  set search_path = '';

revoke all on function public.rpc_publish_product_import_items(uuid, uuid, uuid[])
from public, anon;

grant execute on function public.rpc_publish_product_import_items(uuid, uuid, uuid[])
to authenticated;

commit;
