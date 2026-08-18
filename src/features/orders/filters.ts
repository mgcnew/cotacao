import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ORDER_STATUS_LABEL } from "@/features/orders/queries";

/**
 * Recorte da lista de pedidos.
 *
 * Mesmo desenho dos filtros das Análises: mora na URL, é um GET comum e
 * funciona sem JavaScript — então dá para compartilhar "os pedidos atrasados
 * do frigorífico" como um link, e o botão de voltar faz o que promete.
 */

/**
 * Situações que não são um status do banco, e sim um jeito de olhar.
 *
 * "Entrega hoje" é recorte de prazo, não de estado — quem chega por aqui vem
 * da Central de Atenção querendo saber o que chega no dia.
 */
export const SITUACOES_COMPOSTAS = {
  abertos: "Em aberto",
  atrasados: "Atrasados",
  entrega_hoje: "Entrega hoje",
} as const;

export type OrderFilters = {
  situacao: string | null;
  fornecedorId: string | null;
  de: string | null;
  ate: string | null;
  numero: number | null;
};

const VAZIO: OrderFilters = {
  situacao: null,
  fornecedorId: null,
  de: null,
  ate: null,
  numero: null,
};

function texto(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const limpo = (raw ?? "").trim();
  return limpo === "" ? null : limpo;
}

// O valor vem da URL, onde qualquer um digita qualquer coisa. Id que não é
// UUID chega ao Postgres e derruba a página com "invalid input syntax"; filtro
// inválido é filtro ignorado.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function id(value: string | string[] | undefined): string | null {
  const raw = texto(value);
  if (!raw) return null;
  return UUID.test(raw) ? raw : null;
}

function data(value: string | string[] | undefined): string | null {
  const raw = texto(value);
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function situacao(value: string | string[] | undefined): string | null {
  const raw = texto(value);
  if (!raw) return null;
  const valida = raw in ORDER_STATUS_LABEL || raw in SITUACOES_COMPOSTAS;
  return valida ? raw : null;
}

function numero(value: string | string[] | undefined): number | null {
  const raw = texto(value);
  if (!raw) return null;
  const n = Number(raw.replace(/\D/g, ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function parseOrderFilters(
  searchParams: Record<string, string | string[] | undefined>,
): OrderFilters {
  return {
    ...VAZIO,
    situacao: situacao(searchParams.situacao),
    fornecedorId: id(searchParams.fornecedor),
    de: data(searchParams.de),
    ate: data(searchParams.ate),
    numero: numero(searchParams.numero),
  };
}

export function hasAnyOrderFilter(f: OrderFilters): boolean {
  return contarOrderFilters(f) > 0;
}

/** Quantos filtros estão valendo — é o número que aparece no botão. */
export function contarOrderFilters(f: OrderFilters): number {
  return Object.values(f).filter((v) => v !== null).length;
}

/**
 * Fornecedores do seletor.
 *
 * Todos, inclusive os inativos: um fornecedor com quem a empresa parou de
 * comprar continua tendo pedidos no histórico, e escondê-lo aqui tornaria
 * esses pedidos infiltráveis.
 */
export async function listOrderFilterSuppliers(companyId: string) {
  const supabase = await createServerSupabaseClient();

  const { data: rows, error } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name");

  if (error) throw new Error(`Falha ao listar fornecedores: ${error.message}`);
  return rows ?? [];
}
