"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Link2,
  MailQuestion,
  MessageCircle,
  Send,
} from "lucide-react";
import * as React from "react";

import {
  BulkSendDialog,
  type CandidatoDoLote,
  type ModoDoLote,
} from "@/components/rounds/bulk-send-dialog";
import { SendControls } from "@/components/rounds/send-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startWhatsAppConversationAction } from "@/features/whatsapp/actions";
import {
  itemCountLabel,
  renderWhatsAppTemplate,
} from "@/features/whatsapp/message-templates";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type SupplierResponseRow = {
  id: string;
  name: string;
  contact: string;
  whatsapp: string;
  contactId: string | null;
  groups: string[];
  itemCount: number;
  answeredCount: number;
  unavailableCount: number;
  sentAt: string | null;
  accessedAt: string | null;
  completedAt: string | null;
  lastReminderAt: string | null;
};

type Filter = "pending" | "completed" | "attention" | "all";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function urgency(row: SupplierResponseRow) {
  if (!row.sentAt) return 0;
  if (!row.accessedAt) return 1;
  if (row.answeredCount === 0) return 2;
  if (!row.completedAt) return 3;
  return 4;
}

function status(row: SupplierResponseRow, closed: boolean) {
  if (row.completedAt)
    return { label: "Concluiu", variant: "success" as const };
  if (closed && row.answeredCount > 0)
    return { label: "Parcial encerrada", variant: "secondary" as const };
  if (closed) return { label: "Sem resposta", variant: "outline" as const };
  if (row.answeredCount > 0)
    return { label: "Resposta parcial", variant: "secondary" as const };
  if (row.accessedAt)
    return { label: "Abriu, não respondeu", variant: "outline" as const };
  if (row.sentAt) return { label: "Não abriu", variant: "outline" as const };
  return { label: "Não enviado", variant: "destructive" as const };
}

export function SupplierResponseBoard({
  roundId,
  roundStatus,
  suppliers,
  canSend,
  whatsappReady,
  companyName,
  roundTitle,
  invitationTemplate,
  reminderTemplate,
}: {
  roundId: string;
  roundStatus: string;
  suppliers: SupplierResponseRow[];
  canSend: boolean;
  whatsappReady: boolean;
  companyName: string;
  roundTitle: string;
  invitationTemplate: string;
  reminderTemplate: string;
}) {
  const closed = roundStatus === "completed" || roundStatus === "cancelled";
  const completed = suppliers.filter((supplier) => supplier.completedAt).length;
  const partial = suppliers.filter(
    (supplier) => !supplier.completedAt && supplier.answeredCount > 0,
  ).length;
  const noResponse = suppliers.filter(
    (supplier) => supplier.answeredCount === 0,
  ).length;
  const notOpened = suppliers.filter(
    (supplier) => supplier.sentAt && !supplier.accessedAt,
  ).length;
  const unsent = suppliers.filter((supplier) => !supplier.sentAt).length;
  const pending = suppliers.length - completed;
  const attention = closed ? noResponse : notOpened;
  const [filter, setFilter] = React.useState<Filter>(
    pending > 0 ? "pending" : "all",
  );
  const [lote, setLote] = React.useState<{
    modo: ModoDoLote;
    chave: number;
  } | null>(null);

  const isAttention = (supplier: SupplierResponseRow) =>
    closed
      ? supplier.answeredCount === 0
      : Boolean(supplier.sentAt) && !supplier.accessedAt;
  const visible = suppliers
    .filter((supplier) =>
      filter === "all"
        ? true
        : filter === "completed"
          ? Boolean(supplier.completedAt)
          : filter === "attention"
            ? isAttention(supplier)
            : closed
              ? !supplier.completedAt && supplier.answeredCount > 0
              : !supplier.completedAt,
    )
    .sort((a, b) => urgency(a) - urgency(b) || a.name.localeCompare(b.name));

  // Quem entra em cada lote, e por que alguém fica de fora: o motivo aparece
  // na lista do lote em vez de o fornecedor sumir sem explicação.
  const semProdutos = (supplier: SupplierResponseRow) =>
    supplier.itemCount === 0 ? "Sem grupo com produtos" : null;
  const semWhatsApp = (supplier: SupplierResponseRow) =>
    supplier.whatsapp ? null : "Contato sem WhatsApp";
  const paraConvite = suppliers.filter((supplier) => !supplier.sentAt);
  const paraCobranca = suppliers.filter(
    (supplier) => supplier.sentAt && !supplier.completedAt,
  );
  const paraLink = suppliers.filter((supplier) => !supplier.completedAt);
  const candidatos = (modo: ModoDoLote): CandidatoDoLote[] =>
    (modo === "convite"
      ? paraConvite
      : modo === "cobranca"
        ? paraCobranca
        : paraLink
    ).map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      contact: supplier.contact,
      whatsapp: supplier.whatsapp,
      jaEnviado: Boolean(supplier.sentAt),
      bloqueio:
        semProdutos(supplier) ??
        (modo === "link" ? null : semWhatsApp(supplier)),
    }));
  const prontosParaConvite = paraConvite.filter(
    (s) => !semProdutos(s) && !semWhatsApp(s),
  ).length;
  const prontosParaCobranca = paraCobranca.filter(
    (s) => !semProdutos(s) && !semWhatsApp(s),
  ).length;
  const previa =
    (modo: ModoDoLote) => (candidato: CandidatoDoLote | undefined) => {
      const supplier = suppliers.find((row) => row.id === candidato?.id);
      const template =
        modo === "cobranca" || (modo === "link" && supplier?.sentAt)
          ? reminderTemplate
          : invitationTemplate;
      return renderWhatsAppTemplate(template, {
        contato: supplier?.contact ?? "fornecedor",
        empresa: companyName,
        cotacao: roundTitle,
        quantidade_itens: itemCountLabel(supplier?.itemCount ?? 0),
        link: "[link individual da cotação]",
      });
    };
  const abrirLote = (modo: ModoDoLote) => setLote({ modo, chave: Date.now() });

  const metricas: {
    value: Filter;
    label: string;
    count: React.ReactNode;
    icon: typeof CheckCircle2;
  }[] = [
    {
      value: "completed",
      label: "Concluíram",
      icon: CheckCircle2,
      count: (
        <>
          {completed}
          <span className="text-fg-subtle text-sm font-normal">
            /{suppliers.length}
          </span>
        </>
      ),
    },
    {
      value: "pending",
      label: closed ? "Parciais" : "Pendentes",
      icon: Clock3,
      count: closed ? partial : pending,
    },
    {
      value: "attention",
      label: closed ? "Sem resposta" : "Sem abrir",
      icon: MailQuestion,
      count: attention,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Os contadores são os filtros: tocar de novo no escolhido volta a
          mostrar todos. Antes eram três números e, embaixo, três botões que
          repetiam a mesma informação. */}
      <div
        className="grid grid-cols-3 gap-2"
        role="group"
        aria-label="Filtrar fornecedores"
      >
        {metricas.map((metrica) => {
          const ativo = filter === metrica.value;
          const Icon = metrica.icon;
          return (
            <button
              key={metrica.value}
              type="button"
              aria-pressed={ativo}
              onClick={() => setFilter(ativo ? "all" : metrica.value)}
              className={cn(
                "bg-surface rounded-xl border p-3 text-left transition-colors duration-(--dur)",
                "focus-visible:ring-ring/50 outline-none focus-visible:ring-3",
                ativo
                  ? "border-fg/40 ring-fg/10 ring-1"
                  : "border-border hover:border-border-strong",
              )}
            >
              <span className="text-fg-muted flex flex-col items-start gap-1 text-xs sm:flex-row sm:items-center sm:gap-1.5">
                <Icon className="size-3.5" aria-hidden /> {metrica.label}
              </span>
              <span className="text-fg mt-1 block text-xl font-semibold tabular-nums">
                {metrica.count}
              </span>
            </button>
          );
        })}
      </div>

      {closed && pending > 0 ? (
        <div className="border-border bg-surface-sunken flex items-start gap-2 rounded-xl border px-3 py-2.5">
          <AlertCircle
            className="text-fg-muted mt-0.5 size-4 shrink-0"
            aria-hidden
          />
          <p className="text-fg-muted text-sm">
            A cotação está encerrada.{" "}
            {partial > 0
              ? `${partial} ${partial === 1 ? "fornecedor respondeu parcialmente" : "fornecedores responderam parcialmente"}`
              : "Nenhum fornecedor respondeu parcialmente"}
            {noResponse > 0
              ? ` e ${noResponse} ${noResponse === 1 ? "ficou sem resposta" : "ficaram sem resposta"}`
              : ""}
            . Esses registros são resultado histórico, não pendências da compra.
          </p>
        </div>
      ) : null}

      {/* Uma ação principal, a que a rodada pede agora: mandar a quem ainda
          não recebeu, cobrar quem não concluiu, ou nada a fazer. */}
      {canSend && !closed ? (
        <div className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            {unsent > 0 ? (
              <>
                <p className="text-fg text-sm font-semibold">
                  {unsent}{" "}
                  {unsent === 1
                    ? "fornecedor ainda não recebeu"
                    : "fornecedores ainda não receberam"}{" "}
                  a cotação
                </p>
                <p className="text-fg-muted text-[13px]">
                  {whatsappReady
                    ? "Envie para todos de uma vez pelo WhatsApp da empresa."
                    : "O WhatsApp da empresa não está conectado: gere os links e mande pelo celular."}
                </p>
              </>
            ) : pending > 0 ? (
              <>
                <p className="text-fg text-sm font-semibold">
                  {pending}{" "}
                  {pending === 1
                    ? "fornecedor ainda não concluiu"
                    : "fornecedores ainda não concluíram"}
                </p>
                <p className="text-fg-muted text-[13px]">
                  {notOpened > 0
                    ? `${notOpened} ${notOpened === 1 ? "recebeu e não abriu" : "receberam e não abriram"}.`
                    : "Todos já abriram o link."}
                </p>
              </>
            ) : (
              <p className="text-success flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="size-4" aria-hidden /> Todos os
                fornecedores responderam.
              </p>
            )}
          </div>
          {pending > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => abrirLote("link")}
              >
                <Link2 aria-hidden /> Gerar links
              </Button>
              {unsent > 0 && whatsappReady ? (
                <Button
                  type="button"
                  disabled={prontosParaConvite === 0}
                  onClick={() => abrirLote("convite")}
                >
                  <Send aria-hidden /> Enviar para {prontosParaConvite}
                </Button>
              ) : unsent === 0 && whatsappReady ? (
                <Button
                  type="button"
                  disabled={prontosParaCobranca === 0}
                  onClick={() => abrirLote("cobranca")}
                >
                  <Send aria-hidden /> Cobrar {prontosParaCobranca}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {lote ? (
        <BulkSendDialog
          key={lote.chave}
          roundId={roundId}
          modo={lote.modo}
          candidatos={candidatos(lote.modo)}
          previa={previa(lote.modo)}
          open
          onOpenChange={(open) => {
            if (!open) setLote(null);
          }}
        />
      ) : null}

      {filter !== "all" ? (
        <p className="text-fg-muted text-[13px]">
          Mostrando {visible.length} de {suppliers.length}.{" "}
          <button
            type="button"
            className="text-primary font-medium hover:underline"
            onClick={() => setFilter("all")}
          >
            Ver todos
          </button>
        </p>
      ) : null}

      <div className="border-border bg-surface overflow-hidden rounded-xl border">
        <Table className="block md:table">
          <TableHeader className="hidden md:table-header-group">
            <TableRow>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Escopo</TableHead>
              <TableHead>Andamento</TableHead>
              <TableHead>Última atividade</TableHead>
              {canSend ? (
                <TableHead>
                  <span className="sr-only">Ações</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody className="block md:table-row-group">
            {visible.map((supplier) => {
              const currentStatus = status(supplier, closed);
              const withoutAnswer = Math.max(
                0,
                supplier.itemCount - supplier.answeredCount,
              );
              const withPrice = Math.max(
                0,
                supplier.answeredCount - supplier.unavailableCount,
              );
              const latest = [
                supplier.completedAt,
                supplier.accessedAt,
                supplier.lastReminderAt,
                supplier.sentAt,
              ]
                .filter((value): value is string => Boolean(value))
                .sort(
                  (a, b) => new Date(b).getTime() - new Date(a).getTime(),
                )[0];
              return (
                <TableRow
                  key={supplier.id}
                  className="grid grid-cols-2 gap-x-3 gap-y-2 p-3 md:table-row md:p-0"
                >
                  <TableCell className="col-span-2 block min-w-0 p-0 whitespace-normal md:table-cell md:min-w-48 md:p-2">
                    <p className="font-medium">{supplier.name}</p>
                    <p className="text-fg-muted mt-0.5 break-words text-xs">
                      {supplier.contact}
                      {supplier.whatsapp ? ` · ${supplier.whatsapp}` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="col-span-2 block max-w-none border-t p-0 pt-2 whitespace-normal md:table-cell md:max-w-60 md:border-0 md:p-2">
                    <p className="text-fg-muted text-xs">
                      {supplier.groups.join(", ") || "Nenhum grupo"}
                    </p>
                    <p className="text-fg-subtle text-xs">
                      {supplier.itemCount}{" "}
                      {supplier.itemCount === 1 ? "produto" : "produtos"}
                    </p>
                  </TableCell>
                  <TableCell className="col-span-2 block p-0 whitespace-normal md:table-cell md:p-2">
                    <span className="text-fg-subtle mb-1 block text-xs md:hidden">
                      Andamento
                    </span>
                    <Badge variant={currentStatus.variant}>
                      {currentStatus.label}
                    </Badge>
                    <p className="text-fg-subtle mt-1 text-xs tabular-nums">
                      {withPrice} com preço
                      {supplier.unavailableCount > 0
                        ? ` · ${supplier.unavailableCount} não fornece`
                        : ""}
                      {withoutAnswer > 0
                        ? ` · ${withoutAnswer} sem resposta`
                        : ""}
                    </p>
                  </TableCell>
                  <TableCell className="text-fg-muted col-span-2 block p-0 text-xs md:table-cell md:p-2">
                    <span className="text-fg-subtle mb-1 block text-xs md:hidden">
                      Última atividade
                    </span>
                    {latest ? dateTime.format(new Date(latest)) : "—"}
                    {supplier.lastReminderAt ? (
                      <span className="text-fg-subtle mt-1 block">
                        Última cobrança:{" "}
                        {dateTime.format(new Date(supplier.lastReminderAt))}
                      </span>
                    ) : null}
                  </TableCell>
                  {canSend ? (
                    <TableCell className="col-span-2 block border-t p-0 pt-3 md:table-cell md:border-0 md:p-2">
                      <div className="flex items-start justify-end gap-1">
                        {supplier.contactId && supplier.whatsapp ? (
                          <form action={startWhatsAppConversationAction}>
                            <input
                              type="hidden"
                              name="contact_id"
                              value={supplier.contactId}
                            />
                            <input
                              type="hidden"
                              name="purchase_round_id"
                              value={roundId}
                            />
                            <Button
                              type="submit"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Conversar com ${supplier.name}`}
                              title="Conversar"
                            >
                              <MessageCircle aria-hidden />
                            </Button>
                          </form>
                        ) : null}
                        <SendControls
                          compact
                          roundSupplierId={supplier.id}
                          roundId={roundId}
                          supplierName={supplier.name}
                          alreadySent={Boolean(supplier.sentAt)}
                          groupSummary={supplier.groups}
                          itemCount={supplier.itemCount}
                          contactName={supplier.contact}
                          contactWhatsapp={supplier.whatsapp || null}
                          whatsappReady={whatsappReady}
                          companyName={companyName}
                          roundTitle={roundTitle}
                          invitationTemplate={invitationTemplate}
                          showSummary={false}
                        />
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
            {visible.length === 0 ? (
              <TableRow className="block md:table-row">
                <TableCell
                  colSpan={canSend ? 5 : 4}
                  className="text-fg-muted block py-8 text-center md:table-cell"
                >
                  Nenhum fornecedor neste filtro.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
