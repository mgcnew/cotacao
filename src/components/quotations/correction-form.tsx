"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  PackageCheck,
  PackageX,
  PencilLine,
} from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { packagingFactorLabel, unitWord } from "@/features/products/units";
import {
  correctResponseItem,
  type CorrectionState,
} from "@/features/quotations/correction";
import { cn } from "@/lib/utils";

type Situacao = "sim" | "sem_estoque" | "nao";

/**
 * As mesmas três respostas do link do fornecedor, na voz de quem confere.
 *
 * Empilhadas, e não lado a lado como na página dele: esta coluna da
 * comparação tem ~210px, e três rótulos não cabem em linha sem quebrar.
 * Selecionado = cor sólida + ícone + texto, nunca só a cor.
 */
const SITUACOES = [
  {
    value: "sim",
    label: "Tem disponível",
    icon: PackageCheck,
    idleIcon: "text-success",
    activeClass: "border-success bg-success text-surface",
  },
  {
    value: "sem_estoque",
    label: "Sem estoque agora",
    icon: Clock3,
    idleIcon: "text-warning",
    activeClass: "border-warning bg-warning text-surface",
  },
  {
    value: "nao",
    label: "Não trabalha com o produto",
    icon: PackageX,
    idleIcon: "text-destructive",
    activeClass: "border-destructive bg-destructive text-surface",
  },
] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="h-11">
      {pending ? "Salvando…" : "Salvar correção"}
    </Button>
  );
}

/**
 * Correção da resposta pelo comprador.
 *
 * O fornecedor não pode reenviar item já respondido — regra do banco. Quando
 * ele erra o preço ou marca "não fornece" sem querer, o conserto é aqui, com
 * motivo obrigatório e registro de quem mudou o quê. Também é por aqui que o
 * comprador registra que o produto acabou no fornecedor depois da resposta.
 */
export function CorrectionForm({
  responseItemId,
  roundId,
  currentPrice,
  doesNotSupply,
  isAvailable = null,
  supplierName,
  productName,
  pricingUnit,
  conversionDefinitionId = null,
  conversionName = null,
  conversionUnit = null,
  currentConversionFactor = null,
  conversionRequired = false,
  pricingUnitInfo = null,
  comparisonUnitInfo = null,
}: {
  responseItemId: string;
  roundId: string;
  currentPrice: number | null;
  doesNotSupply: boolean;
  isAvailable?: boolean | null;
  supplierName: string;
  productName: string;
  pricingUnit: string;
  conversionDefinitionId?: string | null;
  conversionName?: string | null;
  conversionUnit?: string | null;
  currentConversionFactor?: number | null;
  conversionRequired?: boolean;
  pricingUnitInfo?: { name: string | null; symbol: string } | null;
  comparisonUnitInfo?: { name: string | null; symbol: string } | null;
}) {
  // Embalagem: as mesmas perguntas do link do fornecedor e do lançamento —
  // "Preço de 1 bobina" e "Cada bobina tem ___ metros".
  const embalagem =
    Boolean(conversionDefinitionId) &&
    pricingUnitInfo !== null &&
    comparisonUnitInfo !== null;
  const [open, setOpen] = React.useState(false);
  // A confirmação vale só até o formulário ser fechado; reabrir começa limpo.
  const [reconhecidoEm, setReconhecidoEm] = React.useState<number | undefined>();
  const [situacao, setSituacao] = React.useState<Situacao>(
    doesNotSupply ? "nao" : isAvailable === false ? "sem_estoque" : "sim",
  );
  const fornece = situacao === "sim";
  const [state, formAction] = useActionState<CorrectionState, FormData>(
    correctResponseItem,
    { error: null },
  );

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-fg-muted hover:text-fg h-9 gap-1.5 px-2 text-[13px]"
        onClick={() => setOpen(true)}
      >
        <PencilLine className="size-4" aria-hidden />
        Corrigir
      </Button>
    );
  }

  const campo = "h-11 text-base";

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface-sunken mt-2 flex flex-col gap-3 rounded-lg border p-3 text-left"
    >
      <input type="hidden" name="responseItemId" value={responseItemId} />
      <input type="hidden" name="roundId" value={roundId} />

      <p className="text-fg-muted text-[13px] leading-snug wrap-anywhere">
        <strong className="text-fg font-medium">{productName}</strong> ·{" "}
        {supplierName}
      </p>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-fg mb-1.5 text-sm font-medium">
          O fornecedor trabalha com este produto?
        </legend>
        {SITUACOES.map((opcao) => {
          const ativa = situacao === opcao.value;
          const Icone = opcao.icon;
          return (
            <label
              key={opcao.value}
              className={cn(
                "border-border bg-surface hover:border-fg-subtle has-focus-visible:ring-ring/50 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-sm font-semibold transition-colors has-focus-visible:ring-3",
                ativa && opcao.activeClass,
              )}
            >
              <input
                type="radio"
                name="supplies"
                value={opcao.value}
                checked={ativa}
                onChange={() => setSituacao(opcao.value)}
                className="sr-only"
              />
              <Icone
                className={cn("size-5 shrink-0", !ativa && opcao.idleIcon)}
                aria-hidden
              />
              <span className="min-w-0 flex-1">{opcao.label}</span>
              {ativa ? (
                <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              ) : null}
            </label>
          );
        })}
      </fieldset>

      {situacao !== "sim" && currentPrice !== null ? (
        <p className="text-fg-muted text-[13px] leading-snug">
          O preço de R$ {currentPrice.toFixed(2).replace(".", ",")} sai da
          comparação, e a alocação em rascunho para este fornecedor é desfeita.
        </p>
      ) : null}

      {fornece ? (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`corr-preco-${responseItemId}`}
            className="text-fg text-sm font-medium"
          >
            {embalagem
              ? `Preço de 1 ${unitWord(pricingUnitInfo)}`
              : `Preço por ${pricingUnit}`}
            {currentPrice !== null ? (
              <span className="text-fg-muted font-normal">
                {" "}
                (atual: {currentPrice.toFixed(2).replace(".", ",")})
              </span>
            ) : null}
          </label>
          <div className="relative">
            <span
              aria-hidden
              className="text-fg-muted pointer-events-none absolute inset-y-0 left-3 flex items-center text-base"
            >
              R$
            </span>
            <Input
              id={`corr-preco-${responseItemId}`}
              name="price"
              inputMode="decimal"
              required
              placeholder="0,00"
              className={cn(campo, "pl-10 tabular-nums")}
            />
          </div>
        </div>
      ) : null}

      {fornece && conversionDefinitionId && conversionName ? (
        <div className="flex flex-col gap-1.5">
          <input type="hidden" name="conversionDefinitionId" value={conversionDefinitionId} />
          <label
            htmlFor={`corr-conversao-${responseItemId}`}
            className="text-fg text-sm font-medium"
          >
            {embalagem
              ? `${packagingFactorLabel(pricingUnitInfo!)} (${unitWord(comparisonUnitInfo, 2)})`
              : `${conversionName}${conversionUnit ? ` (${conversionUnit})` : ""}`}
            {currentConversionFactor !== null ? (
              <span className="text-fg-muted font-normal">
                {" "}
                (atual: {currentConversionFactor.toLocaleString("pt-BR")})
              </span>
            ) : null}
          </label>
          <Input
            id={`corr-conversao-${responseItemId}`}
            name="conversionFactor"
            inputMode="decimal"
            required={conversionRequired && currentConversionFactor === null}
            placeholder="Vazio = manter"
            className={cn(campo, "tabular-nums")}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`corr-obs-${responseItemId}`}
          className="text-fg text-sm font-medium"
        >
          Observação <span className="text-fg-muted font-normal">(opcional)</span>
        </label>
        <Input
          id={`corr-obs-${responseItemId}`}
          name="notes"
          maxLength={300}
          className={campo}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`corr-motivo-${responseItemId}`}
          className="text-fg text-sm font-medium"
        >
          Motivo <span className="text-destructive">*</span>
        </label>
        <Input
          id={`corr-motivo-${responseItemId}`}
          name="reason"
          required
          maxLength={300}
          placeholder="Ex.: confirmou por telefone"
          className={campo}
        />
        <p className="text-fg-muted text-[13px]">
          Fica registrado o que mudou, o motivo e quem corrigiu.
        </p>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="text-destructive flex items-start gap-1.5 text-sm font-medium"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      {state.savedAt && state.savedAt !== reconhecidoEm ? (
        <p
          role="status"
          className="text-success flex items-start gap-1.5 text-sm font-medium"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          Correção registrada.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton />
        <Button
          type="button"
          variant="ghost"
          className="text-fg-muted h-11"
          onClick={() => {
            setReconhecidoEm(state.savedAt);
            setOpen(false);
          }}
        >
          {state.savedAt && state.savedAt !== reconhecidoEm ? "Fechar" : "Cancelar"}
        </Button>
      </div>
    </form>
  );
}
