"use client";

import {
  Ban,
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  MonitorSmartphone,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  generateReceivingDisplayLink,
  revokeReceivingDisplayLink,
  type ReceivingDisplayLinkActionState,
} from "@/features/receipts/public-display-actions";
import type { ReceivingDisplayLinkStatus } from "@/features/receipts/public-display";

const INITIAL_STATE: ReceivingDisplayLinkActionState = { error: null };

function SubmitButton({ active }: { active: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden />
      ) : (
        <RotateCw aria-hidden />
      )}
      {pending ? "Gerando…" : active ? "Substituir link" : "Gerar link"}
    </Button>
  );
}

function RevokeButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden />
      ) : (
        <Ban aria-hidden />
      )}
      {pending ? "Revogando…" : "Revogar acesso"}
    </Button>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Ainda não acessado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ReceivingDisplaySettings({
  initialStatus,
  canManage,
}: {
  initialStatus: ReceivingDisplayLinkStatus;
  canManage: boolean;
}) {
  const [generateState, generateAction] = useActionState(
    generateReceivingDisplayLink,
    INITIAL_STATE,
  );
  const [revokeState, revokeAction] = useActionState(
    revokeReceivingDisplayLink,
    INITIAL_STATE,
  );
  const [copied, setCopied] = useState(false);

  const generateSuccessAt = generateState.url
    ? (generateState.savedAt ?? 0)
    : 0;
  const revokeSuccessAt = revokeState.error === null && revokeState.message
    ? (revokeState.savedAt ?? 0)
    : 0;
  const generatedLast = generateSuccessAt > revokeSuccessAt;
  const revokedLast = revokeSuccessAt > generateSuccessAt;
  const active = generatedLast ? true : revokedLast ? false : initialStatus.active;
  const freshUrl = generatedLast ? generateState.url : undefined;
  const generateActionLast =
    (generateState.savedAt ?? 0) > (revokeState.savedAt ?? 0);
  const revokeActionLast =
    (revokeState.savedAt ?? 0) > (generateState.savedAt ?? 0);
  const currentError = generateActionLast
    ? generateState.error
    : revokeActionLast
      ? revokeState.error
      : null;
  const currentMessage = generateActionLast
    ? generateState.message
    : revokeActionLast
      ? revokeState.message
      : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <MonitorSmartphone className="size-4" aria-hidden />
                Painel público de recebimento
              </CardTitle>
              <CardDescription className="mt-1">
                Consulta rápida das próximas entregas em um aparelho sem login.
              </CardDescription>
            </div>
            <Badge variant={active ? "default" : "secondary"}>
              {active ? "Link ativo" : "Sem acesso ativo"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-border bg-surface-muted grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-fg-subtle text-xs font-medium uppercase">
                Gerado em
              </p>
              <p className="text-fg-muted mt-1">
                {initialStatus.createdAt
                  ? formatDate(initialStatus.createdAt)
                  : "Nenhum link gerado"}
              </p>
            </div>
            <div>
              <p className="text-fg-subtle text-xs font-medium uppercase">
                Último acesso
              </p>
              <p className="text-fg-muted mt-1">
                {formatDate(initialStatus.lastAccessedAt)}
              </p>
            </div>
          </div>

          {freshUrl ? (
            <div className="border-primary/30 bg-primary-soft rounded-xl border p-4">
              <p className="text-primary text-sm font-medium">
                Copie este endereço agora
              </p>
              <p className="text-fg-muted mt-1 text-xs">
                Por segurança, o sistema guarda apenas o hash e não conseguirá
                mostrar o mesmo endereço novamente.
              </p>
              <p className="text-fg mt-3 break-all rounded-md bg-white/60 p-2 font-mono text-xs dark:bg-black/20">
                {freshUrl}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(freshUrl);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2_000);
                  }}
                >
                  {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  {copied ? "Copiado" : "Copiar link"}
                </Button>
                <Button asChild type="button" size="sm" variant="outline">
                  <a
                    href={freshUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink aria-hidden /> Abrir painel
                  </a>
                </Button>
              </div>
            </div>
          ) : null}

          <ErrorLine error={currentError} />
          <SuccessLine message={currentMessage} />

          {!canManage ? (
            <p className="text-fg-muted text-sm">
              Somente um administrador pode gerar ou revogar este acesso.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <form
                action={generateAction}
                onSubmit={(event) => {
                  if (
                    active &&
                    !window.confirm(
                      "Substituir o link atual? O endereço instalado no aparelho deixará de funcionar imediatamente.",
                    )
                  ) {
                    event.preventDefault();
                  }
                }}
              >
                <SubmitButton active={active} />
              </form>
              {active ? (
                <form
                  action={revokeAction}
                  onSubmit={(event) => {
                    if (
                      !window.confirm(
                        "Revogar este acesso? O painel deixará de abrir no aparelho.",
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  <RevokeButton />
                </form>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" aria-hidden />
            O que o link permite
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-fg-muted space-y-3 text-sm">
            <li>Ver apenas pedidos aguardando entrega e saldos pendentes.</li>
            <li>Consultar produtos, quantidades e preços negociados.</li>
            <li>Não permite receber, editar, cancelar ou acessar históricos.</li>
            <li>Um novo link invalida imediatamente o endereço anterior.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
