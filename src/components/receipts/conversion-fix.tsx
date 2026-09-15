"use client";

import { Pencil } from "lucide-react";
import * as React from "react";

import { ErrorLine } from "@/components/layout/form-feedback";
import {
  parsedDecimal,
  totalForXmlUnit,
  type AppliedConversion,
  type NfeUnitRule,
} from "@/components/receipts/nfe-import-panel";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/ui/themed-select";
import { saveSupplierProductNfeUnitRule } from "@/features/receipts/actions";
import { type NfeItem } from "@/features/receipts/nfe";
import {
  canonicalConversionFactor,
  entryValueFromCanonicalFactor,
  preferredFixedConversionEntry,
} from "@/features/receipts/unit-conversion";

const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const DECIMAL = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 6,
  useGrouping: false,
});

/**
 * Até quando a correção vale.
 *
 * A embalagem mudar de verdade e o fornecedor mandar uma caixa fora do padrão
 * são coisas diferentes com a mesma aparência na tela. Gravar sempre
 * contaminaria as notas seguintes com uma exceção; nunca gravar obrigaria a
 * repetir a mesma correção em toda nota. Quem está com a caixa na mão sabe
 * qual dos dois é — então a pergunta é feita, não adivinhada.
 */
type Scope = "rule" | "invoice";

export function ConversionFix({
  receiptId,
  orderItemId,
  applied,
  targetUnit,
  xmlItems,
  onApply,
}: {
  receiptId: string;
  orderItemId: string;
  applied: AppliedConversion;
  targetUnit: string;
  xmlItems: NfeItem[];
  onApply: (rule: NfeUnitRule) => void;
}) {
  const { rule, targetKind } = applied;
  const [open, setOpen] = React.useState(false);
  const [scope, setScope] = React.useState<Scope>("rule");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const sourceTotal = totalForXmlUnit(xmlItems, rule.xmlUnit);
  const entry = preferredFixedConversionEntry(rule.xmlUnit, targetUnit);
  const currentEntryValue = entryValueFromCanonicalFactor({
    entry,
    factor: rule.factor,
    sourceQuantity: sourceTotal,
  });
  const currentEntryText =
    currentEntryValue === null ? "" : DECIMAL.format(currentEntryValue);
  const [entryValue, setEntryValue] = React.useState(currentEntryText);

  const factor = canonicalConversionFactor({
    entry,
    value: parsedDecimal(entryValue),
    sourceQuantity: sourceTotal,
  });
  const preview =
    sourceTotal !== null && factor !== null ? sourceTotal * factor : null;
  const byWeight = entry === "target_to_source";

  async function apply() {
    if (factor === null) return;
    setSaving(true);
    setError(null);
    if (scope === "invoice") {
      onApply({ ...rule, mode: "fixed_factor", factor });
      setSaving(false);
      setOpen(false);
      return;
    }
    const data = new FormData();
    data.set("receiptId", receiptId);
    data.set("orderRevisionItemId", orderItemId);
    data.set("xmlUnit", rule.xmlUnit);
    data.set("targetKind", targetKind);
    data.set("targetUnit", targetUnit);
    data.set("mode", "fixed_factor");
    data.set("factor", String(factor));
    const result = await saveSupplierProductNfeUnitRule(data);
    if (result.error || !result.rule) {
      setError(result.error ?? "Não foi possível salvar a conversão.");
      setSaving(false);
      return;
    }
    onApply(result.rule);
    setSaving(false);
    setOpen(false);
  }

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={() => {
          // Reabrir depois de uma correção precisa partir do valor que passou
          // a valer, não do que estava em tela quando ela foi aplicada.
          setEntryValue(currentEntryText);
          setError(null);
          setOpen(true);
        }}
      >
        <Pencil className="size-3" aria-hidden />
        Corrigir conversão
      </Button>
    );
  }

  return (
    <div className="border-warning/40 bg-warning/5 mt-2 rounded-lg border p-3">
      <p className="text-fg text-xs font-medium">
        Quanto vale 1 {rule.xmlUnit} hoje?
      </p>
      <p className="text-fg-muted mt-1 text-xs">
        O sistema usa{" "}
        <strong>
          {byWeight
            ? `${QTY.format(currentEntryValue ?? 0)} ${rule.xmlUnit} por ${targetUnit}`
            : `${QTY.format(currentEntryValue ?? 0)} ${targetUnit} por ${rule.xmlUnit}`}
        </strong>
        , aprendido numa nota anterior deste fornecedor.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_minmax(12rem,1fr)_auto] sm:items-end">
        <div>
          <label
            htmlFor={`fix-value-${orderItemId}-${targetKind}`}
            className="text-fg-muted mb-1 block text-xs"
          >
            {byWeight
              ? `Peso ou medida de cada ${targetUnit}`
              : `Quantidade de ${targetUnit} por ${rule.xmlUnit}`}
          </label>
          <input
            id={`fix-value-${orderItemId}-${targetKind}`}
            className="border-input bg-background text-fg h-9 w-full min-w-0 rounded-lg border px-3 text-sm"
            inputMode="decimal"
            value={entryValue}
            onChange={(event) => setEntryValue(event.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor={`fix-scope-${orderItemId}-${targetKind}`}
            className="text-fg-muted mb-1 block text-xs"
          >
            Vale a partir de quando
          </label>
          <ThemedSelect
            id={`fix-scope-${orderItemId}-${targetKind}`}
            value={scope}
            onValueChange={(selected) => setScope(selected as Scope)}
            options={[
              {
                value: "rule",
                label: "A embalagem mudou — vale daqui em diante",
              },
              { value: "invoice", label: "Só nesta nota" },
            ]}
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={saving || factor === null}
            onClick={() => void apply()}
          >
            {saving ? "Aplicando…" : "Aplicar"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => setOpen(false)}
          >
            Cancelar
          </Button>
        </div>
      </div>
      {preview !== null && sourceTotal !== null ? (
        <p className="bg-surface-muted text-fg mt-3 rounded-lg px-3 py-2 text-xs">
          Prévia: {QTY.format(sourceTotal)} {rule.xmlUnit} passam a valer{" "}
          <strong>
            {QTY.format(preview)} {targetUnit}
          </strong>
          {scope === "rule"
            ? " — e as próximas notas deste fornecedor usarão esta conta."
            : " — só nesta nota; a regra guardada fica como está."}
        </p>
      ) : null}
      <div className="mt-2">
        <ErrorLine error={error} />
      </div>
    </div>
  );
}
