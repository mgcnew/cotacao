/**
 * Tipos de unidade aceitos pelo banco.
 *
 * A lista espelha o CHECK `units_kind_check`. Se divergir, o insert falha no
 * banco — por isso ela fica em um módulo só, compartilhado entre o formulário
 * (cliente) e a validação (servidor), em vez de repetida nos dois lugares.
 */
export const UNIT_KINDS = [
  { value: "mass", label: "Massa", hint: "kg, g" },
  { value: "count", label: "Contagem", hint: "un, pç" },
  { value: "package", label: "Embalagem", hint: "cx, fardo, pacote" },
  { value: "volume", label: "Volume", hint: "L, mL" },
  { value: "length", label: "Comprimento", hint: "m, cm" },
  { value: "area", label: "Área", hint: "m²" },
  { value: "other", label: "Outro", hint: "" },
] as const;

export type UnitKind = (typeof UNIT_KINDS)[number]["value"];

export const UNIT_KIND_VALUES = UNIT_KINDS.map((k) => k.value) as [
  UnitKind,
  ...UnitKind[],
];

export const UNIT_KIND_LABEL: Record<string, string> = Object.fromEntries(
  UNIT_KINDS.map((k) => [k.value, k.label]),
);
