"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { GRUPO_PADRAO } from "@/features/rounds/groups";
import { requireActiveCompany, requireUser } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Montagem da Rodada de Compras.
 *
 * As RPCs do projeto cobrem o que vem depois — envio, resposta do fornecedor,
 * negociação, alocação e geração de pedido — porque são operações que tocam
 * várias tabelas de uma vez. A montagem (criar rodada, grupos, itens e
 * participantes) é escrita direta, contida por RLS com `purchase_round.create`
 * e `purchase_round.update`.
 *
 * O schema tem três triggers de integridade que valem lembrar, porque as
 * mensagens deles chegam aqui:
 *  - item precisa pertencer a um grupo da MESMA rodada;
 *  - contato precisa pertencer ao fornecedor informado;
 *  - fornecedor e item precisam ser da MESMA rodada.
 */

export type RoundFormState = {
  error: string | null;
  savedAt?: number;
  /** Id da rodada recém-criada, para quem quiser abri-la em seguida. */
  roundId?: string;
};

function describeWriteError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "Esse registro já existe nesta rodada.";
  }
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return "Seu papel não permite alterar rodadas de compra.";
  }
  return `Não foi possível salvar: ${error.message}`;
}

const roundSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, { error: "Dê um título à rodada" })
    .max(120, { error: "Título muito longo" }),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : null)),
});

/**
 * Cria a rodada.
 *
 * Para onde ir depois é decisão de quem chamou, não da action: pela página
 * `/compras/nova` o certo é abrir a rodada recém-criada, porque a pessoa foi
 * até lá para montá-la; pelo modal da lista o certo é ficar onde está, com a
 * linha nova já na tabela. Um `redirect()` fixo aqui dentro tornaria o modal
 * impossível — ele arrastaria a tela junto.
 *
 * O campo `apos` carrega essa escolha, e o id volta no estado para quem quiser
 * navegar por conta própria.
 */
export async function createRound(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();
  const user = await requireUser();

  const parsed = roundSchema.safeParse({
    title: formData.get("title"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("purchase_rounds")
    .insert({
      company_id: company.companyId,
      title: parsed.data.title,
      notes: parsed.data.notes,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: describeWriteError(error) };

  // A rodada nasce com um grupo, e o produto precisa de um para entrar. Quem
  // está começando não tem por que aprender o que é "grupo" para cotar cinco
  // itens — abre a rodada e já adiciona produto. Quem organiza por grupo
  // renomeia este e cria os outros.
  await supabase.from("purchase_round_groups").insert({
    company_id: company.companyId,
    purchase_round_id: data.id,
    name: GRUPO_PADRAO,
  });

  revalidatePath("/compras");

  if (formData.get("apos") === "abrir") {
    redirect(`/compras/${data.id}`);
  }
  return { error: null, savedAt: Date.now(), roundId: data.id };
}

/**
 * O grupo onde o produto cai quando ninguém escolheu um.
 *
 * Existe como rede: rodadas criadas antes deste comportamento não têm o grupo
 * padrão, e o insert de `createRound` pode falhar sem derrubar a criação. Em
 * qualquer um dos casos, adicionar um produto continua funcionando.
 */
async function grupoPadrao(
  companyId: string,
  roundId: string,
): Promise<{ id: string } | { erro: string }> {
  const supabase = await createServerSupabaseClient();

  const { data: existentes, error: leituraErro } = await supabase
    .from("purchase_round_groups")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("purchase_round_id", roundId)
    .order("created_at", { ascending: true });

  if (leituraErro) {
    return { erro: `Falha ao carregar os grupos: ${leituraErro.message}` };
  }

  const jaTem =
    existentes?.find((g) => g.name === GRUPO_PADRAO) ?? existentes?.[0];
  if (jaTem) return { id: jaTem.id };

  const { data: criado, error } = await supabase
    .from("purchase_round_groups")
    .insert({
      company_id: companyId,
      purchase_round_id: roundId,
      name: GRUPO_PADRAO,
    })
    .select("id")
    .single();

  if (error) return { erro: describeWriteError(error) };
  return { id: criado.id };
}

export async function createRoundGroup(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const parsed = z
    .object({
      roundId: z.uuid({ error: "Rodada inválida" }),
      name: z
        .string()
        .trim()
        .min(2, { error: "Informe o nome do grupo" })
        .max(80, { error: "Nome muito longo" }),
    })
    .safeParse({
      roundId: formData.get("roundId"),
      name: formData.get("name"),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("purchase_round_groups").insert({
    company_id: company.companyId,
    purchase_round_id: parsed.data.roundId,
    name: parsed.data.name,
  });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Esta rodada já tem um grupo com esse nome."
          : describeWriteError(error),
    };
  }

  revalidatePath(`/compras/${parsed.data.roundId}`);
  return { error: null, savedAt: Date.now() };
}

/**
 * Adiciona um produto à rodada.
 *
 * As unidades vêm do cadastro do produto e ficam COPIADAS no item: se o
 * produto for reconfigurado depois, a rodada antiga continua contando a
 * história do jeito que ela aconteceu.
 */
export async function addQuotationItem(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const parsed = z
    .object({
      roundId: z.uuid({ error: "Rodada inválida" }),
      // Sem grupo é o caso comum: a tela só pergunta isso quando a rodada tem
      // mais de um, e aí cai no padrão logo abaixo. Vazio, e não ausente —
      // `formData.get` de um campo que não existe devolve `null`, que
      // `.optional()` recusaria; a normalização é no `safeParse`.
      groupId: z.union([z.uuid({ error: "Grupo inválido" }), z.literal("")]),
      productId: z.uuid({ error: "Escolha o produto" }),
      quantity: z
        .string()
        .trim()
        .min(1, { error: "Informe a quantidade" })
        .transform((v) => Number(v.replace(/\./g, "").replace(",", ".")))
        .refine((v) => Number.isFinite(v) && v > 0, {
          error: "Quantidade deve ser maior que zero",
        }),
    })
    .safeParse({
      roundId: formData.get("roundId"),
      groupId: formData.get("groupId") ?? "",
      productId: formData.get("productId"),
      quantity: formData.get("quantity"),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let groupId: string = parsed.data.groupId;
  if (!groupId) {
    const grupo = await grupoPadrao(company.companyId, parsed.data.roundId);
    if ("erro" in grupo) return { error: grupo.erro };
    groupId = grupo.id;
  }

  const supabase = await createServerSupabaseClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("purchase_unit_id, pricing_unit_id, comparison_unit_id")
    .eq("company_id", company.companyId)
    .eq("id", parsed.data.productId)
    .maybeSingle();

  if (productError) {
    return { error: `Falha ao carregar o produto: ${productError.message}` };
  }
  if (!product) {
    return { error: "Produto não encontrado nesta empresa." };
  }

  const { data: item, error } = await supabase
    .from("quotation_items")
    .insert({
      company_id: company.companyId,
      purchase_round_id: parsed.data.roundId,
      group_id: groupId,
      product_id: parsed.data.productId,
      requested_quantity: parsed.data.quantity,
      purchase_unit_id: product.purchase_unit_id,
      pricing_unit_id: product.pricing_unit_id,
      comparison_unit_id: product.comparison_unit_id,
    })
    .select("id")
    .single();

  if (error) return { error: describeWriteError(error) };

  await linkItemToRoundSuppliers(parsed.data.roundId, item.id, groupId);

  revalidatePath(`/compras/${parsed.data.roundId}`);
  return { error: null, savedAt: Date.now() };
}

/**
 * Liga um item novo somente aos fornecedores atribuídos ao grupo dele.
 *
 * Quem já recebeu o link é marcado com `added_after_initial_send`, que é como
 * o schema registra "isto entrou depois" — o documento mestre pede que itens
 * acrescentados sejam destacados para o fornecedor, e sem essa marca não teria
 * como saber quais são.
 */
async function linkItemToRoundSuppliers(
  roundId: string,
  itemId: string,
  groupId: string,
) {
  const company = await requireActiveCompany();
  const supabase = await createServerSupabaseClient();

  const { data: assignments } = await supabase
    .from("round_supplier_groups")
    .select("round_supplier_id")
    .eq("company_id", company.companyId)
    .eq("group_id", groupId)
    .is("removed_at", null);

  const assignedIds = (assignments ?? []).map((row) => row.round_supplier_id);
  if (assignedIds.length === 0) return;

  const { data: roundSuppliers } = await supabase
    .from("round_suppliers")
    .select("id, first_sent_at")
    .eq("company_id", company.companyId)
    .eq("purchase_round_id", roundId)
    .in("id", assignedIds)
    .is("removed_at", null);

  if (!roundSuppliers || roundSuppliers.length === 0) return;

  await supabase.from("supplier_quotation_items").insert(
    roundSuppliers.map((rs) => ({
      company_id: company.companyId,
      round_supplier_id: rs.id,
      quotation_item_id: itemId,
      added_after_initial_send: rs.first_sent_at !== null,
    })),
  );
}

/**
 * Coloca um fornecedor na rodada e materializa os grupos escolhidos.
 *
 * O contato principal ativo é escolhido automaticamente: é para ele que o link
 * da cotação vai.
 */
export async function addRoundSupplier(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const parsed = z
    .object({
      roundId: z.uuid({ error: "Rodada inválida" }),
      supplierId: z.uuid({ error: "Escolha o fornecedor" }),
    })
    .safeParse({
      roundId: formData.get("roundId"),
      supplierId: formData.get("supplierId"),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabaseClient();

  const { data: contacts } = await supabase
    .from("supplier_contacts")
    .select("id, is_primary")
    .eq("company_id", company.companyId)
    .eq("supplier_id", parsed.data.supplierId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1);

  const contactId = contacts?.[0]?.id ?? null;
  if (!contactId) {
    return {
      error: "Este fornecedor não tem contato ativo. Cadastre um antes.",
    };
  }

  let groupIds = formData.getAll("groupId").map(String).filter(Boolean);
  if (groupIds.length === 0) {
    const { data: groups, error: groupsError } = await supabase
      .from("purchase_round_groups")
      .select("id")
      .eq("company_id", company.companyId)
      .eq("purchase_round_id", parsed.data.roundId)
      .in("status", ["draft", "open"]);

    if (groupsError) {
      return { error: `Falha ao carregar os grupos: ${groupsError.message}` };
    }
    groupIds = (groups ?? []).map((group) => group.id);
  }

  const { error } = await supabase.rpc("rpc_upsert_round_supplier_groups", {
    p_company_id: company.companyId,
    p_purchase_round_id: parsed.data.roundId,
    p_supplier_id: parsed.data.supplierId,
    p_supplier_contact_id: contactId,
    p_group_ids: groupIds,
  });

  if (error) return { error: descreverErroDeRpc(error.message) };

  revalidateRoundPaths(parsed.data.roundId);
  return { error: null, savedAt: Date.now() };
}

/** Salva contato e grupos de um fornecedor novo ou já participante. */
export async function upsertRoundSupplierGroups(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const parsed = z
    .object({
      roundId: z.uuid({ error: "Rodada inválida" }),
      supplierId: z.uuid({ error: "Escolha o fornecedor" }),
      contactId: z.uuid({ error: "Escolha o contato" }),
      groupIds: z.array(z.uuid()).min(1, "Escolha ao menos um grupo"),
    })
    .safeParse({
      roundId: formData.get("roundId"),
      supplierId: formData.get("supplierId"),
      contactId: formData.get("contactId"),
      groupIds: formData.getAll("groupId"),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_upsert_round_supplier_groups", {
    p_company_id: company.companyId,
    p_purchase_round_id: parsed.data.roundId,
    p_supplier_id: parsed.data.supplierId,
    p_supplier_contact_id: parsed.data.contactId,
    p_group_ids: parsed.data.groupIds,
  });

  if (error) return { error: descreverErroDeRpc(error.message) };

  revalidateRoundPaths(parsed.data.roundId);
  return { error: null, savedAt: Date.now() };
}

/** Retira a participação, revoga o link e preserva todo o histórico. */
export async function removeRoundSupplier(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const parsed = z
    .object({
      roundId: z.uuid({ error: "Rodada inválida" }),
      roundSupplierId: z.uuid({ error: "Fornecedor inválido" }),
      reason: z
        .string()
        .trim()
        .min(3, "Informe o motivo da retirada")
        .max(500, "Motivo muito longo"),
    })
    .safeParse({
      roundId: formData.get("roundId"),
      roundSupplierId: formData.get("roundSupplierId"),
      reason: formData.get("reason"),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_remove_round_supplier", {
    p_company_id: company.companyId,
    p_round_supplier_id: parsed.data.roundSupplierId,
    p_reason: parsed.data.reason,
  });

  if (error) return { error: descreverErroDeRpc(error.message) };

  revalidateRoundPaths(parsed.data.roundId);
  return { error: null, savedAt: Date.now() };
}

function revalidateRoundPaths(roundId: string) {
  revalidatePath(`/compras/${roundId}`);
  revalidatePath(`/compras/${roundId}/comparacao`);
  revalidatePath(`/compras/${roundId}/alocacao`);
  revalidatePath("/compras");
}

/**
 * O ciclo de vida da rodada mora no banco.
 *
 * Iniciar, fechar um grupo, concluir e cancelar são transições que tocam várias
 * tabelas de uma vez — status da rodada, status dos grupos, situação comercial
 * dos itens, vínculos com o fornecedor e tokens públicos. Feitas daqui seriam
 * cinco escritas sem transação: se a terceira falhasse, a rodada ficaria num
 * estado que nenhuma tela sabe desenhar.
 *
 * A 0034 tem as cinco RPCs, cada uma checando a própria permissão por dentro.
 * O que sobra aqui é traduzir a exceção do Postgres em uma frase que uma pessoa
 * lê — e devolvê-la como estado, para o erro aparecer ao lado do botão em vez
 * de virar página de erro.
 */
function descreverErroDeRpc(mensagem: string): string {
  // `require_permission` levanta "Permissão negada: chave", que é preciso mas
  // não ajuda quem lê. As demais mensagens já foram escritas para a tela.
  if (mensagem.startsWith("Permissão negada")) {
    return "Seu papel não permite esta ação.";
  }
  return mensagem;
}

/** Passa a rodada de rascunho para em andamento, abrindo os grupos junto. */
export async function activateRound(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const roundId = String(formData.get("roundId") ?? "");
  if (!roundId) return { error: "Rodada inválida." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_activate_round", {
    p_company_id: company.companyId,
    p_purchase_round_id: roundId,
  });

  if (error) return { error: descreverErroDeRpc(error.message) };

  revalidatePath(`/compras/${roundId}`);
  revalidatePath("/compras");
  return { error: null, savedAt: Date.now() };
}

/**
 * Fecha um grupo: decidi o que fazer aqui, o resto não vai ser comprado.
 *
 * O grupo anda sozinho — é o que a seção 6 do documento mestre pede. Fechar um
 * não encerra a rodada; os outros continuam recebendo preço.
 */
export async function closeRoundGroup(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const roundId = String(formData.get("roundId") ?? "");
  const groupId = String(formData.get("groupId") ?? "");
  if (!roundId || !groupId) return { error: "Grupo inválido." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_close_round_group", {
    p_company_id: company.companyId,
    p_group_id: groupId,
  });

  if (error) return { error: descreverErroDeRpc(error.message) };

  revalidatePath(`/compras/${roundId}`);
  revalidatePath("/compras");
  return { error: null, savedAt: Date.now() };
}

/** Cancela um grupo: isto não vale. Recusado se já houver compra decidida. */
export async function cancelRoundGroup(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const roundId = String(formData.get("roundId") ?? "");
  const groupId = String(formData.get("groupId") ?? "");
  if (!roundId || !groupId) return { error: "Grupo inválido." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_cancel_round_group", {
    p_company_id: company.companyId,
    p_group_id: groupId,
  });

  if (error) return { error: descreverErroDeRpc(error.message) };

  revalidatePath(`/compras/${roundId}`);
  revalidatePath("/compras");
  return { error: null, savedAt: Date.now() };
}

/**
 * Conclui a rodada.
 *
 * Encerra o que ficou em aberto e revoga os links: rodada concluída não recebe
 * mais resposta. A tela diz quantos itens vão fechar sem compra antes de
 * perguntar — a confirmação não pode ser uma surpresa.
 */
export async function completeRound(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const roundId = String(formData.get("roundId") ?? "");
  if (!roundId) return { error: "Rodada inválida." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_complete_round", {
    p_company_id: company.companyId,
    p_purchase_round_id: roundId,
  });

  if (error) return { error: descreverErroDeRpc(error.message) };

  revalidatePath(`/compras/${roundId}`);
  revalidatePath("/compras");
  return { error: null, savedAt: Date.now() };
}

/**
 * Cancela a rodada.
 *
 * Exige motivo, e o banco recusa se ela já gerou pedido: cancelar diz "isto
 * nunca aconteceu", e um fornecedor esperando mercadoria diz o contrário.
 */
export async function cancelRound(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const roundId = String(formData.get("roundId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!roundId) return { error: "Rodada inválida." };
  if (reason.length < 3) return { error: "Informe o motivo do cancelamento." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_cancel_round", {
    p_company_id: company.companyId,
    p_purchase_round_id: roundId,
    p_reason: reason,
  });

  if (error) return { error: descreverErroDeRpc(error.message) };

  revalidatePath(`/compras/${roundId}`);
  revalidatePath("/compras");
  return { error: null, savedAt: Date.now() };
}

/**
 * Corrige título e observações da rodada.
 *
 * Não exige rascunho: título e observação são como a rodada é chamada aqui
 * dentro, e não fazem parte do que o fornecedor recebeu. Rodada encerrada,
 * sim, fica intocada — histórico não se reescreve.
 */
export async function updateRound(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const parsed = z
    .object({
      roundId: z.uuid({ error: "Rodada inválida" }),
      title: z
        .string()
        .trim()
        .min(3, { error: "Dê um título à rodada" })
        .max(120, { error: "Título muito longo" }),
      notes: z
        .string()
        .trim()
        .max(500)
        .optional()
        .transform((v) => (v ? v : null)),
    })
    .safeParse({
      roundId: formData.get("roundId"),
      title: formData.get("title"),
      notes: formData.get("notes"),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("purchase_rounds")
    .update({ title: parsed.data.title, notes: parsed.data.notes })
    .eq("company_id", company.companyId)
    .eq("id", parsed.data.roundId)
    .in("status", ["draft", "active"])
    .select("id");

  if (error) return { error: describeWriteError(error) };
  if (!data || data.length === 0) {
    return { error: "Rodada encerrada não pode ser editada." };
  }

  revalidatePath(`/compras/${parsed.data.roundId}`);
  revalidatePath("/compras");
  return { error: null, savedAt: Date.now() };
}

/**
 * Confere se a rodada ainda está em preparação.
 *
 * A regra é a da seção 6.4 do documento mestre: antes do envio, edição livre;
 * depois, alteração controlada. Enquanto o fluxo controlado não existe, mexer
 * em item e grupo para no rascunho — e a checagem é feita com o client do
 * usuário, ou seja, passando pela RLS.
 */
async function assertRoundIsDraft(
  companyId: string,
  roundId: string,
): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("purchase_rounds")
    .select("status")
    .eq("company_id", companyId)
    .eq("id", roundId)
    .maybeSingle();

  if (error) return `Falha ao carregar a rodada: ${error.message}`;
  if (!data) return "Rodada não encontrada.";
  if (data.status !== "draft") {
    return "A rodada já foi iniciada. Itens e grupos não mudam mais por aqui.";
  }
  return null;
}

/** Corrige quantidade e grupo de um item, enquanto a rodada é rascunho. */
export async function updateQuotationItem(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const parsed = z
    .object({
      roundId: z.uuid({ error: "Rodada inválida" }),
      itemId: z.uuid({ error: "Item inválido" }),
      groupId: z.uuid({ error: "Escolha o grupo" }),
      quantity: z
        .string()
        .trim()
        .min(1, { error: "Informe a quantidade" })
        .transform((v) => Number(v.replace(/\./g, "").replace(",", ".")))
        .refine((v) => Number.isFinite(v) && v > 0, {
          error: "Quantidade deve ser maior que zero",
        }),
    })
    .safeParse({
      roundId: formData.get("roundId"),
      itemId: formData.get("itemId"),
      groupId: formData.get("groupId"),
      quantity: formData.get("quantity"),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const impedimento = await assertRoundIsDraft(
    company.companyId,
    parsed.data.roundId,
  );
  if (impedimento) return { error: impedimento };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("quotation_items")
    .update({
      requested_quantity: parsed.data.quantity,
      group_id: parsed.data.groupId,
    })
    .eq("company_id", company.companyId)
    .eq("id", parsed.data.itemId)
    .eq("purchase_round_id", parsed.data.roundId)
    .eq("commercial_status", "open")
    .select("id");

  if (error) return { error: describeWriteError(error) };
  if (!data || data.length === 0) {
    return { error: "Este item não está mais aberto para edição." };
  }

  revalidatePath(`/compras/${parsed.data.roundId}`);
  return { error: null, savedAt: Date.now() };
}

/**
 * Tira um item da rodada.
 *
 * Duas escritas, e as duas importam: `commercial_status = 'cancelled'` põe o
 * item fora do fluxo comercial, e `removed_at` nos vínculos o esconde do link
 * de cada fornecedor — a RPC pública filtra por `removed_at is null`. Marcar
 * só o status deixaria o item visível para quem fosse cotar.
 *
 * Cancelar em vez de apagar é a regra da casa: a decisão de tirar o item fica
 * no histórico, e nenhuma tabela tem grant de DELETE.
 */
export async function removeQuotationItem(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const roundId = String(formData.get("roundId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!roundId || !itemId) return { error: "Item inválido." };

  const impedimento = await assertRoundIsDraft(company.companyId, roundId);
  if (impedimento) return { error: impedimento };

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("quotation_items")
    .update({ commercial_status: "cancelled" })
    .eq("company_id", company.companyId)
    .eq("id", itemId)
    .eq("purchase_round_id", roundId)
    .eq("commercial_status", "open")
    .select("id");

  if (error) return { error: describeWriteError(error) };
  if (!data || data.length === 0) {
    return { error: "Este item já saiu da rodada." };
  }

  const { error: linkError } = await supabase
    .from("supplier_quotation_items")
    .update({ removed_at: new Date().toISOString() })
    .eq("company_id", company.companyId)
    .eq("quotation_item_id", itemId)
    .is("removed_at", null);

  if (linkError) {
    return {
      error: `Item saiu da rodada, mas continua no link dos fornecedores: ${linkError.message}`,
    };
  }

  revalidatePath(`/compras/${roundId}`);
  revalidatePath("/compras");
  return { error: null, savedAt: Date.now() };
}

/** Renomeia um grupo, enquanto a rodada é rascunho. */
export async function renameRoundGroup(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const parsed = z
    .object({
      roundId: z.uuid({ error: "Rodada inválida" }),
      groupId: z.uuid({ error: "Grupo inválido" }),
      name: z
        .string()
        .trim()
        .min(2, { error: "Informe o nome do grupo" })
        .max(80, { error: "Nome muito longo" }),
    })
    .safeParse({
      roundId: formData.get("roundId"),
      groupId: formData.get("groupId"),
      name: formData.get("name"),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const impedimento = await assertRoundIsDraft(
    company.companyId,
    parsed.data.roundId,
  );
  if (impedimento) return { error: impedimento };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("purchase_round_groups")
    .update({ name: parsed.data.name })
    .eq("company_id", company.companyId)
    .eq("id", parsed.data.groupId)
    .eq("purchase_round_id", parsed.data.roundId);

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Esta rodada já tem um grupo com esse nome."
          : describeWriteError(error),
    };
  }

  revalidatePath(`/compras/${parsed.data.roundId}`);
  return { error: null, savedAt: Date.now() };
}

/**
 * Troca o contato que recebe a cotação daquele fornecedor.
 *
 * `addRoundSupplier` escolhe o contato principal sozinho, e até agora não havia
 * como corrigir — apesar de a seção 5.2 existir justamente porque fornecedor
 * tem vários contatos. Vale também depois de iniciada: mudar o destinatário não
 * muda o que está sendo cotado.
 *
 * O contato precisa ser DAQUELE fornecedor, e é o trigger de integridade do
 * schema que garante isso; a mensagem dele é traduzida aqui.
 */
export async function updateRoundSupplierContact(
  _prev: RoundFormState,
  formData: FormData,
): Promise<RoundFormState> {
  const company = await requireActiveCompany();

  const parsed = z
    .object({
      roundId: z.uuid({ error: "Rodada inválida" }),
      roundSupplierId: z.uuid({ error: "Fornecedor inválido" }),
      contactId: z.uuid({ error: "Escolha o contato" }),
    })
    .safeParse({
      roundId: formData.get("roundId"),
      roundSupplierId: formData.get("roundSupplierId"),
      contactId: formData.get("contactId"),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("round_suppliers")
    .update({ supplier_contact_id: parsed.data.contactId })
    .eq("company_id", company.companyId)
    .eq("id", parsed.data.roundSupplierId)
    .eq("purchase_round_id", parsed.data.roundId)
    .select("id");

  if (error) {
    if (error.message.includes("contato")) {
      return { error: "Este contato não é deste fornecedor." };
    }
    return { error: describeWriteError(error) };
  }
  if (!data || data.length === 0) {
    return { error: "Fornecedor não encontrado nesta rodada." };
  }

  revalidatePath(`/compras/${parsed.data.roundId}`);
  return { error: null, savedAt: Date.now() };
}
