"use client";

import { AlertCircle, PhoneCall } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { packagingFactorLabel, unitWord } from "@/features/products/units";
import {
  recordManualQuotationItem,
  type CorrectionState,
} from "@/features/quotations/correction";

type UnitInfo = { name: string | null; symbol: string } | null;

const PRECO_POR_UNIDADE = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

function numero(texto: string): number {
  return Number(texto.trim().replace(/\./g, "").replace(",", "."));
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Lançando…" : "Lançar"}
    </Button>
  );
}

/**
 * Lançar o preço no lugar do fornecedor, direto na célula da comparação.
 *
 * POR QUE AQUI, E NÃO NUMA TELA À PARTE
 *
 * O caso real é: manda-se o link para todos, mas negocia-se por telefone. Quem
 * ligou está olhando a matriz de comparação, na linha do produto e na coluna do
 * fornecedor — é ali que o preço que acabou de ouvir tem endereço. Uma tela
 * separada de "lançamento manual" obrigaria a procurar de novo o que já está
 * na frente dos olhos.
 *
 * A célula de quem não respondeu dizia só "aguardando". Agora ela oferece o
 * lançamento; fechada, continua discreta, para a matriz não virar um mural de
 * formulários.
 */
export function ManualPriceForm({
  supplierQuotationItemId,
  roundId,
  supplierName,
  productName,
  pricingUnit,
  comparisonUnit,
  conversionDefinitionId,
  conversionName,
  conversionUnit,
  conversionRequired,
  pricingUnitInfo = null,
  comparisonUnitInfo = null,
}: {
  supplierQuotationItemId: string;
  roundId: string;
  supplierName: string;
  productName: string;
  pricingUnit: string;
  comparisonUnit: string | null;
  conversionDefinitionId: string | null;
  conversionName: string | null;
  conversionUnit: string | null;
  conversionRequired: boolean;
  pricingUnitInfo?: UnitInfo;
  comparisonUnitInfo?: UnitInfo;
}) {
  const [state, formAction] = useActionState<CorrectionState, FormData>(
    recordManualQuotationItem,
    { error: null },
  );
  const [aberto, setAberto] = React.useState(false);
  const [naoFornece, setNaoFornece] = React.useState(false);
  const [preco, setPreco] = React.useState("");
  const [fator, setFator] = React.useState("");

  // Embalagem: pergunta como o link do fornecedor pergunta — o preço de 1
  // bobina e quantos metros vêm nela. O campo solto "por metro" convidava a
  // digitar o preço da bobina onde se esperava o do metro, e o total saía
  // bobinas × metros × preço da bobina.
  const embalagem =
    Boolean(conversionDefinitionId) &&
    pricingUnitInfo !== null &&
    comparisonUnitInfo !== null;
  const precoNumero = numero(preco);
  const fatorNumero = numero(fator);
  const precoPorConteudo =
    embalagem && precoNumero > 0 && fatorNumero > 0
      ? precoNumero / fatorNumero
      : null;

  // Gravou: a célula deixa de ser "aguardando" e o formulário some junto.
  const [savedVisto, setSavedVisto] = React.useState(state.savedAt);
  if (state.savedAt !== savedVisto) {
    setSavedVisto(state.savedAt);
    if (state.savedAt) setAberto(false);
  }

  if (!aberto) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-fg-subtle hover:text-fg h-6 gap-1 px-1.5 text-xs"
        onClick={() => setAberto(true)}
      >
        <PhoneCall className="size-3" aria-hidden />
        Lançar preço
      </Button>
    );
  }

  return (
    <form action={formAction} className="mt-1 flex flex-col gap-1.5">
      <input type="hidden" name="roundId" value={roundId} />
      <input
        type="hidden"
        name="supplierQuotationItemId"
        value={supplierQuotationItemId}
      />

      {embalagem && !naoFornece ? (
        <div className="border-primary/20 bg-primary-soft flex flex-col gap-1.5 rounded-md border p-2">
          <input
            type="hidden"
            name="conversionDefinitionId"
            value={conversionDefinitionId ?? ""}
          />
          <label
            className="text-fg-muted block text-xs"
            htmlFor={`preco-${supplierQuotationItemId}`}
          >
            Preço de 1 {unitWord(pricingUnitInfo)}
          </label>
          <Input
            id={`preco-${supplierQuotationItemId}`}
            name="quotedPrice"
            inputMode="decimal"
            autoFocus
            required
            value={preco}
            onChange={(event) => setPreco(event.target.value)}
            placeholder="R$ 0,00"
            className="h-7 w-full text-sm"
          />
          <label
            className="text-fg-muted block text-xs"
            htmlFor={`conversao-${supplierQuotationItemId}`}
          >
            {packagingFactorLabel(pricingUnitInfo!)}
            {conversionRequired ? (
              <span className="text-destructive"> *</span>
            ) : null}
          </label>
          <div className="flex items-center gap-1.5">
            <Input
              id={`conversao-${supplierQuotationItemId}`}
              name="conversionFactor"
              inputMode="decimal"
              required={conversionRequired}
              value={fator}
              onChange={(event) => setFator(event.target.value)}
              placeholder="0"
              className="h-7 w-20 text-sm"
            />
            <span className="text-fg-muted text-xs">
              {unitWord(comparisonUnitInfo, 2)}
            </span>
          </div>
          {precoPorConteudo !== null ? (
            <p className="text-fg text-xs tabular-nums">
              = {PRECO_POR_UNIDADE.format(precoPorConteudo)} por{" "}
              {unitWord(comparisonUnitInfo)}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {conversionDefinitionId && conversionName && !naoFornece ? (
            <div className="border-primary/20 bg-primary-soft rounded-md border p-2">
              <input
                type="hidden"
                name="conversionDefinitionId"
                value={conversionDefinitionId}
              />
              <label
                className="text-fg-muted mb-1 block text-xs"
                htmlFor={`conversao-${supplierQuotationItemId}`}
              >
                {conversionName}
                {conversionUnit ? ` (${conversionUnit})` : ""}
                {conversionRequired ? (
                  <span className="text-destructive"> *</span>
                ) : null}
              </label>
              <Input
                id={`conversao-${supplierQuotationItemId}`}
                name="conversionFactor"
                inputMode="decimal"
                required={conversionRequired}
                placeholder={`Para comparar por ${comparisonUnit ?? "unidade"}`}
                className="h-7 w-full text-sm"
              />
            </div>
          ) : null}

          <label
            className="sr-only"
            htmlFor={`preco-${supplierQuotationItemId}`}
          >
            Preço de {supplierName} para {productName}
          </label>
          <Input
            id={`preco-${supplierQuotationItemId}`}
            name="quotedPrice"
            inputMode="decimal"
            autoFocus
            required={!naoFornece}
            disabled={naoFornece}
            placeholder={`por ${pricingUnit}`}
            className="h-7 w-28 text-sm"
          />
        </>
      )}

      <label className="text-fg-subtle flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          name="doesNotSupply"
          checked={naoFornece}
          onChange={(e) => setNaoFornece(e.target.checked)}
          className="size-3"
        />
        não fornece
      </label>

      <Input
        name="notes"
        maxLength={200}
        placeholder="observação (opcional)"
        className="h-7 w-full text-xs"
      />

      {state.error ? (
        <p
          role="alert"
          className="text-destructive flex items-start gap-1 text-xs"
        >
          <AlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-1">
        <SubmitButton />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-fg-subtle h-7 px-1.5 text-xs"
          onClick={() => setAberto(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
