"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { useFechaAoSalvar } from "@/components/layout/fecha-ao-salvar";
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
  useFormularioSujo,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createSupplierNotice,
  type SupplierNoticeFormState,
  updateSupplierNotice,
} from "@/features/suppliers/actions";
import {
  SUPPLIER_NOTICE_KIND_LABEL,
  SUPPLIER_NOTICE_KINDS,
} from "@/features/suppliers/notices";

const fieldClass =
  "border-input bg-background text-fg focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-3";

export type EditableSupplierNotice = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  amount: number | null;
  dueDate: string | null;
  priority: string;
};

export function SupplierNoticeDialog({
  supplierId,
  notice,
}: {
  supplierId: string;
  notice?: EditableSupplierNotice;
}) {
  const action = notice
    ? updateSupplierNotice.bind(null, notice.id, supplierId)
    : createSupplierNotice.bind(null, supplierId);
  const [state, formAction] = useActionState<SupplierNoticeFormState, FormData>(
    action,
    { error: null },
  );
  const [open, setOpen] = useFechaAoSalvar(state.savedAt);
  const { sujo, marcarSujo, limpar } = useFormularioSujo();
  const values = state.values;
  const prefix = notice ? `notice-${notice.id}-` : "new-notice-";
  const defaultAmount =
    notice?.amount === null || notice?.amount === undefined
      ? ""
      : String(notice.amount).replace(".", ",");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) limpar();
      }}
    >
      <DialogTrigger asChild>
        {notice ? (
          <Button type="button" size="sm" variant="ghost" className="gap-1.5">
            <Pencil className="size-3.5" aria-hidden /> Editar
          </Button>
        ) : (
          <Button type="button" size="sm" className="gap-1.5">
            <Plus className="size-3.5" aria-hidden /> Novo registro
          </Button>
        )}
      </DialogTrigger>

      <DialogContent size="md" impedirFechamentoAcidental={sujo}>
        <DialogHeader>
          <DialogTitle>
            {notice ? "Editar aviso ou combinado" : "Novo aviso ou combinado"}
          </DialogTitle>
          <DialogDescription>
            Registre o que a equipe precisa lembrar ao negociar ou comprar deste
            fornecedor.
          </DialogDescription>
        </DialogHeader>

        <form
          key={state.respondedAt}
          action={formAction}
          onChange={marcarSujo}
          className="contents"
        >
          <DialogBody className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${prefix}kind`} className="text-fg text-sm font-medium">
                  Tipo
                </label>
                <select
                  id={`${prefix}kind`}
                  name="kind"
                  defaultValue={values?.kind ?? notice?.kind ?? "alert"}
                  className={fieldClass}
                >
                  {SUPPLIER_NOTICE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {SUPPLIER_NOTICE_KIND_LABEL[kind]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${prefix}priority`}
                  className="text-fg text-sm font-medium"
                >
                  Prioridade
                </label>
                <select
                  id={`${prefix}priority`}
                  name="priority"
                  defaultValue={values?.priority ?? notice?.priority ?? "normal"}
                  className={fieldClass}
                >
                  <option value="normal">Normal</option>
                  <option value="high">Importante</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${prefix}title`} className="text-fg text-sm font-medium">
                Título
              </label>
              <Input
                id={`${prefix}title`}
                name="title"
                defaultValue={values?.title ?? notice?.title ?? ""}
                required
                autoFocus={!notice}
                minLength={3}
                maxLength={120}
                placeholder="Ex.: Crédito da devolução anterior"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`${prefix}description`}
                className="text-fg text-sm font-medium"
              >
                Detalhes <span className="text-fg-subtle">(opcional)</span>
              </label>
              <textarea
                id={`${prefix}description`}
                name="description"
                defaultValue={values?.description ?? notice?.description ?? ""}
                maxLength={1500}
                rows={4}
                className={`${fieldClass} resize-y`}
                placeholder="Explique o que foi combinado e o que deve ser conferido."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${prefix}amount`} className="text-fg text-sm font-medium">
                  Valor <span className="text-fg-subtle">(opcional)</span>
                </label>
                <Input
                  id={`${prefix}amount`}
                  name="amount"
                  defaultValue={values?.amount ?? defaultAmount}
                  inputMode="decimal"
                  placeholder="350,00"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${prefix}dueDate`} className="text-fg text-sm font-medium">
                  Validade <span className="text-fg-subtle">(opcional)</span>
                </label>
                <Input
                  id={`${prefix}dueDate`}
                  name="dueDate"
                  type="date"
                  defaultValue={values?.dueDate ?? notice?.dueDate ?? ""}
                />
              </div>
            </div>

            <ErrorLine error={state.error} />
          </DialogBody>

          <DialogFooter>
            <SubmitButton editing={Boolean(notice)} />
            <DialogClose asChild>
              <Button type="button" size="sm" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <p className="text-fg-subtle ml-auto text-xs">
              O registro ficará visível para a equipe.
            </p>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : editing ? "Salvar alterações" : "Adicionar"}
    </Button>
  );
}
