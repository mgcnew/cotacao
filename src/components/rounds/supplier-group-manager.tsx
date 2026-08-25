"use client";

import { ChevronDown, Plus, Settings2, Trash2, X } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  removeRoundSupplier,
  upsertRoundSupplierGroups,
  type RoundFormState,
} from "@/features/rounds/actions";

type Contact = {
  id: string;
  name: string;
  role: string | null;
  whatsapp?: string | null;
  is_primary?: boolean;
};

type SupplierOption = {
  id: string;
  name: string;
  contacts: Contact[];
};

type GroupOption = {
  id: string;
  name: string;
  status: string;
  itemCount: number;
};

type Participant = {
  roundSupplierId: string;
  supplierId: string;
  name: string;
  contactId: string | null;
  contacts: Contact[];
  groupIds: string[];
  firstSentAt: string | null;
};

function SaveButton({ label = "Salvar distribuição" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : label}
    </Button>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="destructive" disabled={pending}>
      {pending ? "Retirando…" : "Confirmar retirada"}
    </Button>
  );
}

function GroupChecks({
  groups,
  selected,
}: {
  groups: GroupOption[];
  selected: Set<string>;
}) {
  return (
    <fieldset>
      <legend className="text-fg mb-2 text-xs font-medium">
        Grupos que este fornecedor receberá
      </legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => {
          const checked = selected.has(group.id);
          const encerrado =
            group.status === "closed" || group.status === "cancelled";
          return (
            <label
              key={group.id}
              className="border-border bg-surface-sunken flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2"
            >
              <input
                type="checkbox"
                name={encerrado ? undefined : "groupId"}
                value={group.id}
                defaultChecked={checked}
                disabled={encerrado}
                className="mt-0.5 size-4"
              />
              {encerrado && checked ? (
                <input type="hidden" name="groupId" value={group.id} />
              ) : null}
              <span className="min-w-0">
                <span className="text-fg block truncate text-sm">
                  {group.name}
                </span>
                <span className="text-fg-muted block text-xs">
                  {group.itemCount}{" "}
                  {group.itemCount === 1 ? "produto" : "produtos"}
                  {encerrado ? " · encerrado" : ""}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ParticipantEditor({
  roundId,
  participant,
  groups,
}: {
  roundId: string;
  participant: Participant;
  groups: GroupOption[];
}) {
  const [state, action] = useActionState<RoundFormState, FormData>(
    upsertRoundSupplierGroups,
    { error: null },
  );
  const [removalState, removalAction] = useActionState<
    RoundFormState,
    FormData
  >(removeRoundSupplier, { error: null });
  const [confirmingRemoval, setConfirmingRemoval] = React.useState(false);

  return (
    <article className="border-border rounded-xl border p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-fg text-sm font-semibold">{participant.name}</p>
          <p className="text-fg-muted text-xs">
            {participant.groupIds.length}{" "}
            {participant.groupIds.length === 1 ? "grupo" : "grupos"}
          </p>
        </div>
        {participant.firstSentAt ? (
          <Badge variant="secondary">Já enviado</Badge>
        ) : null}
      </div>

      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="roundId" value={roundId} />
        <input type="hidden" name="supplierId" value={participant.supplierId} />

        <div className="max-w-sm">
          <label
            htmlFor={`manager-contact-${participant.roundSupplierId}`}
            className="text-fg mb-1 block text-xs font-medium"
          >
            Contato que recebe a cotação
          </label>
          <ThemedSelect
            id={`manager-contact-${participant.roundSupplierId}`}
            name="contactId"
            defaultValue={participant.contactId ?? participant.contacts[0]?.id}
            required
            options={participant.contacts.map((contact) => ({
              value: contact.id,
              label: `${contact.name}${contact.role ? ` · ${contact.role}` : ""}`,
            }))}
          />
        </div>

        <GroupChecks groups={groups} selected={new Set(participant.groupIds)} />

        <ErrorLine error={state.error} />
        <SuccessLine
          message={state.savedAt ? "Distribuição atualizada." : null}
        />

        <div className="flex flex-wrap items-center gap-2">
          <SaveButton />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive gap-1.5"
            onClick={() => setConfirmingRemoval(true)}
          >
            <Trash2 className="size-3.5" aria-hidden /> Retirar fornecedor
          </Button>
        </div>
      </form>

      {confirmingRemoval ? (
        <form
          action={removalAction}
          className="border-destructive/30 bg-destructive/5 mt-3 flex flex-col gap-2 rounded-lg border p-3"
        >
          <input type="hidden" name="roundId" value={roundId} />
          <input
            type="hidden"
            name="roundSupplierId"
            value={participant.roundSupplierId}
          />
          <label
            htmlFor={`remove-reason-${participant.roundSupplierId}`}
            className="text-fg text-xs font-medium"
          >
            Motivo da retirada
          </label>
          <Input
            id={`remove-reason-${participant.roundSupplierId}`}
            name="reason"
            required
            minLength={3}
            maxLength={500}
            placeholder="Ex.: fornecedor não atende estes produtos"
          />
          <p className="text-fg-muted text-xs">
            O link será revogado. Respostas e preços já recebidos permanecem no
            histórico.
          </p>
          <ErrorLine error={removalState.error} />
          <div className="flex flex-wrap items-center gap-2">
            <RemoveButton />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingRemoval(false)}
            >
              <X className="size-3.5" aria-hidden /> Cancelar
            </Button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

function AddSupplierEditor({
  roundId,
  suppliers,
  groups,
}: {
  roundId: string;
  suppliers: SupplierOption[];
  groups: GroupOption[];
}) {
  const [state, action] = useActionState<RoundFormState, FormData>(
    upsertRoundSupplierGroups,
    { error: null },
  );
  const [supplierId, setSupplierId] = React.useState("");
  const supplier = suppliers.find((item) => item.id === supplierId) ?? null;

  if (suppliers.length === 0) {
    return (
      <p className="text-fg-muted rounded-lg border border-dashed px-3 py-4 text-sm">
        Todos os fornecedores com contato ativo já participam desta rodada.
      </p>
    );
  }

  return (
    <form
      action={action}
      className="border-border bg-surface-sunken flex flex-col gap-3 rounded-xl border p-3"
    >
      <div className="flex items-center gap-2">
        <Plus className="text-fg-subtle size-4" aria-hidden />
        <h3 className="text-fg text-sm font-semibold">Adicionar fornecedor</h3>
      </div>
      <input type="hidden" name="roundId" value={roundId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="manager-new-supplier"
            className="text-fg mb-1 block text-xs font-medium"
          >
            Fornecedor
          </label>
          <SearchableSelect
            id="manager-new-supplier"
            name="supplierId"
            value={supplierId}
            onValueChange={setSupplierId}
            options={suppliers.map((option) => ({
              id: option.id,
              name: option.name,
              description:
                option.contacts[0]?.name ?? "Nenhum contato disponível",
            }))}
            placeholder="Digite o fornecedor…"
            emptyMessage="Nenhum fornecedor encontrado."
            required
          />
        </div>
        <div>
          <label
            htmlFor="manager-new-contact"
            className="text-fg mb-1 block text-xs font-medium"
          >
            Contato
          </label>
          <ThemedSelect
            key={supplier?.id ?? "empty"}
            id="manager-new-contact"
            name="contactId"
            defaultValue={supplier?.contacts[0]?.id}
            required
            disabled={!supplier}
            placeholder="Escolha o fornecedor primeiro"
            options={(supplier?.contacts ?? []).map((contact) => ({
              value: contact.id,
              label: `${contact.name}${contact.role ? ` · ${contact.role}` : ""}`,
            }))}
          />
        </div>
      </div>

      <GroupChecks
        groups={groups}
        selected={
          new Set(
            groups
              .filter(
                (group) => group.status === "draft" || group.status === "open",
              )
              .map((group) => group.id),
          )
        }
      />
      <ErrorLine error={state.error} />
      <SuccessLine message={state.savedAt ? "Fornecedor adicionado." : null} />
      <div>
        <SaveButton label="Adicionar fornecedor" />
      </div>
    </form>
  );
}

export function SupplierGroupManager({
  roundId,
  groups,
  participants,
  suppliers,
  presentation = "trigger",
}: {
  roundId: string;
  groups: GroupOption[];
  participants: Participant[];
  suppliers: SupplierOption[];
  /** No modal de distribuição, o editor já é a tarefa principal. */
  presentation?: "trigger" | "page";
}) {
  const [open, setOpen] = React.useState(presentation === "page");
  const participantIds = new Set(
    participants.map((participant) => participant.supplierId),
  );
  const available = suppliers.filter(
    (supplier) => !participantIds.has(supplier.id),
  );

  return (
    <div className="mb-4">
      {presentation === "trigger" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <Settings2 className="size-3.5" aria-hidden /> Gerenciar fornecedores
          <ChevronDown
            className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </Button>
      ) : null}

      {open ? (
        <div
          className={`border-border bg-surface flex flex-col gap-3 rounded-xl border p-3 ${presentation === "trigger" ? "mt-3" : ""}`}
        >
          <div>
            <h3 className="text-fg text-sm font-semibold">
              Distribuição por grupo
            </h3>
            <p className="text-fg-muted text-xs">
              Marque somente os grupos que fazem sentido para cada fornecedor. O
              link continua sendo único.
            </p>
          </div>

          {participants.map((participant) => (
            <ParticipantEditor
              key={participant.roundSupplierId}
              roundId={roundId}
              participant={participant}
              groups={groups}
            />
          ))}

          <AddSupplierEditor
            key={available.map((supplier) => supplier.id).join(":")}
            roundId={roundId}
            suppliers={available}
            groups={groups}
          />
        </div>
      ) : null}
    </div>
  );
}
