import "server-only";

import { cache } from "react";

import { getSupplier } from "@/features/suppliers/queries";
import { requireActiveCompany } from "@/lib/auth/dal";

/**
 * O fornecedor lido uma vez só por renderização.
 *
 * O mesmo fornecedor agora é desenhado em dois lugares — a página inteira e o
 * modal por cima da lista — e, no modal, cabeçalho e corpo são componentes
 * separados: a casca mora no `layout.tsx` para não remontar ao trocar entre
 * cadastro e histórico. Sem o `cache()` do React seriam duas leituras da mesma
 * verdade na mesma tela; com ele, o cabeçalho pede o nome cedo e o corpo pede
 * o resto depois, pagando uma ida só ao banco.
 */
export const carregarFornecedor = cache(async (supplierId: string) => {
  const company = await requireActiveCompany();
  return getSupplier(company.companyId, supplierId);
});
