/**
 * Finalidade do produto — espelha o CHECK `products_purpose_check`.
 *
 * O catálogo é único: revenda e uso interno convivem na mesma tabela, como
 * manda o documento mestre. A finalidade é o que os distingue, sem criar um
 * módulo separado de insumos.
 */
export const PRODUCT_PURPOSES = [
  { value: "resale", label: "Revenda", hint: "vai para a venda ao cliente" },
  { value: "internal", label: "Uso interno", hint: "consumo da operação" },
  { value: "production", label: "Produção", hint: "entra em outro produto" },
  { value: "packaging", label: "Embalagem", hint: "sacola, caixa, filme" },
  { value: "other", label: "Outro", hint: "" },
] as const;

export type ProductPurpose = (typeof PRODUCT_PURPOSES)[number]["value"];

export const PRODUCT_PURPOSE_VALUES = PRODUCT_PURPOSES.map((p) => p.value) as [
  ProductPurpose,
  ...ProductPurpose[],
];

export const PRODUCT_PURPOSE_LABEL: Record<string, string> = Object.fromEntries(
  PRODUCT_PURPOSES.map((p) => [p.value, p.label]),
);
