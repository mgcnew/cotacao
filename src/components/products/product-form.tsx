"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  NovaCategoriaDialog,
  NovaUnidadeDialog,
} from "@/components/products/catalog-dialogs";
import {
  useFechaModalAoConcluir,
  useModalDeRota,
} from "@/components/layout/route-modal";
import { Button } from "@/components/ui/button";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  createProduct,
  type ProductFormState,
} from "@/features/products/actions";
import { PRODUCT_PURPOSES } from "@/features/products/purposes";

type Option = { id: string; label: string };

export type FormAttribute = {
  id: string;
  categoryId: string;
  name: string;
  dataType: "text" | "numeric" | "boolean";
  unitSymbol: string | null;
  isRequired: boolean;
};

type Props = {
  categories: Option[];
  units: Option[];
  /** Atributos ativos de todas as categorias; a tela mostra os da escolhida. */
  attributes: FormAttribute[];
};

const selectClass =
  "border-input bg-transparent text-fg shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full cursor-pointer rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30 dark:disabled:bg-input/80 [&>option]:bg-popover [&>option]:text-popover-foreground";

function Field({
  label,
  htmlFor,
  hint,
  acao,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  /** Atalho ao lado do rótulo — "criar o que falta", sem sair daqui. */
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-fg text-sm font-medium">
          {label}
        </label>
        {acao}
      </div>
      {children}
      {hint ? <p className="text-fg-subtle text-xs">{hint}</p> : null}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Cadastrar produto"}
    </Button>
  );
}

export function ProductForm({ categories, units, attributes }: Props) {
  const modal = useModalDeRota();
  const [state, formAction] = useActionState<ProductFormState, FormData>(
    useFechaModalAoConcluir(createProduct),
    { error: null },
  );
  const [categoryId, setCategoryId] = React.useState("");

  // Só os atributos da categoria escolhida — é o que "esses campos só aparecem
  // quando relevantes" quer dizer na prática.
  const visibleAttributes = attributes.filter(
    (a) => a.categoryId === categoryId,
  );

  const conteudo = (
    <>
      <section className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nome" htmlFor="name">
            <Input
              id="name"
              name="name"
              required
              autoFocus
              maxLength={120}
              placeholder="Coxa e sobrecoxa congelada"
            />
          </Field>

          <Field
            label="Categoria"
            htmlFor="categoryId"
            acao={<NovaCategoriaDialog />}
          >
            <ThemedSelect
              id="categoryId"
              name="categoryId"
              required
              value={categoryId}
              onValueChange={setCategoryId}
              options={categories.map((category) => ({
                value: category.id,
                label: category.label,
              }))}
            />
          </Field>

          <Field label="Finalidade" htmlFor="purpose">
            <ThemedSelect
              id="purpose"
              name="purpose"
              required
              defaultValue="resale"
              options={PRODUCT_PURPOSES.map((purpose) => ({
                value: purpose.value,
                label: purpose.hint
                  ? `${purpose.label} — ${purpose.hint}`
                  : purpose.label,
              }))}
            />
          </Field>
        </div>
      </section>

      <section className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-fg text-sm font-semibold">Unidades</h2>
            <p className="text-fg-muted mt-1 text-sm">
              É o que permite comparar propostas diferentes. Se um fornecedor
              cota o pacote com 400 e outro o pacote com 500, a comparação só
              faz sentido numa base comum.
            </p>
          </div>
          <NovaUnidadeDialog />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="De compra"
            htmlFor="purchaseUnitId"
            hint="Como você compra"
          >
            <ThemedSelect
              id="purchaseUnitId"
              name="purchaseUnitId"
              required
              options={units.map((unit) => ({
                value: unit.id,
                label: unit.label,
              }))}
            />
          </Field>

          <Field
            label="De precificação"
            htmlFor="pricingUnitId"
            hint="Como o fornecedor cota"
          >
            <ThemedSelect
              id="pricingUnitId"
              name="pricingUnitId"
              required
              options={units.map((unit) => ({
                value: unit.id,
                label: unit.label,
              }))}
            />
          </Field>

          <Field
            label="De comparação"
            htmlFor="comparisonUnitId"
            hint="Em branco: usa a de precificação"
          >
            <ThemedSelect
              id="comparisonUnitId"
              name="comparisonUnitId"
              placeholder="—"
              emptyOptionLabel="Usar a unidade de precificação"
              options={units.map((unit) => ({
                value: unit.id,
                label: unit.label,
              }))}
            />
          </Field>
        </div>
      </section>

      {visibleAttributes.length > 0 ? (
        <section className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-5">
          <div>
            <h2 className="text-fg text-sm font-semibold">
              Atributos da categoria
            </h2>
            <p className="text-fg-muted mt-1 text-sm">
              Campos específicos desta categoria. São eles que permitem comparar
              apresentações diferentes do mesmo item.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleAttributes.map((attr) => {
              const fieldId = `attr_${attr.id}`;
              const label = attr.unitSymbol
                ? `${attr.name} (${attr.unitSymbol})`
                : attr.name;

              return (
                <Field
                  key={attr.id}
                  label={attr.isRequired ? `${label} *` : label}
                  htmlFor={fieldId}
                >
                  {attr.dataType === "boolean" ? (
                    <select
                      id={fieldId}
                      name={fieldId}
                      required={attr.isRequired}
                      defaultValue=""
                      className={selectClass}
                    >
                      <option value="">—</option>
                      <option value="true">Sim</option>
                      <option value="false">Não</option>
                    </select>
                  ) : (
                    <Input
                      id={fieldId}
                      name={fieldId}
                      required={attr.isRequired}
                      inputMode={
                        attr.dataType === "numeric" ? "decimal" : undefined
                      }
                      placeholder={
                        attr.dataType === "numeric" ? "Ex.: 400" : undefined
                      }
                    />
                  )}
                </Field>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-5">
        <Field
          label="Observações"
          htmlFor="description"
          hint="Aparece para quem monta a cotação. Opcional."
        >
          <Input id="description" name="description" maxLength={500} />
        </Field>
        <Field
          label="Código de barras"
          htmlFor="barcode"
          hint="Opcional. Pode ser lido pelo leitor ou digitado."
        >
          <Input
            id="barcode"
            name="barcode"
            maxLength={64}
            autoComplete="off"
            placeholder="Bipe ou digite o código"
          />
        </Field>
      </section>

      {state.error ? (
        <p
          role="alert"
          className="bg-destructive-soft text-destructive flex items-start gap-2 rounded-md px-3 py-2 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      {state.savedName ? (
        <p
          role="status"
          className="bg-success-soft text-success flex items-start gap-2 rounded-md px-3 py-2 text-sm"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.savedName} cadastrado. O formulário está limpo para o próximo.
        </p>
      ) : null}
    </>
  );

  if (modal) {
    return (
      <form key={state.savedAt} action={formAction} className="contents">
        <DialogBody className="flex flex-col gap-6">{conteudo}</DialogBody>
        <DialogFooter className="justify-end">
          <SubmitButton />
        </DialogFooter>
      </form>
    );
  }

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="flex flex-col gap-6"
    >
      {conteudo}
      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
