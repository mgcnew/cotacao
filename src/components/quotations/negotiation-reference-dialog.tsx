"use client";

import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Link2,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  createNegotiationReference,
  revokeNegotiationReference,
  type NegotiationReferenceState,
} from "@/features/quotations/negotiation-reference-actions";
import type { NegotiationReferenceSummary } from "@/features/quotations/negotiation-reference";

export type NegotiationReferenceCandidate = {
  responseItemId: string;
  productName: string;
  requestedQuantity: number;
  purchaseUnit: string;
  pricingUnit: string;
  currentPrice: number;
  bestCompetitorPrice: number | null;
  referenceUnit: string;
  useComparisonUnit: boolean;
};

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QUANTITY = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 3,
});
const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function fieldMoney(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function validFieldMoney(value: string) {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0;
}

function GenerateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
      {pending ? "Gerando…" : "Gerar link de negociação"}
    </Button>
  );
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? "Copiado" : "Copiar link"}
    </Button>
  );
}

function RevokeLinkForm({
  request,
  roundId,
}: {
  request: NegotiationReferenceSummary;
  roundId: string;
}) {
  const [state, action] = useActionState<NegotiationReferenceState, FormData>(
    revokeNegotiationReference,
    { error: null },
  );
  const revoked = request.status === "revoked" || Boolean(state.savedAt);
  const expired = request.isExpired;
  const label = revoked
    ? "Revogado"
    : request.status === "completed"
      ? "Respondido"
      : expired
        ? "Expirado"
        : request.firstAccessedAt
          ? "Aberto pelo fornecedor"
          : "Ainda não aberto";

  return (
    <form
      action={action}
      className="border-border flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
    >
      <input type="hidden" name="requestId" value={request.id} />
      <input type="hidden" name="roundId" value={roundId} />
      <div className="min-w-0 flex-1">
        <p className="text-fg text-xs font-medium">
          {request.itemCount} {request.itemCount === 1 ? "produto" : "produtos"}
          {" · "}
          {label}
        </p>
        <p className="text-fg-subtle text-[11px]">
          Criado em {DATE_TIME.format(new Date(request.createdAt))} · vence em{" "}
          {DATE_TIME.format(new Date(request.expiresAt))}
        </p>
      </div>
      {request.status === "active" && !expired && !revoked ? (
        <Button type="submit" size="sm" variant="ghost">
          Revogar
        </Button>
      ) : null}
      <ErrorLine error={state.error} />
    </form>
  );
}

export function NegotiationReferenceDialog({
  roundId,
  roundSupplierId,
  supplierName,
  candidates,
  requests,
}: {
  roundId: string;
  roundSupplierId: string;
  supplierName: string;
  candidates: NegotiationReferenceCandidate[];
  requests: NegotiationReferenceSummary[];
}) {
  const [step, setStep] = React.useState<"configure" | "preview">("configure");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [kindByItem, setKindByItem] = React.useState<
    Record<string, "best_competitor" | "target">
  >(() =>
    Object.fromEntries(
      candidates.map((item) => [
        item.responseItemId,
        item.bestCompetitorPrice === null ? "target" : "best_competitor",
      ]),
    ),
  );
  const [targetByItem, setTargetByItem] = React.useState<Record<string, string>>(
    {},
  );
  const [validityDays, setValidityDays] = React.useState("3");
  const [state, action] = useActionState<NegotiationReferenceState, FormData>(
    createNegotiationReference,
    { error: null },
  );
  const selectedCandidates = candidates.filter((item) =>
    selected.includes(item.responseItemId),
  );

  function referenceValue(item: NegotiationReferenceCandidate) {
    return kindByItem[item.responseItemId] === "best_competitor"
      ? item.bestCompetitorPrice === null
        ? ""
        : fieldMoney(item.bestCompetitorPrice)
      : (targetByItem[item.responseItemId] ?? "");
  }
  const configurationValid =
    selectedCandidates.length > 0 &&
    selectedCandidates.every((item) => validFieldMoney(referenceValue(item)));

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Link2 aria-hidden /> Referência para negociar
        </Button>
      </DialogTrigger>
      <DialogContent size="lg" impedirFechamentoAcidental={selected.length > 0}>
        <DialogHeader>
          <DialogTitle>Negociar com {supplierName}</DialogTitle>
          <DialogDescription>
            Compartilhe somente referências autorizadas, sem identificar os
            outros fornecedores.
          </DialogDescription>
        </DialogHeader>

        {state.url ? (
          <DialogBody className="flex flex-col gap-4">
            <div className="border-success/30 bg-success-soft rounded-xl border p-4">
              <p className="text-fg font-medium">Link gerado</p>
              <p className="text-fg-muted mt-1 text-sm">
                O fornecedor verá apenas os {selected.length} produtos
                selecionados e as referências da prévia.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyLinkButton url={state.url} />
                <Button asChild variant="ghost">
                  <a href={state.url} target="_blank" rel="noreferrer">
                    <ExternalLink aria-hidden /> Abrir prévia
                  </a>
                </Button>
              </div>
            </div>
            <p className="text-fg-subtle text-xs">
              O token puro aparece somente agora. Se ele for perdido, gere um
              novo link e revogue este pela lista abaixo.
            </p>
          </DialogBody>
        ) : (
          <form action={action} className="contents">
            <input type="hidden" name="roundId" value={roundId} />
            <input
              type="hidden"
              name="roundSupplierId"
              value={roundSupplierId}
            />
            <DialogBody className="flex flex-col gap-4">
              {step === "configure" ? (
                <>
                  {candidates.length === 0 ? (
                    <p className="border-border text-fg-muted rounded-xl border border-dashed px-4 py-8 text-center text-sm">
                      Este fornecedor ainda não possui proposta com preço para
                      negociar.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {candidates.map((item) => {
                        const checked = selected.includes(item.responseItemId);
                        const kind = kindByItem[item.responseItemId];
                        return (
                          <article
                            key={item.responseItemId}
                            className="border-border rounded-xl border p-3"
                          >
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                name="referenceItemId"
                                value={item.responseItemId}
                                checked={checked}
                                onChange={(event) =>
                                  setSelected((current) =>
                                    event.target.checked
                                      ? [...current, item.responseItemId]
                                      : current.filter(
                                          (id) => id !== item.responseItemId,
                                        ),
                                  )
                                }
                                className="mt-1 size-4 accent-primary"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-fg text-sm font-medium">
                                  {item.productName}
                                </p>
                                <p className="text-fg-subtle text-xs">
                                  {QUANTITY.format(item.requestedQuantity)}{" "}
                                  {item.purchaseUnit} · proposta atual{" "}
                                  {MONEY.format(item.currentPrice)}/
                                  {item.pricingUnit}
                                </p>
                              </div>
                            </div>
                            {checked ? (
                              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_10rem]">
                                <ThemedSelect
                                  id={`reference-kind-${item.responseItemId}`}
                                  name={`referenceKind_${item.responseItemId}`}
                                  value={kind}
                                  onValueChange={(value) =>
                                    setKindByItem((current) => ({
                                      ...current,
                                      [item.responseItemId]: value as
                                        | "best_competitor"
                                        | "target",
                                    }))
                                  }
                                  options={[
                                    ...(item.bestCompetitorPrice === null
                                      ? []
                                      : [
                                          {
                                            value: "best_competitor",
                                            label: "Melhor preço anonimizado",
                                          },
                                        ]),
                                    {
                                      value: "target",
                                      label: "Preço-alvo definido por você",
                                    },
                                  ]}
                                />
                                <Input
                                  name={`referencePrice_${item.responseItemId}`}
                                  required
                                  inputMode="decimal"
                                  value={referenceValue(item)}
                                  readOnly={kind === "best_competitor"}
                                  placeholder="0,00"
                                  onChange={(event) =>
                                    setTargetByItem((current) => ({
                                      ...current,
                                      [item.responseItemId]: event.target.value,
                                    }))
                                  }
                                />
                                <input
                                  type="hidden"
                                  name={`useComparisonUnit_${item.responseItemId}`}
                                  value={String(item.useComparisonUnit)}
                                />
                                <p className="text-fg-subtle text-xs sm:col-span-2">
                                  Referência por {item.referenceUnit}. O
                                  fornecedor responderá na unidade de preço dele
                                  ({item.pricingUnit}).
                                </p>
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={candidates.length === 0}
                      onClick={() =>
                        setSelected(
                          selected.length === candidates.length
                            ? []
                            : candidates.map((item) => item.responseItemId),
                        )
                      }
                    >
                      {selected.length === candidates.length
                        ? "Limpar seleção"
                        : "Selecionar todos"}
                    </Button>
                    <label className="text-fg-muted flex items-center gap-2 text-xs">
                      Validade do link
                      <ThemedSelect
                        id="negotiation-reference-validity"
                        name="validityDays"
                        value={validityDays}
                        onValueChange={setValidityDays}
                        className="w-32"
                        options={[
                          { value: "1", label: "1 dia" },
                          { value: "3", label: "3 dias" },
                          { value: "7", label: "7 dias" },
                        ]}
                      />
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <input
                    type="hidden"
                    name="validityDays"
                    value={validityDays}
                  />
                  {selectedCandidates.map((item) => (
                    <React.Fragment key={`fields-${item.responseItemId}`}>
                      <input
                        type="hidden"
                        name="referenceItemId"
                        value={item.responseItemId}
                      />
                      <input
                        type="hidden"
                        name={`referenceKind_${item.responseItemId}`}
                        value={kindByItem[item.responseItemId]}
                      />
                      <input
                        type="hidden"
                        name={`referencePrice_${item.responseItemId}`}
                        value={referenceValue(item)}
                      />
                      <input
                        type="hidden"
                        name={`useComparisonUnit_${item.responseItemId}`}
                        value={String(item.useComparisonUnit)}
                      />
                    </React.Fragment>
                  ))}
                  <div className="border-warning/35 bg-warning/5 flex items-start gap-2 rounded-xl border p-3">
                    <AlertTriangle
                      className="text-warning mt-0.5 size-4 shrink-0"
                      aria-hidden
                    />
                    <p className="text-fg-muted text-sm">
                      Você está prestes a compartilhar preços de referência
                      concorrentes. Os fornecedores permanecerão anônimos.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {selectedCandidates.map((item) => (
                      <article
                        key={item.responseItemId}
                        className="border-border grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_auto]"
                      >
                        <div>
                          <p className="text-fg text-sm font-medium">
                            {item.productName}
                          </p>
                          <p className="text-fg-subtle text-xs">
                            Atual: {MONEY.format(item.currentPrice)}/
                            {item.pricingUnit}
                          </p>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-fg-subtle text-xs">
                            {kindByItem[item.responseItemId] ===
                            "best_competitor"
                              ? "Melhor referência recebida"
                              : "Preço-alvo"}
                          </p>
                          <p className="text-primary text-sm font-semibold">
                            R$ {referenceValue(item)}/{item.referenceUnit}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                  <label className="text-fg flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      required
                      className="mt-0.5 size-4 accent-primary"
                    />
                    Confirmo que revisei os produtos e autorizo o
                    compartilhamento destas referências anonimizadas.
                  </label>
                </>
              )}
              <ErrorLine error={state.error} />
            </DialogBody>
            <DialogFooter>
              {step === "configure" ? (
                <Button
                  type="button"
                  disabled={!configurationValid}
                  onClick={() => setStep("preview")}
                >
                  Revisar prévia
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep("configure")}
                  >
                    <RotateCcw aria-hidden /> Ajustar
                  </Button>
                  <GenerateButton />
                </>
              )}
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Fechar
                </Button>
              </DialogClose>
            </DialogFooter>
          </form>
        )}

        {requests.length > 0 ? (
          <div className="border-border bg-surface-sunken shrink-0 border-t px-4 py-3">
            <p className="text-fg-muted mb-2 text-xs font-medium">
              Links anteriores para este fornecedor
            </p>
            <div className="max-h-32 space-y-2 overflow-y-auto">
              {requests.map((request) => (
                <RevokeLinkForm
                  key={request.id}
                  request={request}
                  roundId={roundId}
                />
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
