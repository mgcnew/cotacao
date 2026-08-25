"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MailQuestion,
  MessageCircle,
  Send,
} from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
import { SendControls } from "@/components/rounds/send-controls";
import { Badge } from "@/components/ui/badge";
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
import {
  sendQuotationReminders,
  type ReminderState,
} from "@/features/rounds/send";
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
  sentAt: string | null;
  accessedAt: string | null;
  completedAt: string | null;
  lastReminderAt: string | null;
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
  if (row.completedAt)
    return { label: "Concluiu", variant: "default" as const };
  if (row.answeredCount > 0)
    return { label: "Resposta parcial", variant: "secondary" as const };
  if (row.accessedAt)
    return { label: "Abriu, não respondeu", variant: "outline" as const };
  if (row.sentAt) return { label: "Não abriu", variant: "outline" as const };
  return { label: "Não enviado", variant: "destructive" as const };
}

function ReminderSubmit({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
      {pending ? "Enviando…" : `Cobrar ${count}`}
    </Button>
  );
}

export function SupplierResponseBoard({
  roundId,
  suppliers,
  canSend,
  whatsappReady,
  companyName,
  roundTitle,
  invitationTemplate,
  reminderTemplate,
}: {
  roundId: string;
  suppliers: SupplierResponseRow[];
  canSend: boolean;
  whatsappReady: boolean;
  companyName: string;
  roundTitle: string;
  invitationTemplate: string;
  reminderTemplate: string;
}) {
  const completed = suppliers.filter((supplier) => supplier.completedAt).length;
  const notOpened = suppliers.filter(
    (supplier) => supplier.sentAt && !supplier.accessedAt,
  ).length;
  const unsent = suppliers.filter((supplier) => !supplier.sentAt).length;
  const pending = suppliers.length - completed;
  const [filter, setFilter] = React.useState<Filter>(
    pending > 0 ? "pending" : "all",
  );
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [reminderOpen, setReminderOpen] = React.useState(false);
  const sendAndClose = React.useCallback(
    async (previous: ReminderState, formData: FormData) => {
      const next = await sendQuotationReminders(previous, formData);
      if (next.sent > 0 && next.failed === 0) {
        setReminderOpen(false);
        setSelected(new Set());
      }
      return next;
    },
    [],
  );
  const [reminderState, reminderAction] = useActionState<ReminderState, FormData>(
    sendAndClose,
    { error: null, sent: 0, skipped: 0, failed: 0 },
  );

  const visible = suppliers
    .filter((supplier) =>
      filter === "all"
        ? true
        : filter === "completed"
          ? Boolean(supplier.completedAt)
          : !supplier.completedAt,
    )
    .sort((a, b) => urgency(a) - urgency(b) || a.name.localeCompare(b.name));
  const eligible = visible.filter((supplier) =>
    Boolean(supplier.sentAt) && !supplier.completedAt && Boolean(supplier.whatsapp),
  );
  const selectedRows = suppliers.filter((supplier) => selected.has(supplier.id));
  const previewSupplier = selectedRows[0];
  const reminderPreview = renderWhatsAppTemplate(reminderTemplate, {
    contato: previewSupplier?.contact ?? "fornecedor",
    empresa: companyName,
    cotacao: roundTitle,
    quantidade_itens: itemCountLabel(previewSupplier?.itemCount ?? 0),
    link: "[link individual da cotação]",
  });

  function toggleSupplier(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked && (next.size < 20 || next.has(id))) next.add(id);
      else if (!checked) next.delete(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="border-border rounded-xl border p-3">
          <p className="text-fg-muted flex flex-col items-start gap-1 text-xs sm:flex-row sm:items-center sm:gap-1.5">
            <CheckCircle2 className="size-3.5" aria-hidden /> Concluíram
          </p>
          <p className="text-fg mt-1 text-xl font-semibold tabular-nums">
            {completed}
            <span className="text-fg-subtle text-sm font-normal">
              /{suppliers.length}
            </span>
          </p>
        </div>
        <div className="border-border rounded-xl border p-3">
          <p className="text-fg-muted flex flex-col items-start gap-1 text-xs sm:flex-row sm:items-center sm:gap-1.5">
            <Clock3 className="size-3.5" aria-hidden /> Pendentes
          </p>
          <p className="text-fg mt-1 text-xl font-semibold tabular-nums">
            {pending}
          </p>
        </div>
        <div className="border-border rounded-xl border p-3">
          <p className="text-fg-muted flex flex-col items-start gap-1 text-xs sm:flex-row sm:items-center sm:gap-1.5">
            <MailQuestion className="size-3.5" aria-hidden /> Sem abrir
          </p>
          <p className="text-fg mt-1 text-xl font-semibold tabular-nums">
            {notOpened}
          </p>
        </div>
      </div>

      {pending > 0 ? (
        <div className="border-border bg-surface-sunken flex items-start gap-2 rounded-xl border px-3 py-2.5">
          <AlertCircle
            className="text-fg-muted mt-0.5 size-4 shrink-0"
            aria-hidden
          />
          <p className="text-fg-muted text-sm">
            <span className="text-fg font-medium">Prioridade:</span>{" "}
            {unsent > 0
              ? `${unsent} ${unsent === 1 ? "convite ainda não foi enviado" : "convites ainda não foram enviados"}. `
              : ""}
            {notOpened > 0
              ? `${notOpened} ${notOpened === 1 ? "fornecedor recebeu, mas não abriu" : "fornecedores receberam, mas não abriram"}.`
              : "Acompanhe quem já abriu e ainda não concluiu."}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
        {(["pending", "completed", "all"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={filter === value ? "default" : "outline"}
            onClick={() => setFilter(value)}
          >
            <span className="sm:hidden">
              {value === "pending"
                ? "Pendentes"
                : value === "completed"
                  ? "Concluídos"
                  : "Todos"}
            </span>
            <span className="hidden sm:inline">
              {value === "pending"
                ? `Pendentes (${pending})`
                : value === "completed"
                  ? `Concluídos (${completed})`
                  : `Todos (${suppliers.length})`}
            </span>
          </Button>
        ))}
      </div>

      {canSend ? (
        <div className="border-border flex flex-wrap items-center gap-2 border-t pt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={eligible.length === 0}
            onClick={() => setSelected(new Set(eligible.slice(0, 20).map((supplier) => supplier.id)))}
          >
            Selecionar pendentes ({Math.min(eligible.length, 20)})
          </Button>
          {selected.size > 0 ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </Button>
          ) : null}
          <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                size="sm"
                disabled={selected.size === 0 || !whatsappReady}
                title={!whatsappReady ? "Conecte o WhatsApp em Configurações" : undefined}
              >
                <Send aria-hidden /> Cobrar selecionados ({selected.size})
              </Button>
            </DialogTrigger>
            <DialogContent size="md">
              <DialogHeader>
                <DialogTitle>Cobrar respostas pendentes</DialogTitle>
                <DialogDescription>
                  Confira os destinatários. O sistema ignora quem foi cobrado há menos de 2 horas.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {selectedRows.map((supplier) => (
                    <Badge key={supplier.id} variant="secondary">{supplier.name}</Badge>
                  ))}
                </div>
                <div className="bg-surface-sunken border-border rounded-xl border p-4">
                  <p className="text-fg-muted whitespace-pre-wrap text-sm">
                    {reminderPreview}
                  </p>
                </div>
                <ErrorLine error={reminderState.error} />
              </DialogBody>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                <form action={reminderAction}>
                  <input type="hidden" name="roundId" value={roundId} />
                  {[...selected].map((id) => (
                    <input key={id} type="hidden" name="roundSupplierIds" value={id} />
                  ))}
                  <ReminderSubmit count={selected.size} />
                </form>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <SuccessLine
            message={reminderState.sent > 0
              ? `${reminderState.sent} ${reminderState.sent === 1 ? "cobrança enviada" : "cobranças enviadas"}${reminderState.skipped > 0 ? ` · ${reminderState.skipped} ignoradas` : ""}.`
              : null}
          />
        </div>
      ) : null}

      <div className="border-border overflow-hidden rounded-xl border">
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
              const currentStatus = status(supplier);
              const latest = [supplier.completedAt, supplier.accessedAt, supplier.lastReminderAt, supplier.sentAt]
                .filter((value): value is string => Boolean(value))
                .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
              const canRemind = Boolean(supplier.sentAt) && !supplier.completedAt && Boolean(supplier.whatsapp);
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
                    <span className="text-fg-subtle mb-1 block text-[11px] md:hidden">
                      Andamento
                    </span>
                    <Badge variant={currentStatus.variant}>
                      {currentStatus.label}
                    </Badge>
                    <p className="text-fg-subtle mt-1 text-xs tabular-nums">
                      {supplier.answeredCount} de {supplier.itemCount}{" "}
                      respondidos
                    </p>
                  </TableCell>
                  <TableCell className="text-fg-muted col-span-2 block p-0 text-xs md:table-cell md:p-2">
                    <span className="text-fg-subtle mb-1 block text-[11px] md:hidden">
                      Última atividade
                    </span>
                    {latest ? dateTime.format(new Date(latest)) : "—"}
                    {supplier.lastReminderAt ? (
                      <span className="text-fg-subtle mt-1 block">
                        Última cobrança: {dateTime.format(new Date(supplier.lastReminderAt))}
                      </span>
                    ) : null}
                  </TableCell>
                  {canSend ? (
                    <TableCell className="col-span-2 block space-y-2 border-t p-0 pt-3 md:table-cell md:space-y-1.5 md:border-0 md:p-2">
                      {canRemind ? (
                        <label className="text-fg-muted flex cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="accent-primary size-4"
                            checked={selected.has(supplier.id)}
                            disabled={!selected.has(supplier.id) && selected.size >= 20}
                            onChange={(event) => toggleSupplier(supplier.id, event.target.checked)}
                          />
                          Selecionar para cobrança
                        </label>
                      ) : null}
                      <div className="[&_[data-slot=button]]:w-full md:[&_[data-slot=button]]:w-auto">
                        <SendControls
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
                            size="sm"
                            variant="outline"
                            className="w-full"
                          >
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
