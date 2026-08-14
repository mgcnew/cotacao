/**
 * Tipos de dado de um atributo — espelha o CHECK
 * `product_attribute_definitions_data_type_check`.
 *
 * São três de propósito: o valor é gravado em `value_text`, `value_numeric` ou
 * `value_boolean`, e o CHECK da tabela de valores exige exatamente uma coluna
 * preenchida. Guardar número como texto quebraria a comparação normalizada.
 */
export const ATTRIBUTE_DATA_TYPES = [
  {
    value: "numeric",
    label: "Número",
    hint: "quantidade por pacote, gramatura, espessura",
  },
  { value: "text", label: "Texto", hint: "material, dimensão, cor" },
  { value: "boolean", label: "Sim/Não", hint: "congelado, orgânico" },
] as const;

export type AttributeDataType = (typeof ATTRIBUTE_DATA_TYPES)[number]["value"];

export const ATTRIBUTE_DATA_TYPE_VALUES = ATTRIBUTE_DATA_TYPES.map(
  (t) => t.value,
) as [AttributeDataType, ...AttributeDataType[]];

export const ATTRIBUTE_DATA_TYPE_LABEL: Record<string, string> =
  Object.fromEntries(ATTRIBUTE_DATA_TYPES.map((t) => [t.value, t.label]));

/**
 * Gera a chave técnica a partir do nome ("Quantidade por pacote" →
 * "quantidade_por_pacote"). A chave é o que identifica o atributo em
 * integrações e exportações; o nome é o que a pessoa lê.
 */
export function toAttributeKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}
