"use client";

import Link from "next/link";
import { useActionState, useMemo } from "react";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
import {
  useFechaModalAoConcluir,
  useModalDeRota,
} from "@/components/layout/route-modal";
import { Button } from "@/components/ui/button";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  updateUnusedProductUnits,
  type ProductUnitEditState,
} from "@/features/products/actions";

type UnitOption = { id: string; label: string };

const INITIAL_STATE: ProductUnitEditState = { error: null };

export function ProductUnitEditForm({
  product,
  units,
  lockReason,
  inModal = false,
}: {
  product: {
    id: string;
    name: string;
    purchaseUnitId: string;
    pricingUnitId: string;
    comparisonUnitId: string | null;
  };
  units: UnitOption[];
  lockReason: string | null;
  inModal?: boolean;
}) {
  const modal = useModalDeRota();
  const boundAction = useMemo(
    () => updateUnusedProductUnits.bind(null, product.id),
    [product.id],
  );
  const action = useFechaModalAoConcluir(boundAction);
  const [state, formAction] = useActionState(action, INITIAL_STATE);

  const fields = lockReason ? (
    <p className="border-warning/30 bg-warning-soft text-warning rounded-lg border px-3 py-2.5 text-sm">
      {lockReason}
    </p>
  ) : (
    <>
      <p className="text-fg-muted text-sm">
        A unidade de compra define a quantidade pedida. A de precificação é a
        base usada pelo fornecedor; sem unidade de comparação, o sistema usa a
        de precificação.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-fg-muted grid gap-1.5 text-sm">
          Unidade de compra
          <ThemedSelect
            id="edit-purchase-unit"
            name="purchaseUnitId"
            defaultValue={product.purchaseUnitId}
            required
            options={units.map((unit) => ({
              value: unit.id,
              label: unit.label,
            }))}
          />
        </label>
        <label className="text-fg-muted grid gap-1.5 text-sm">
          Unidade de precificação
          <ThemedSelect
            id="edit-pricing-unit"
            name="pricingUnitId"
            defaultValue={product.pricingUnitId}
            required
            options={units.map((unit) => ({
              value: unit.id,
              label: unit.label,
            }))}
          />
        </label>
        <label className="text-fg-muted grid gap-1.5 text-sm">
          Unidade de comparação
          <ThemedSelect
            id="edit-comparison-unit"
            name="comparisonUnitId"
            defaultValue={product.comparisonUnitId ?? ""}
            placeholder="Opcional"
            emptyOptionLabel="Usar a de precificação"
            options={units.map((unit) => ({
              value: unit.id,
              label: unit.label,
            }))}
          />
        </label>
      </div>
    </>
  );

  const feedback = (
    <>
      <ErrorLine error={state.error} />
      <SuccessLine
        message={state.savedAt ? "Unidades atualizadas com segurança." : null}
      />
    </>
  );

  return (
    <form action={formAction}>
      {inModal ? (
        <DialogBody className="space-y-4">
          {fields}
          {feedback}
        </DialogBody>
      ) : (
        <section className="border-border bg-surface space-y-4 rounded-xl border p-5">
          {fields}
          {feedback}
        </section>
      )}
      {inModal ? (
        <DialogFooter className="justify-end">
          <Button type="button" variant="ghost" onClick={modal?.fechar}>
            Cancelar
          </Button>
          {!lockReason ? (
            <FormSubmitButton pendingLabel="Salvando…">
              Salvar unidades
            </FormSubmitButton>
          ) : null}
        </DialogFooter>
      ) : (
        <div className="mt-4 flex justify-end gap-2">
          <Button asChild variant="ghost">
            <Link href="/produtos">Cancelar</Link>
          </Button>
          {!lockReason ? (
            <FormSubmitButton pendingLabel="Salvando…">
              Salvar unidades
            </FormSubmitButton>
          ) : null}
        </div>
      )}
    </form>
  );
}
