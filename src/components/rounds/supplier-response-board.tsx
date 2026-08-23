"use client";

import { AlertCircle, CheckCircle2, Clock3, MailQuestion, MessageCircle } from "lucide-react";
import * as React from "react";

import { SendControls } from "@/components/rounds/send-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { startWhatsAppConversationAction } from "@/features/whatsapp/actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type SupplierResponseRow = {
  id: string;
  name: string;
  contact: string;
  whatsapp: string;
  contactId: string | null;
  groups: string[];
  itemCount: number;
  answeredCount: number;
  sentAt: string | null;
  accessedAt: string | null;
  completedAt: string | null;
};

type Filter = "pending" | "completed" | "all";

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

function status(row: SupplierResponseRow) {
  if (row.completedAt) return { label: "Concluiu", variant: "default" as const };
  if (row.answeredCount > 0) return { label: "Resposta parcial", variant: "secondary" as const };
  if (row.accessedAt) return { label: "Abriu, não respondeu", variant: "outline" as const };
  if (row.sentAt) return { label: "Não abriu", variant: "outline" as const };
  return { label: "Não enviado", variant: "destructive" as const };
}

export function SupplierResponseBoard({
  roundId,
  suppliers,
  canSend,
}: {
  roundId: string;
  suppliers: SupplierResponseRow[];
  canSend: boolean;
}) {
  const completed = suppliers.filter((supplier) => supplier.completedAt).length;
  const notOpened = suppliers.filter((supplier) => supplier.sentAt && !supplier.accessedAt).length;
  const unsent = suppliers.filter((supplier) => !supplier.sentAt).length;
  const pending = suppliers.length - completed;
  const [filter, setFilter] = React.useState<Filter>(pending > 0 ? "pending" : "all");

  const visible = suppliers
    .filter((supplier) =>
      filter === "all" ? true : filter === "completed" ? Boolean(supplier.completedAt) : !supplier.completedAt,
    )
    .sort((a, b) => urgency(a) - urgency(b) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="border-border rounded-xl border p-3">
          <p className="text-fg-muted flex items-center gap-1.5 text-xs"><CheckCircle2 className="size-3.5" aria-hidden /> Concluíram</p>
          <p className="text-fg mt-1 text-xl font-semibold tabular-nums">{completed}<span className="text-fg-subtle text-sm font-normal">/{suppliers.length}</span></p>
        </div>
        <div className="border-border rounded-xl border p-3">
          <p className="text-fg-muted flex items-center gap-1.5 text-xs"><Clock3 className="size-3.5" aria-hidden /> Pendentes</p>
          <p className="text-fg mt-1 text-xl font-semibold tabular-nums">{pending}</p>
        </div>
        <div className="border-border rounded-xl border p-3">
          <p className="text-fg-muted flex items-center gap-1.5 text-xs"><MailQuestion className="size-3.5" aria-hidden /> Sem abrir</p>
          <p className="text-fg mt-1 text-xl font-semibold tabular-nums">{notOpened}</p>
        </div>
      </div>

      {pending > 0 ? (
        <div className="border-border bg-surface-sunken flex items-start gap-2 rounded-xl border px-3 py-2.5">
          <AlertCircle className="text-fg-muted mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-fg-muted text-sm">
            <span className="text-fg font-medium">Prioridade:</span>{" "}
            {unsent > 0 ? `${unsent} ${unsent === 1 ? "convite ainda não foi enviado" : "convites ainda não foram enviados"}. ` : ""}
            {notOpened > 0 ? `${notOpened} ${notOpened === 1 ? "fornecedor recebeu, mas não abriu" : "fornecedores receberam, mas não abriram"}.` : "Acompanhe quem já abriu e ainda não concluiu."}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {(["pending", "completed", "all"] as const).map((value) => (
          <Button key={value} type="button" size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>
            {value === "pending" ? `Pendentes (${pending})` : value === "completed" ? `Concluídos (${completed})` : `Todos (${suppliers.length})`}
          </Button>
        ))}
      </div>

      <div className="border-border overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Escopo</TableHead>
              <TableHead>Andamento</TableHead>
              <TableHead>Última atividade</TableHead>
              {canSend ? <TableHead><span className="sr-only">Ações</span></TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((supplier) => {
              const currentStatus = status(supplier);
              const latest = supplier.completedAt ?? supplier.accessedAt ?? supplier.sentAt;
              return (
                <TableRow key={supplier.id}>
                  <TableCell className="min-w-48 whitespace-normal">
                    <p className="font-medium">{supplier.name}</p>
                    <p className="text-fg-muted text-xs">{supplier.contact}{supplier.whatsapp ? ` · ${supplier.whatsapp}` : ""}</p>
                  </TableCell>
                  <TableCell className="max-w-60 whitespace-normal">
                    <p className="text-fg-muted text-xs">{supplier.groups.join(", ") || "Nenhum grupo"}</p>
                    <p className="text-fg-subtle text-xs">{supplier.itemCount} {supplier.itemCount === 1 ? "produto" : "produtos"}</p>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <Badge variant={currentStatus.variant}>{currentStatus.label}</Badge>
                    <p className="text-fg-subtle mt-1 text-xs tabular-nums">{supplier.answeredCount} de {supplier.itemCount} respondidos</p>
                  </TableCell>
                  <TableCell className="text-fg-muted text-xs">{latest ? dateTime.format(new Date(latest)) : "—"}</TableCell>
                  {canSend ? (
                    <TableCell className="space-y-1.5">
                      <SendControls
                        roundSupplierId={supplier.id}
                        roundId={roundId}
                        supplierName={supplier.name}
                        alreadySent={Boolean(supplier.sentAt)}
                        groupSummary={supplier.groups}
                        itemCount={supplier.itemCount}
                        showSummary={false}
                      />
                      {supplier.contactId && supplier.whatsapp ? (
                        <form action={startWhatsAppConversationAction}>
                          <input type="hidden" name="contact_id" value={supplier.contactId} />
                          <input type="hidden" name="purchase_round_id" value={roundId} />
                          <Button type="submit" size="sm" variant="outline" className="w-full">
                            <MessageCircle aria-hidden /> Conversar
                          </Button>
                        </form>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
            {visible.length === 0 ? (
              <TableRow><TableCell colSpan={canSend ? 5 : 4} className="text-fg-muted py-8 text-center">Nenhum fornecedor neste filtro.</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
