"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  ATTRIBUTE_DATA_TYPE_VALUES,
  toAttributeKey,
} from "@/features/products/attributes";
import { normalizeBarcode } from "@/features/products/barcodes";
import { PRODUCT_PURPOSE_VALUES } from "@/features/products/purposes";
import { UNIT_KIND_VALUES } from "@/features/products/units";
import { requireActiveCompany } from "@/lib/auth/dal";
import { normalizeEntityName } from "@/lib/entity-name";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Escritas do catálogo.
 *
 * Criações simples continuam usando escrita direta protegida por RLS. A
 * correção de unidades usa uma RPC porque precisa verificar e atualizar de
 * forma atômica se o produto ainda não entrou no fluxo operacional.
 *
 * Duas regras que valem para todo este arquivo:
 *  1. `company_id` vem SEMPRE de requireActiveCompany(), nunca do formulário —
 *     senão bastaria trocar um campo escondido para escrever em outra empresa;
 *  2. nada de DELETE: o schema não expõe policy de DELETE nestas tabelas, e as
 *     FKs são ON DELETE RESTRICT. Item de catálogo sai de circulação por
 *     `is_active = false`, preservando o histórico de cotações que o referencia.
 */

export type CategoryFormState = {
  error: string | null;
  /** Muda a cada gravação bem-sucedida; a UI usa para limpar o formulário. */
  savedAt?: number;
};

const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Informe o nome da categoria" })
    .max(80, { error: "Nome muito longo" }),
  description: z
    .string()
    .trim()
    .max(240, { error: "Descrição muito longa" })
    .optional()
    .transform((v) => (v ? v : null)),
});

/** Traduz erro do Postgres/PostgREST para algo acionável na tela. */
function describeWriteError(
  error: { code?: string; message: string },
  entity: string,
): string {
  if (error.code === "23505") {
    return `Já existe ${entity} com esse nome nesta empresa.`;
  }
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return "Seu papel não permite esta alteração no catálogo.";
  }
  return `Não foi possível salvar: ${error.message}`;
}

export async function createCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const company = await requireActiveCompany();

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("categories").insert({
    company_id: company.companyId,
    name: parsed.data.name,
    description: parsed.data.description,
  });

  if (error) {
    return { error: describeWriteError(error, "uma categoria") };
  }

  revalidatePath("/produtos/categorias");
  revalidatePath("/produtos");
  // O cadastro de produto passou a criar categoria sem sair de lá; sem esta
  // linha, a categoria nasceria e o select continuaria sem ela.
  revalidatePath("/produtos/novo");
  return { error: null, savedAt: Date.now() };
}

export type AttributeFormState = {
  error: string | null;
  savedAt?: number;
};

const attributeSchema = z.object({
  categoryId: z.uuid({ error: "Categoria inválida" }),
  name: z
    .string()
    .trim()
    .min(2, { error: "Informe o nome do atributo" })
    .max(60, { error: "Nome muito longo" }),
  dataType: z.enum(ATTRIBUTE_DATA_TYPE_VALUES, {
    error: "Escolha o tipo do atributo",
  }),
  unitId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  isRequired: z.boolean(),
  isConversionFactor: z.boolean(),
});

/**
 * Cria um atributo de categoria (ex.: "quantidade por pacote" em Embalagens).
 *
 * A checagem de chave repetida é feita aqui, não no banco: não existe UNIQUE
 * sobre (company_id, category_id, key). É uma validação de aplicação, e
 * portanto sujeita a corrida — duas criações simultâneas do mesmo nome
 * passariam. Na prática é cadastro manual e raro; se virar problema, a solução
 * certa é um índice único, não mais código aqui.
 */
export async function createAttributeDefinition(
  _prev: AttributeFormState,
  formData: FormData,
): Promise<AttributeFormState> {
  const company = await requireActiveCompany();

  const parsed = attributeSchema.safeParse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    dataType: formData.get("dataType"),
    unitId: formData.get("unitId"),
    isRequired: formData.get("isRequired") === "on",
    isConversionFactor: formData.get("isConversionFactor") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // O banco recusa fator de conversão em atributo não numérico; avisamos antes
  // para a pessoa não perder o que digitou.
  if (parsed.data.isConversionFactor && parsed.data.dataType !== "numeric") {
    return { error: "Fator de conversão só vale para atributo numérico." };
  }

  const key = toAttributeKey(parsed.data.name);
  if (!key) {
    return { error: "O nome precisa ter letras ou números." };
  }

  const supabase = await createServerSupabaseClient();

  const { data: existing, error: readError } = await supabase
    .from("product_attribute_definitions")
    .select("id")
    .eq("company_id", company.companyId)
    .eq("category_id", parsed.data.categoryId)
    .eq("key", key)
    .maybeSingle();

  if (readError) {
    return { error: `Não foi possível verificar duplicidade: ${readError.message}` };
  }
  if (existing) {
    return { error: "Esta categoria já tem um atributo com esse nome." };
  }

  const { error } = await supabase
    .from("product_attribute_definitions")
    .insert({
      company_id: company.companyId,
      category_id: parsed.data.categoryId,
      // product_id fica nulo: o CHECK exige exatamente um dos dois.
      name: parsed.data.name,
      key,
      data_type: parsed.data.dataType,
      unit_id: parsed.data.unitId,
      is_required: parsed.data.isRequired,
      is_conversion_factor: parsed.data.isConversionFactor,
    });

  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "Esta categoria já tem um fator de conversão ativo. Desative o atual antes de definir outro.",
      };
    }
    return { error: describeWriteError(error, "um atributo") };
  }

  revalidatePath(`/produtos/categorias/${parsed.data.categoryId}/atributos`);
  revalidatePath("/produtos/novo");
  return { error: null, savedAt: Date.now() };
}

export async function setAttributeDefinitionActive(
  definitionId: string,
  categoryId: string,
  isActive: boolean,
) {
  const company = await requireActiveCompany();

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("product_attribute_definitions")
    .update({ is_active: isActive })
    .eq("id", definitionId)
    .eq("company_id", company.companyId);

  if (error) {
    throw new Error(describeWriteError(error, "um atributo"));
  }

  revalidatePath(`/produtos/categorias/${categoryId}/atributos`);
  revalidatePath("/produtos/novo");
}

export type ProductFormState = {
  error: string | null;
  savedAt?: number;
  /** Nome do último produto gravado, para confirmar na tela sem recarregar. */
  savedName?: string;
};

export type ProductUnitEditState = {
  error: string | null;
  savedAt?: number;
};

export type BulkProductUnitEditState = {
  error: string | null;
  savedAt?: number;
  updated?: number;
  skipped?: { productId: string; productName: string | null; reason: string }[];
};

const productUnitsSchema = z.object({
  purchaseUnitId: z.uuid({ error: "Escolha a unidade de compra" }),
  pricingUnitId: z.uuid({ error: "Escolha a unidade de precificação" }),
  comparisonUnitId: z
    .string()
    .optional()
    .transform((value) => value || null)
    .refine((value) => value === null || z.uuid().safeParse(value).success, {
      error: "Unidade de comparação inválida",
    }),
});

export async function updateUnusedProductUnits(
  productId: string,
  _previous: ProductUnitEditState,
  formData: FormData,
): Promise<ProductUnitEditState> {
  const company = await requireActiveCompany();
  const parsed = productUnitsSchema.safeParse({
    purchaseUnitId: formData.get("purchaseUnitId"),
    pricingUnitId: formData.get("pricingUnitId"),
    comparisonUnitId: formData.get("comparisonUnitId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("rpc_update_unused_product_units", {
    p_company_id: company.companyId,
    p_product_id: productId,
    p_purchase_unit_id: parsed.data.purchaseUnitId,
    p_pricing_unit_id: parsed.data.pricingUnitId,
    p_comparison_unit_id: parsed.data.comparisonUnitId,
  });
  if (error) return { error: error.message };

  revalidatePath("/produtos");
  revalidatePath(`/produtos/historico/${productId}`);
  return { error: null, savedAt: Date.now() };
}

const bulkProductUnitsSchema = z
  .array(
    z.object({
      productId: z.uuid(),
      purchaseUnitId: z.uuid(),
      pricingUnitId: z.uuid(),
      comparisonUnitId: z.uuid().nullable(),
    }),
  )
  .min(1, { error: "Aplique pelo menos uma alteração antes de salvar" })
  .max(2000, { error: "Atualize no máximo 2000 produtos por vez" });

/** Salva uma revisão inteira em uma única transação no banco. */
export async function updateUnusedProductUnitsBulk(
  _previous: BulkProductUnitEditState,
  formData: FormData,
): Promise<BulkProductUnitEditState> {
  const company = await requireActiveCompany();
  const raw = formData.get("changes");
  if (typeof raw !== "string") {
    return { error: "As alterações não foram recebidas" };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return { error: "As alterações recebidas são inválidas" };
  }

  const parsed = bulkProductUnitsSchema.safeParse(decoded);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "rpc_bulk_update_unused_product_units",
    {
      p_company_id: company.companyId,
      p_changes: parsed.data,
    },
  );
  if (error) return { error: error.message };

  const result = data as unknown as {
    updated?: number;
    skipped?: {
      productId: string;
      productName: string | null;
      reason: string;
    }[];
  } | null;
  const updated = Number(result?.updated ?? 0);
  const skipped = Array.isArray(result?.skipped) ? result.skipped : [];

  revalidatePath("/produtos");
  revalidatePath("/produtos/correcao-unidades");
  return { error: null, savedAt: Date.now(), updated, skipped };
}

const productSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Informe o nome do produto" })
    .max(120, { error: "Nome muito longo" }),
  categoryId: z.uuid({ error: "Escolha uma categoria" }),
  purpose: z.enum(PRODUCT_PURPOSE_VALUES, { error: "Escolha a finalidade" }),
  purchaseUnitId: z.uuid({ error: "Escolha a unidade de compra" }),
  pricingUnitId: z.uuid({ error: "Escolha a unidade de precificação" }),
  // Opcional no banco: sem ela, a comparação usa a unidade de precificação.
  comparisonUnitId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.uuid().safeParse(v).success, {
      error: "Unidade de comparação inválida",
    }),
  description: z
    .string()
    .trim()
    .max(500, { error: "Observações muito longas" })
    .optional()
    .transform((v) => (v ? v : null)),
  barcode: z
    .string()
    .trim()
    .max(64, { error: "Código de barras muito longo" })
    .optional()
    .transform((v) => (v ? normalizeBarcode(v) : null))
    .refine((v) => v === null || v.length >= 3, {
      error: "Código de barras muito curto",
    }),
});

/**
 * Cadastra um produto.
 *
 * As três unidades são o coração do módulo: compra-se em caixa, o fornecedor
 * cota por pacote e a comparação precisa cair numa base comum. Sem isso, as
 * respostas de fornecedores diferentes não são comparáveis.
 *
 * Categoria e unidades não são validadas contra o banco aqui de propósito: as
 * FKs são compostas — `(company_id, category_id)` e `(company_id, unit_id)` —
 * então um id de outra empresa é recusado pela própria FK, não por uma
 * consulta que eu poderia esquecer de escrever.
 */
export async function createProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const company = await requireActiveCompany();

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
    purpose: formData.get("purpose"),
    purchaseUnitId: formData.get("purchaseUnitId"),
    pricingUnitId: formData.get("pricingUnitId"),
    comparisonUnitId: formData.get("comparisonUnitId"),
    description: formData.get("description"),
    barcode: formData.get("barcode"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createServerSupabaseClient();

  const { data: productWithName, error: nameReadError } = await supabase
    .from("products")
    .select("id")
    .eq("company_id", company.companyId)
    .eq("normalized_name", normalizeEntityName(parsed.data.name))
    .limit(1)
    .maybeSingle();

  if (nameReadError) {
    return {
      error: `Não foi possível verificar o nome do produto: ${nameReadError.message}`,
    };
  }
  if (productWithName) {
    return { error: "Já existe um produto com este nome nesta empresa." };
  }

  if (parsed.data.barcode) {
    const { data: barcodeInUse, error: barcodeReadError } = await supabase
      .from("product_barcodes")
      .select("id")
      .eq("company_id", company.companyId)
      .eq("code", parsed.data.barcode)
      .maybeSingle();

    if (barcodeReadError) {
      return { error: `Falha ao verificar o código: ${barcodeReadError.message}` };
    }
    if (barcodeInUse) {
      return { error: "Este código de barras já pertence a outro produto." };
    }
  }

  // Os atributos da categoria são lidos do banco, não do formulário: o que o
  // cliente manda é só o valor digitado. Assim um campo forjado no HTML não
  // vira atributo, e obrigatório continua obrigatório.
  const { data: definitions, error: defsError } = await supabase
    .from("product_attribute_definitions")
    .select("id, name, data_type, is_required")
    .eq("company_id", company.companyId)
    .eq("category_id", parsed.data.categoryId)
    .eq("is_active", true);

  if (defsError) {
    return { error: `Falha ao carregar atributos: ${defsError.message}` };
  }

  const values: {
    attribute_definition_id: string;
    value_text: string | null;
    value_numeric: number | null;
    value_boolean: boolean | null;
  }[] = [];

  for (const def of definitions ?? []) {
    const raw = String(formData.get(`attr_${def.id}`) ?? "").trim();

    if (!raw) {
      if (def.is_required) {
        return { error: `Preencha o atributo obrigatório "${def.name}".` };
      }
      continue; // Opcional em branco: não grava linha nenhuma.
    }

    if (def.data_type === "numeric") {
      // Aceita vírgula decimal: é como se digita em português.
      const parsedNumber = Number(raw.replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(parsedNumber)) {
        return { error: `O atributo "${def.name}" precisa ser um número.` };
      }
      values.push({
        attribute_definition_id: def.id,
        value_text: null,
        value_numeric: parsedNumber,
        value_boolean: null,
      });
    } else if (def.data_type === "boolean") {
      values.push({
        attribute_definition_id: def.id,
        value_text: null,
        value_numeric: null,
        value_boolean: raw === "true",
      });
    } else {
      values.push({
        attribute_definition_id: def.id,
        value_text: raw,
        value_numeric: null,
        value_boolean: null,
      });
    }
  }

  const { data: created, error } = await supabase
    .from("products")
    .insert({
      company_id: company.companyId,
      name: parsed.data.name,
      category_id: parsed.data.categoryId,
      purpose: parsed.data.purpose,
      purchase_unit_id: parsed.data.purchaseUnitId,
      pricing_unit_id: parsed.data.pricingUnitId,
      comparison_unit_id: parsed.data.comparisonUnitId,
      description: parsed.data.description,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "Categoria ou unidade não pertence a esta empresa. Recarregue a página e tente de novo.",
      };
    }
    return { error: describeWriteError(error, "um produto") };
  }

  if (values.length > 0) {
    // Um único insert com várias linhas: o Postgres trata como uma instrução,
    // então ou entram todos os atributos ou nenhum. O que não dá para garantir
    // sem uma RPC é a atomicidade ENTRE produto e atributos — por isso os
    // valores são validados antes, e a mensagem abaixo é específica.
    const { error: valuesError } = await supabase
      .from("product_attribute_values")
      .insert(
        values.map((v) => ({
          ...v,
          company_id: company.companyId,
          product_id: created.id,
        })),
      );

    if (valuesError) {
      return {
        error: `Produto "${parsed.data.name}" foi criado, mas os atributos não: ${valuesError.message}. Edite o produto para completar.`,
      };
    }
  }

  if (parsed.data.barcode) {
    const { error: barcodeError } = await supabase.from("product_barcodes").insert({
      company_id: company.companyId,
      product_id: created.id,
      code: parsed.data.barcode,
      is_primary: true,
    });

    if (barcodeError) {
      return {
        error: `Produto "${parsed.data.name}" foi criado, mas o código de barras não: ${barcodeError.message}.`,
      };
    }
  }

  revalidatePath("/produtos");
  return { error: null, savedAt: Date.now(), savedName: parsed.data.name };
}

export async function setProductActive(productId: string, isActive: boolean) {
  const company = await requireActiveCompany();

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", productId)
    .eq("company_id", company.companyId);

  if (error) {
    throw new Error(describeWriteError(error, "um produto"));
  }

  revalidatePath("/produtos");
}

export type UnitFormState = {
  error: string | null;
  savedAt?: number;
};

const unitSchema = z.object({
  // O código é o identificador curto que aparece nas tabelas de cotação.
  // Normalizado para minúsculas porque `kg` e `KG` seriam duas unidades
  // diferentes para o UNIQUE (company_id, code), e iguais para o usuário.
  code: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, { error: "Informe o código" })
    .max(12, { error: "Código muito longo — use algo curto, como kg ou cx" }),
  name: z
    .string()
    .trim()
    .min(2, { error: "Informe o nome da unidade" })
    .max(60, { error: "Nome muito longo" }),
  symbol: z
    .string()
    .trim()
    .max(12, { error: "Símbolo muito longo" })
    .optional(),
  kind: z.enum(UNIT_KIND_VALUES, { error: "Escolha o tipo da unidade" }),
});

export async function createUnit(
  _prev: UnitFormState,
  formData: FormData,
): Promise<UnitFormState> {
  const company = await requireActiveCompany();

  const parsed = unitSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    symbol: formData.get("symbol"),
    kind: formData.get("kind"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("units").insert({
    company_id: company.companyId,
    code: parsed.data.code,
    name: parsed.data.name,
    // Sem símbolo próprio, o código serve — é assim que vêm as unidades padrão.
    symbol: parsed.data.symbol || parsed.data.code,
    kind: parsed.data.kind,
  });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? `Já existe uma unidade com o código "${parsed.data.code}".`
          : describeWriteError(error, "uma unidade"),
    };
  }

  revalidatePath("/produtos/unidades");
  revalidatePath("/produtos");
  revalidatePath("/produtos/novo");
  return { error: null, savedAt: Date.now() };
}

export async function setUnitActive(unitId: string, isActive: boolean) {
  const company = await requireActiveCompany();

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("units")
    .update({ is_active: isActive })
    .eq("id", unitId)
    .eq("company_id", company.companyId);

  if (error) {
    throw new Error(describeWriteError(error, "uma unidade"));
  }

  revalidatePath("/produtos/unidades");
  revalidatePath("/produtos");
}

/**
 * Ativa ou desativa uma categoria.
 *
 * O `.eq("company_id")` é redundante diante da RLS e fica de propósito: deixa a
 * intenção explícita e protege contra um id de outra empresa chegar aqui.
 */
export async function setCategoryActive(categoryId: string, isActive: boolean) {
  const company = await requireActiveCompany();

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("categories")
    .update({ is_active: isActive })
    .eq("id", categoryId)
    .eq("company_id", company.companyId);

  if (error) {
    throw new Error(describeWriteError(error, "uma categoria"));
  }

  revalidatePath("/produtos/categorias");
  revalidatePath("/produtos");
}
