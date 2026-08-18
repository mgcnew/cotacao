"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  NovaCategoriaDialog,
  NovaUnidadeDialog,
} from "@/components/products/catalog-dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createProduct, type ProductFormState } from "@/features/products/actions";
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
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

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
  const [state, formAction] = useActionState<ProductFormState, FormData>(
    createProduct,
    { error: null },
  );
  const [categoryId, setCategoryId] = React.useState("");

  // Só os atributos da categoria escolhida — é o que "esses campos só aparecem
  // quando relevantes" quer dizer na prática.
  const visibleAttributes = attributes.filter((a) => a.categoryId === categoryId);

  return (
    <form key={state.savedAt} action={formAction} className="flex flex-col gap-6">
      <section className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-5">
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Categoria"
            htmlFor="categoryId"
            acao={<NovaCategoriaDialog />}
          >
            <select
              id="categoryId"
              name="categoryId"
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={selectClass}
            >
              <option value="">Selecione…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Finalidade" htmlFor="purpose">
            <select
              id="purpose"
              name="purpose"
              required
              defaultValue="resale"
              className={selectClass}
            >
              {PRODUCT_PURPOSES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.hint ? `${p.label} — ${p.hint}` : p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-fg text-sm font-semibold">Unidades</h2>
            <p className="text-fg-muted mt-1 text-sm">
            É o que permite comparar propostas diferentes. Se um fornecedor cota
            o pacote com 400 e outro o pacote com 500, a comparação só faz
              sentido numa base comum.
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
            <select
              id="purchaseUnitId"
              name="purchaseUnitId"
              required
              className={selectClass}
            >
              <option value="">Selecione…</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="De precificação"
            htmlFor="pricingUnitId"
            hint="Como o fornecedor cota"
          >
            <select
              id="pricingUnitId"
              name="pricingUnitId"
              required
              className={selectClass}
            >
              <option value="">Selecione…</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="De comparação"
            htmlFor="comparisonUnitId"
            hint="Em branco: usa a de precificação"
          >
            <select id="comparisonUnitId" name="comparisonUnitId" className={selectClass}>
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
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

          <div className="grid gap-4 sm:grid-cols-2">
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

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
