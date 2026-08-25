"use client";

import {
  CheckCircle2,
  LoaderCircle,
  MessageCircle,
  Power,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Unplug,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  checkCompanyWhatsAppAction,
  connectCompanyWhatsAppAction,
  disconnectCompanyWhatsAppAction,
} from "@/features/whatsapp/actions";
import type { WhatsAppSetupState } from "@/features/whatsapp/connection-state";

function phone(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return `+${digits}`;
}

function label(status: WhatsAppSetupState["status"]) {
  return {
    not_configured: "Servidor não configurado",
    not_connected: "Não conectado",
    connecting: "Aguardando leitura",
    connected: "Conectado",
    disconnected: "Desconectado",
    error: "Com erro",
    unknown: "Não verificado",
  }[status];
}

export function WhatsAppConnectionSettings({
  initialState,
  canManage,
}: {
  initialState: WhatsAppSetupState;
  canManage: boolean;
}) {
  const router = useRouter();
  const [state, setState] = React.useState(initialState);
  const [pending, startTransition] = React.useTransition();
  const checking = React.useRef(false);

  const run = React.useCallback((action: () => Promise<WhatsAppSetupState>) => {
    startTransition(() => {
      void action().then((next) => {
        setState(next);
        if (next.status === "connected" || next.status === "disconnected") router.refresh();
      });
    });
  }, [router]);

  React.useEffect(() => {
    if (state.status !== "connecting") return;
    const timer = window.setInterval(() => {
      if (checking.current) return;
      checking.current = true;
      void checkCompanyWhatsAppAction()
        .then((next) => {
          if (next.status === "connecting" && state.qrCode) {
            setState({ ...next, qrCode: state.qrCode, message: state.message });
          } else {
            setState(next);
          }
          if (next.status === "connected") router.refresh();
        })
        .finally(() => {
          checking.current = false;
        });
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [router, state.message, state.qrCode, state.status]);

  const connected = state.status === "connected";
  const statusVariant = connected
    ? "default"
    : state.status === "error" || state.status === "disconnected"
      ? "destructive"
      : "secondary";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="size-4" aria-hidden />
                WhatsApp da empresa
              </CardTitle>
              <CardDescription className="mt-1">
                Conecte o número usado nas compras sem acessar o painel da Evolution.
              </CardDescription>
            </div>
            <Badge variant={statusVariant}>
              <span className="size-1.5 rounded-full bg-current" />
              {label(state.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {connected ? (
            <div className="border-border bg-surface-muted flex items-center gap-3 rounded-xl border p-4">
              <span className="bg-success-soft text-success grid size-10 shrink-0 place-items-center rounded-full">
                <CheckCircle2 className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-fg font-medium">{phone(state.phone) ?? "WhatsApp conectado"}</p>
                <p className="text-fg-muted text-xs">
                  {state.lastConnectedAt
                    ? `Conexão confirmada em ${new Date(state.lastConnectedAt).toLocaleString("pt-BR")}`
                    : "Conexão pronta para enviar e receber mensagens."}
                </p>
              </div>
            </div>
          ) : null}

          {state.qrCode && state.status === "connecting" ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-4 text-center">
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <Image
                  src={state.qrCode}
                  alt="QR Code para conectar o WhatsApp"
                  width={264}
                  height={264}
                  unoptimized
                  priority
                />
              </div>
              <div>
                <p className="text-fg font-medium">Leia este código pelo celular</p>
                <p className="text-fg-muted mt-1 max-w-md text-sm">
                  No WhatsApp, abra Aparelhos conectados, escolha Conectar um aparelho e aponte a câmera para o código.
                </p>
              </div>
              <p className="text-fg-subtle flex items-center gap-1.5 text-xs">
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                Verificando a conexão automaticamente
              </p>
            </div>
          ) : null}

          {state.message ? (
            <p
              className={state.ok ? "text-fg-muted text-sm" : "text-danger text-sm"}
              role={!state.ok ? "alert" : undefined}
            >
              {state.message}
            </p>
          ) : null}

          {!canManage ? (
            <p className="text-fg-muted text-sm">Somente um administrador da empresa pode alterar esta conexão.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {!connected ? (
                <Button
                  type="button"
                  disabled={pending || !state.configured}
                  onClick={() => run(connectCompanyWhatsAppAction)}
                >
                  {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Smartphone aria-hidden />}
                  {state.qrCode ? "Gerar novo QR Code" : state.status === "not_connected" ? "Conectar WhatsApp" : "Reconectar"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm("Desconectar este WhatsApp? O histórico continuará salvo.")) {
                      run(disconnectCompanyWhatsAppAction);
                    }
                  }}
                >
                  <Unplug aria-hidden /> Desconectar
                </Button>
              )}
              {state.status !== "not_connected" && state.configured ? (
                <Button type="button" variant="outline" disabled={pending} onClick={() => run(checkCompanyWhatsAppAction)}>
                  <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden /> Verificar agora
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" aria-hidden /> Segurança e continuidade
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex gap-3">
            <Power className="text-fg-subtle mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-fg-muted">Cada empresa recebe uma conexão isolada. Nenhuma chave da Evolution é enviada ao navegador.</p>
          </div>
          <div className="flex gap-3">
            <RefreshCw className="text-fg-subtle mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-fg-muted">Quedas temporárias são acompanhadas pelo sistema. Se a sessão expirar, basta gerar outro QR Code aqui.</p>
          </div>
          <div className="flex gap-3">
            <MessageCircle className="text-fg-subtle mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-fg-muted">Reconectar ou desconectar não apaga o histórico de conversas e compras.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
