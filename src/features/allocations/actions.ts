"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAllocationBoard } from "@/features/allocations/queries";
import { carregarRodadaBasica } from "@/features/rounds/central";
import { requireActiveCompany, requireUser } from "@/lib/auth/dal";
import { roundMoney } from "@/lib/money";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AllocationState = { error: string | null; savedAt?: number };

export type RecommendationState = AllocationState & { createdCount?: number };

/**
 * Decisão de compra: de quem comprar cada item, e quanto.
 *
 * Um mesmo produto pode ser dividido entre fornecedores — o documento mestre
 * pede isso explicitamente — então há uma alocação por par (item, fornecedor).
 *
 * O preço NÃO vem do formulário. É lido de `v_current_response_prices` no
 * momento da decisão, já resolvendo negociação em cima da cotação. Aceitar
 * preço digitado abriria espaço para gravar um valor que o fornecedor nunca
 * ofereceu.
 */

const schema = z.object({
  roundId: z.uuid({ error: "Rodada inválida" }),
  quotationItemId: z.uuid({ error: "Item inválido" }),
  supplierId: z.uuid({ error: "Escolha o fornecedor" }),
  quantity: z
    .string()
    .trim()
    .min(1, { error: "Informe a quantidade" })
    .transform((v) => Number(v.replace(/\./g, "").replace(",", ".")))
    .refine((v) => Number.isFinite(v) && v > 0, {
      error: "Quantidade deve ser maior que zero",
    }),
  reason: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => (v ? v : null)),
  conversionRate: z
    .string()
    .trim()
    .nullish()
    .transform((v) =>
      v ? Number(v.replace(/\./g, "").replace(",", ".")) : null,
    )
    .refine((v) => v === null || (Number.isFinite(v) && v > 0), {
      error: "A conversão estimada deve ser maior que zero",
    }),
});

export async function allocateItem(
  _prev: AllocationState,
  formData: FormData,
): Promise<AllocationState> {
  const company = await requireActiveCompany();
  const user = await requireUser();

  const parsed = schema.safeParse({
    roundId: formData.get("roundId"),
    quotationItemId: formData.get("quotationItemId"),
    supplierId: formData.get("supplierId"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason"),
    conversionRate: formData.get("conversionRate"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabaseClient();

  // Resposta daquele fornecedor para aquele item. Passa pela RLS, então um id
  // de outra empresa simplesmente não aparece.
  const { data: link, error: linkError } = await supabase
    .from("supplier_quotation_items")
    .select(
      `
      id,
      round_suppliers!inner ( supplier_id ),
      quotation_response_items ( id, does_not_supply, is_available )
    `,
    )
    .eq("company_id", company.companyId)
    .eq("quotation_item_id", parsed.data.quotationItemId)
    .eq("round_suppliers.supplier_id", parsed.data.supplierId)
    .maybeSingle();

  if (linkError) {
    return { error: `Falha ao carregar a resposta: ${linkError.message}` };
  }

  const responseItem = link?.quotation_response_items?.[0];
  if (!responseItem) {
    return { error: "Este fornecedor ainda não respondeu este item." };
  }
  if (responseItem.does_not_supply) {
    return { error: "Este fornecedor declarou que não fornece este item." };
  }
  if (responseItem.is_available === false) {
    return { error: "Este fornecedor está sem o produto no momento." };
  }

  const { data: priceRow, error: priceError } = await supabase
    .from("v_current_response_prices")
    .select("current_price")
    .eq("company_id", company.companyId)
    .eq("quotation_response_item_id", responseItem.id)
    .maybeSingle();

  if (priceError) {
    return { error: `Falha ao carregar o preço: ${priceError.message}` };
  }
  if (
    priceRow?.current_price === null ||
    priceRow?.current_price === undefined
  ) {
    return { error: "Esta resposta não tem preço para alocar." };
  }

  // Já existe rascunho para este par? Então é ajuste, não nova divisão.
  const { data: existing } = await supabase
    .from("purchase_allocations")
    .select("id")
    .eq("company_id", company.companyId)
    .eq("purchase_round_id", parsed.data.roundId)
    .eq("quotation_item_id", parsed.data.quotationItemId)
    .eq("supplier_id", parsed.data.supplierId)
    .eq("status", "draft")
    .maybeSingle();

  // A soma do que já foi decidido para o item nunca passa do pedido. Digitar
  // 800 onde se queria 80 viraria um pedido real; o banco só exige "> 0".
  // O rascunho deste mesmo par é substituído pelo novo valor, então fica fora.
  const [{ data: item }, { data: decided, error: decidedError }] =
    await Promise.all([
      supabase
        .from("quotation_items")
        .select("requested_quantity")
        .eq("company_id", company.companyId)
        .eq("id", parsed.data.quotationItemId)
        .maybeSingle(),
      supabase
        .from("purchase_allocations")
        .select("id, allocated_quantity")
        .eq("company_id", company.companyId)
        .eq("purchase_round_id", parsed.data.roundId)
        .eq("quotation_item_id", parsed.data.quotationItemId)
        .in("status", ["draft", "confirmed"]),
    ]);

  if (decidedError) {
    return {
      error: `Falha ao conferir o que já foi decidido: ${decidedError.message}`,
    };
  }
  if (item) {
    const requested = Number(item.requested_quantity);
    const alreadyDecided = (decided ?? [])
      .filter((allocation) => allocation.id !== existing?.id)
      .reduce((sum, allocation) => sum + Number(allocation.allocated_quantity), 0);
    const balance = Math.max(0, requested - alreadyDecided);
    if (parsed.data.quantity > balance + 1e-9) {
      const fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
      return {
        error:
          balance > 0
            ? `Quantidade acima do saldo: o item pede ${fmt.format(requested)}, já há ${fmt.format(alreadyDecided)} decididos e restam ${fmt.format(balance)}.`
            : `Este item já tem toda a quantidade decidida (${fmt.format(requested)}). Desfaça uma escolha para realocar.`,
      };
    }
  }

  const payload = {
    allocated_quantity: parsed.data.quantity,
    selected_price: roundMoney(Number(priceRow.current_price)),
    decision_reason: parsed.data.reason,
  };

  if (parsed.data.conversionRate !== null) {
    const { error: conversionError } = await supabase
      .from("quotation_items")
      .update({ estimated_conversion_rate: parsed.data.conversionRate })
      .eq("company_id", company.companyId)
      .eq("purchase_round_id", parsed.data.roundId)
      .eq("id", parsed.data.quotationItemId)
      .eq("commercial_status", "open");

    if (conversionError) {
      return {
        error: `Não foi possível salvar a conversão estimada: ${conversionError.message}`,
      };
    }
  }

  const { error } = existing
    ? await supabase
        .from("purchase_allocations")
        .update(payload)
        .eq("id", existing.id)
        .eq("company_id", company.companyId)
    : await supabase.from("purchase_allocations").insert({
        ...payload,
        company_id: company.companyId,
        purchase_round_id: parsed.data.roundId,
        quotation_item_id: parsed.data.quotationItemId,
        supplier_id: parsed.data.supplierId,
        quotation_response_item_id: responseItem.id,
        allocated_by: user.id,
      });

  if (error) {
    if (
      error.code === "42501" ||
      error.message.includes("row-level security")
    ) {
      return { error: "Seu papel não permite decidir a compra." };
    }
    return { error: `Não foi possível alocar: ${error.message}` };
  }

  revalidatePath(`/compras/${parsed.data.roundId}/alocacao`);
  return { error: null, savedAt: Date.now() };
}

/**
 * Materializa, em um único INSERT, a proposta de menor preço da tela.
 *
 * A leitura pode sugerir automaticamente; a gravação continua dependendo de
 * uma ação explícita do comprador. Itens que já têm qualquer decisão ficam de
 * fora para não apagar uma divisão deliberada entre fornecedores.
 */
export async function allocateBestPrices(
  _prev: RecommendationState,
  formData: FormData,
): Promise<RecommendationState> {
  const company = await requireActiveCompany();
  const user = await requireUser();
  const parsed = z
    .uuid({ error: "Rodada inválida" })
    .safeParse(formData.get("roundId"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const roundId = parsed.data;
  const [round, board] = await Promise.all([
    carregarRodadaBasica(roundId),
    getAllocationBoard(company.companyId, roundId),
  ]);
  if (!round || round.status !== "active") {
    return {
      error: "A rodada precisa estar em andamento para aplicar a sugestão.",
    };
  }

  const supabase = await createServerSupabaseClient();
  const itemIds = board.rows.map((row) => row.itemId);
  const { data: openItems, error: openError } = itemIds.length
    ? await supabase
        .from("quotation_items")
        .select("id")
        .eq("company_id", company.companyId)
        .eq("purchase_round_id", roundId)
        .eq("commercial_status", "open")
        .in("id", itemIds)
    : { data: [], error: null };

  if (openError)
    return { error: `Falha ao conferir os itens: ${openError.message}` };
  const openIds = new Set((openItems ?? []).map((item) => item.id));

  const rows = board.rows.flatMap((row) => {
    if (
      !openIds.has(row.itemId) ||
      (board.allocationsByItem.get(row.itemId)?.length ?? 0) > 0
    )
      return [];

    const candidatesWithNormalization = board.suppliers
      .filter((supplier) => supplier.removed_at === null)
      .flatMap((supplier) => {
        const cell = row.cells.get(supplier.id);
        return cell &&
          !cell.doesNotSupply &&
          cell.responseItemId &&
          cell.currentPrice !== null
          ? [
              {
                supplierId: supplier.supplier_id,
                responseItemId: cell.responseItemId,
                price: cell.currentPrice,
                normalizedPrice: cell.normalizedPrice,
                name: supplier.suppliers.name,
              },
            ]
          : [];
      });
    const useNormalized =
      candidatesWithNormalization.length > 0 &&
      candidatesWithNormalization.every(
        (candidate) => candidate.normalizedPrice !== null,
      );
    if (row.requiresPresentationComparison && !useNormalized) return [];
    const candidates = candidatesWithNormalization
      .map(({ normalizedPrice, ...candidate }) => ({
        ...candidate,
        comparisonPrice:
          useNormalized && normalizedPrice !== null
            ? normalizedPrice
            : candidate.price,
      }))
      .sort(
        (a, b) =>
          a.comparisonPrice - b.comparisonPrice || a.name.localeCompare(b.name),
      );

    const best = candidates[0];
    if (!best) return [];
    return [
      {
        company_id: company.companyId,
        purchase_round_id: roundId,
        quotation_item_id: row.itemId,
        supplier_id: best.supplierId,
        quotation_response_item_id: best.responseItemId,
        allocated_quantity: row.requestedQuantity,
        selected_price: roundMoney(best.price),
        benchmark_price_at_decision: roundMoney(best.price),
        decision_reason: useNormalized
          ? "Sugestão automática: menor preço na unidade de comparação"
          : "Sugestão automática: menor preço vigente",
        allocated_by: user.id,
      },
    ];
  });

  if (rows.length === 0) {
    return { error: "Não há novos itens com preço para sugerir." };
  }

  const { error } = await supabase.from("purchase_allocations").insert(rows);
  if (error) {
    if (
      error.code === "42501" ||
      error.message.includes("row-level security")
    ) {
      return { error: "Seu papel não permite decidir a compra." };
    }
    return { error: `Não foi possível aplicar a sugestão: ${error.message}` };
  }

  revalidatePath(`/compras/${roundId}/alocacao`);
  revalidatePath(`/compras/${roundId}`);
  return { error: null, savedAt: Date.now(), createdCount: rows.length };
}

/**
 * Junta pedidos: grava itens sugeridos a um fornecedor pequeno no fornecedor
 * que já vai receber pedido, pagando a diferença de preço para ter um pedido a
 * menos.
 *
 * Vale para sugestões e para escolhas salvas que cobrem o item inteiro com um
 * fornecedor só — "Salvar as sugestões" vem antes de olhar a junção, e ela
 * não pode sumir por isso. Item dividido ou já no pedido nunca é mexido. O
 * preço sai da resposta do fornecedor de destino, e o
 * `benchmark_price_at_decision` guarda o melhor preço que havia, para o
 * relatório mostrar quanto a junção custou.
 *
 * O rascunho antigo é cancelado antes de gravar o novo: se a gravação falhar
 * no meio, o item volta a ficar sem decisão, nunca com duas.
 */
export async function consolidateSuggestions(
  _prev: RecommendationState,
  formData: FormData,
): Promise<RecommendationState> {
  const company = await requireActiveCompany();
  const user = await requireUser();
  const parsed = z
    .object({
      roundId: z.uuid({ error: "Rodada inválida" }),
      supplierId: z.uuid({ error: "Fornecedor inválido" }),
      itemIds: z.array(z.uuid({ error: "Item inválido" })).min(1, { error: "Nenhum item para mover" }),
    })
    .safeParse({
      roundId: formData.get("roundId"),
      supplierId: formData.get("supplierId"),
      itemIds: formData.getAll("itemId"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { roundId, supplierId, itemIds } = parsed.data;
  const [round, board] = await Promise.all([
    carregarRodadaBasica(roundId),
    getAllocationBoard(company.companyId, roundId),
  ]);
  if (!round || round.status !== "active") {
    return { error: "A rodada precisa estar em andamento para juntar pedidos." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: openItems, error: openError } = await supabase
    .from("quotation_items")
    .select("id")
    .eq("company_id", company.companyId)
    .eq("purchase_round_id", roundId)
    .eq("commercial_status", "open")
    .in("id", itemIds);
  if (openError)
    return { error: `Falha ao conferir os itens: ${openError.message}` };
  const openIds = new Set((openItems ?? []).map((item) => item.id));

  const ativos = board.suppliers.filter((supplier) => supplier.removed_at === null);
  const destino = ativos.find((supplier) => supplier.supplier_id === supplierId);
  if (!destino) return { error: "Este fornecedor não está na rodada." };

  const inserts = [];
  const toCancel: string[] = [];
  for (const itemId of itemIds) {
    const row = board.rows.find((candidate) => candidate.itemId === itemId);
    if (!row || !openIds.has(itemId)) {
      return { error: "Um dos itens já não está aberto. Recarregue a tela." };
    }
    const decided = board.allocationsByItem.get(itemId) ?? [];
    if (decided.length > 1 || decided.some((allocation) => allocation.status !== "draft" || allocation.supplierId === supplierId)) {
      return { error: `${row.productName} já tem outra decisão. Recarregue a tela.` };
    }
    toCancel.push(...decided.map((allocation) => allocation.allocationId));
    // Com apresentações diferentes, o menor preço bruto não é o melhor preço:
    // a junção fica para a escolha item a item.
    if (row.requiresPresentationComparison) {
      return { error: `${row.productName} compara apresentações; escolha pelo item.` };
    }
    const cell = row.cells.get(destino.id);
    if (
      !cell ||
      cell.doesNotSupply ||
      cell.isAvailable === false ||
      !cell.responseItemId ||
      cell.currentPrice === null
    ) {
      return { error: `${destino.suppliers.name} não tem preço para ${row.productName}.` };
    }
    const precos = ativos.flatMap((supplier) => {
      const other = row.cells.get(supplier.id);
      return other && !other.doesNotSupply && other.isAvailable !== false && other.currentPrice !== null
        ? [other.currentPrice]
        : [];
    });
    inserts.push({
      company_id: company.companyId,
      purchase_round_id: roundId,
      quotation_item_id: itemId,
      supplier_id: supplierId,
      quotation_response_item_id: cell.responseItemId,
      allocated_quantity: row.requestedQuantity,
      selected_price: roundMoney(cell.currentPrice),
      benchmark_price_at_decision: roundMoney(Math.min(...precos)),
      decision_reason: "Junção de pedidos: concentrado em um fornecedor que já recebe pedido",
      allocated_by: user.id,
    });
  }

  const semPermissao = (error: { code?: string; message: string }) =>
    error.code === "42501" || error.message.includes("row-level security");

  if (toCancel.length > 0) {
    const { error: cancelError } = await supabase
      .from("purchase_allocations")
      .update({ status: "cancelled" })
      .eq("company_id", company.companyId)
      .eq("status", "draft")
      .in("id", toCancel);
    if (cancelError) {
      return {
        error: semPermissao(cancelError)
          ? "Seu papel não permite desfazer escolhas salvas."
          : `Não foi possível desfazer as escolhas antigas: ${cancelError.message}`,
      };
    }
  }

  const { error } = await supabase.from("purchase_allocations").insert(inserts);
  if (error) {
    revalidatePath(`/compras/${roundId}/alocacao`);
    return {
      error: semPermissao(error)
        ? "Seu papel não permite decidir a compra."
        : `Não foi possível juntar os pedidos: ${error.message}`,
    };
  }

  revalidatePath(`/compras/${roundId}/alocacao`);
  revalidatePath(`/compras/${roundId}`);
  return { error: null, savedAt: Date.now(), createdCount: inserts.length };
}

/**
 * Desfaz uma decisão ainda em rascunho.
 *
 * Cancela em vez de apagar: a decisão errada fica no histórico, como tudo o
 * mais no sistema. A migration 0022 abriu exatamente esta transição na policy
 * — `draft -> cancelled` — mantendo `draft -> confirmed` fora do alcance do
 * app, que continua sendo só da RPC.
 */
export async function cancelAllocation(allocationId: string, roundId: string) {
  const company = await requireActiveCompany();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("purchase_allocations")
    .update({ status: "cancelled" })
    .eq("id", allocationId)
    .eq("company_id", company.companyId)
    .eq("status", "draft");

  if (error) {
    throw new Error(
      error.code === "42501" || error.message.includes("row-level security")
        ? "Seu papel não permite desfazer esta decisão."
        : `Não foi possível desfazer: ${error.message}`,
    );
  }

  revalidatePath(`/compras/${roundId}/alocacao`);
}

/**
 * Confirma as alocações em rascunho e gera os pedidos.
 *
 * Toda a transação é da RPC: um pedido por fornecedor, revisão 1 com os itens,
 * alocações viram `confirmed`, os itens da cotação viram `confirmed`, e os
 * eventos de domínio são emitidos. Nada disso pode ser feito em pedaços daqui.
 */
export async function confirmAllocations(
  _prev: AllocationState,
  formData: FormData,
): Promise<AllocationState> {
  const company = await requireActiveCompany();

  const roundId = String(formData.get("roundId") ?? "");
  const rawDate = String(formData.get("deliveryDueDate") ?? "").trim();

  const supabase = await createServerSupabaseClient();

  const { data: drafts, error: draftsError } = await supabase
    .from("purchase_allocations")
    .select("id")
    .eq("company_id", company.companyId)
    .eq("purchase_round_id", roundId)
    .eq("status", "draft");

  if (draftsError) {
    return { error: `Falha ao carregar as decisões: ${draftsError.message}` };
  }
  if (!drafts || drafts.length === 0) {
    return { error: "Não há decisão de compra pendente nesta rodada." };
  }

  const { error } = await supabase.rpc(
    "rpc_confirm_allocations_generate_orders",
    {
      p_company_id: company.companyId,
      p_purchase_round_id: roundId,
      p_allocation_ids: drafts.map((d) => d.id),
      p_delivery_due_date: rawDate || undefined,
    },
  );

  if (error) {
    if (error.message.includes("Permissão")) {
      return { error: "Seu papel não permite confirmar e gerar pedidos." };
    }
    if (error.message.includes("não está ativa")) {
      return {
        error: "A rodada precisa estar em andamento para gerar pedidos.",
      };
    }
    return { error: `Não foi possível gerar os pedidos: ${error.message}` };
  }

  // Gerar o último pedido encerra a rodada automaticamente. Se ainda houver
  // quantidade sem decisão, a RPC mantém a rodada ativa e a tela mostra o que
  // falta. A regra fica no banco para que duas abas não decidam estados
  // diferentes ao mesmo tempo.
  const { error: finalizeError } = await supabase.rpc(
    "rpc_finalize_round_if_resolved",
    {
      p_company_id: company.companyId,
      p_purchase_round_id: roundId,
    },
  );

  if (finalizeError) {
    // Os pedidos já foram criados na transação anterior. Não devolvemos um
    // erro que incentive a pessoa a tentar gerar tudo outra vez; a rodada
    // permanece visível e pode ser concluída pela Central.
    console.error(
      "[confirmAllocations] pedidos gerados, mas a rodada não foi finalizada:",
      finalizeError,
    );
  }

  revalidatePath(`/compras/${roundId}/alocacao`);
  revalidatePath(`/compras/${roundId}`);
  revalidatePath("/compras");
  revalidatePath("/pedidos");
  revalidatePath("/dashboard");
  return { error: null, savedAt: Date.now() };
}
