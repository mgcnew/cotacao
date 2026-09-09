"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useActionState } from "react";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
import {
  useFechaModalAoConcluir,
  useModalDeRota,
} from "@/components/layout/route-modal";
import { NovaCategoriaDialog } from "@/components/products/catalog-dialogs";
import { Button } from "@/components/ui/button";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  updateProduct,
  type ProductEditState,
} from "@/features/products/actions";
import { PRODUCT_PURPOSES } from "@/features/products/purposes";
import type { ProductEditContext } from "@/features/products/queries";
import type { FormAttribute } from "@/components/products/product-form";

type Option = { id: string; label: string };

const INITIAL_STATE: ProductEditState = { error: null };

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

function Secao({
  titulo,
  descricao,
  acao,
  children,
}: {
  titulo?: string;
  descricao?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-5">
      {titulo ? (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-fg text-sm font-semibold">{titulo}</h2>
            {descricao ? (
              <p className="text-fg-muted mt-1 text-sm">{descricao}</p>
            ) : null}
          </div>
          {acao}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * Edição de um produto já cadastrado.
 *
 * Três campos com regras diferentes convivem aqui, e a tela precisa deixar
 * claro qual é qual:
 *
 *  - nome, categoria, finalidade e observações se corrigem sempre;
 *  - unidade só enquanto ninguém escreveu um número sob ela (0102), e quando
 *    travada aparece somente para leitura, com o motivo;
 *  - o nome, se o produto está numa rodada aberta já enviada, é o que o
 *    fornecedor vê agora. Aí o aviso surge — mas só depois de a pessoa
 *    realmente mudar o texto, porque avisar sobre algo que ela não fez é ruído.
 */
export function ProductEditForm({
  context,
  categories,
  units,
  attributes,
  inModal = false,
}: {
  context: ProductEditContext;
  categories: Option[];
  units: Option[];
  attributes: FormAttribute[];
  inModal?: boolean;
}) {
  const { product, attributeValues, unitsLockReason, nameExposure } = context;
  const modal = useModalDeRota();

  const boundAction = React.useMemo(
    () => updateProduct.bind(null, product.id),
    [product.id],
  );
  const action = useFechaModalAoConcluir(boundAction);
  const [state, formAction] = useActionState(action, INITIAL_STATE);

  const [categoryId, setCategoryId] = React.useState(product.categoryId);
  const [name, setName] = React.useState(product.name);

  const visibleAttributes = attributes.filter((a) => a.categoryId === categoryId);
  const categoryChanged = categoryId !== product.categoryId;
  const nameChanged = name.trim() !== product.name.trim();

  const unitOptions = units.map((unit) => ({
    value: unit.id,
    label: unit.label,
  }));
  const unitLabel = (id: string | null) =>
    units.find((unit) => unit.id === id)?.label ?? "—";

  const supplierCount = nameExposure.reduce(
    (total, round) => total + round.suppliers,
    0,
  );

  const conteudo = (
    <>
      <Secao>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nome" htmlFor="name">
            <Input
              id="name"
              name="name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
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
              defaultValue={product.purpose}
              options={PRODUCT_PURPOSES.map((purpose) => ({
                value: purpose.value,
                label: purpose.hint
                  ? `${purpose.label} — ${purpose.hint}`
                  : purpose.label,
              }))}
            />
          </Field>
        </div>

        {nameChanged && nameExposure.length > 0 ? (
          <p
            role="status"
            className="border-warning/30 bg-warning-soft text-warning rounded-lg border px-3 py-2.5 text-sm"
          >
            Este produto está em{" "}
            {nameExposure.length === 1 ? (
              <>
                <strong className="font-medium">{nameExposure[0].title}</strong>,
                rodada aberta já enviada
              </>
            ) : (
              <>
                {nameExposure.length} rodadas abertas já enviadas
              </>
            )}{" "}
            a {supplierCount}{" "}
            {supplierCount === 1 ? "fornecedor" : "fornecedores"}. Eles passarão
            a ver o nome novo ao abrir a cotação. Cotações encerradas e pedidos
            já enviados guardam o nome de então e não mudam.
          </p>
        ) : null}
      </Secao>

      <Secao
        titulo="Unidades"
        descricao="É o que permite comparar propostas diferentes. Se um fornecedor cota o pacote com 400 e outro o pacote com 500, a comparação só faz sentido numa base comum."
      >
        {unitsLockReason ? (
          <>
            <p className="border-warning/30 bg-warning-soft text-warning flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              {unitsLockReason}
            </p>
            <dl className="grid gap-4 sm:grid-cols-3">
              {[
                ["De compra", product.purchaseUnitId],
                ["De precificação", product.pricingUnitId],
                ["De comparação", product.comparisonUnitId],
              ].map(([rotulo, id]) => (
                <div key={rotulo} className="flex flex-col gap-1.5">
                  <dt className="text-fg text-sm font-medium">{rotulo}</dt>
                  <dd className="text-fg-muted text-sm">{unitLabel(id)}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
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
                defaultValue={product.purchaseUnitId}
                options={unitOptions}
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
                defaultValue={product.pricingUnitId}
                options={unitOptions}
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
                defaultValue={product.comparisonUnitId ?? ""}
                placeholder="—"
                emptyOptionLabel="Usar a unidade de precificação"
                options={unitOptions}
              />
            </Field>
          </div>
        )}
      </Secao>

      {visibleAttributes.length > 0 || categoryChanged ? (
        <Secao
          titulo="Atributos da categoria"
          descricao="Campos específicos desta categoria. São eles que permitem comparar apresentações diferentes do mesmo item."
        >
          {categoryChanged ? (
            <p
              role="status"
              className="border-warning/30 bg-warning-soft text-warning rounded-lg border px-3 py-2.5 text-sm"
            >
              A categoria mudou. Os atributos preenchidos sob a categoria
              anterior serão descartados ao salvar — atributo pertence a uma
              categoria, e fora dela não teria como ser lido.
            </p>
          ) : null}

          {visibleAttributes.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleAttributes.map((attr) => {
                const fieldId = `attr_${attr.id}`;
                const label = attr.unitSymbol
                  ? `${attr.name} (${attr.unitSymbol})`
                  : attr.name;
                // Ao trocar de categoria os campos são outros; só faz sentido
                // reaproveitar o valor salvo enquanto a categoria é a mesma.
                const atual = categoryChanged
                  ? ""
                  : (attributeValues[attr.id] ?? "");

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
                        defaultValue={atual}
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
                        defaultValue={atual}
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
          ) : (
            <p className="text-fg-muted text-sm">
              Esta categoria não tem atributos definidos.
            </p>
          )}
        </Secao>
      ) : null}

      <Secao>
        <Field
          label="Observações"
          htmlFor="description"
          hint="Aparece para quem monta a cotação. Opcional."
        >
          <Input
            id="description"
            name="description"
            maxLength={500}
            defaultValue={product.description ?? ""}
          />
        </Field>
      </Secao>

      <ErrorLine error={state.error} />
      <SuccessLine
        message={state.savedAt ? "Produto atualizado." : null}
      />
    </>
  );

  const cancelar = inModal ? (
    <Button type="button" variant="ghost" onClick={modal?.fechar}>
      Cancelar
    </Button>
  ) : (
    <Button asChild variant="ghost">
      <Link href="/produtos">Cancelar</Link>
    </Button>
  );

  const salvar = (
    <FormSubmitButton pendingLabel="Salvando…">
      Salvar alterações
    </FormSubmitButton>
  );

  if (inModal) {
    return (
      <form action={formAction} className="contents">
        <DialogBody className="flex flex-col gap-6">{conteudo}</DialogBody>
        <DialogFooter className="justify-end">
          {cancelar}
          {salvar}
        </DialogFooter>
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {conteudo}
      <div className="flex justify-end gap-2">
        {cancelar}
        {salvar}
      </div>
    </form>
  );
}
