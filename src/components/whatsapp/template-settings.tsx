"use client";

import { LoaderCircle, RotateCcw, Save, Variable } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine, SuccessLine } from "@/components/layout/form-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  saveWhatsAppTemplateAction,
  type WhatsAppTemplateState,
} from "@/features/whatsapp/actions";
import {
  WHATSAPP_TEMPLATE_KINDS,
  WHATSAPP_TEMPLATE_META,
  WHATSAPP_TEMPLATE_VARIABLES_BY_KIND,
  type WhatsAppTemplateKind,
} from "@/features/whatsapp/message-templates";

function SubmitButtons({ canManage }: { canManage: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" name="intent" value="save" disabled={!canManage || pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
        {pending ? "Salvando…" : "Salvar modelo"}
      </Button>
      <Button type="submit" name="intent" value="reset" variant="outline" disabled={!canManage || pending}>
        <RotateCcw aria-hidden /> Restaurar padrão
      </Button>
    </div>
  );
}

function TemplateForm({
  kind,
  body,
  canManage,
}: {
  kind: WhatsAppTemplateKind;
  body: string;
  canManage: boolean;
}) {
  const [state, action] = useActionState<WhatsAppTemplateState, FormData>(
    saveWhatsAppTemplateAction,
    { error: null },
  );
  const meta = WHATSAPP_TEMPLATE_META[kind];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{meta.title}</CardTitle>
        <CardDescription>{meta.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="kind" value={kind} />
          <div>
            <label htmlFor={`template-${kind}`} className="text-fg mb-1.5 block text-sm font-medium">
              Texto da mensagem
            </label>
            <textarea
              key={`${kind}-${body}`}
              id={`template-${kind}`}
              name="body"
              defaultValue={body}
              rows={9}
              maxLength={4000}
              disabled={!canManage}
              className="border-input bg-surface text-fg placeholder:text-fg-subtle focus-visible:border-ring focus-visible:ring-ring/30 min-h-48 w-full resize-y rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          <div>
            <p className="text-fg-muted mb-2 flex items-center gap-1.5 text-xs font-medium">
              <Variable className="size-3.5" aria-hidden /> Variáveis disponíveis
            </p>
            <div className="flex flex-wrap gap-1.5">
              {WHATSAPP_TEMPLATE_VARIABLES_BY_KIND[kind].map((variable) => (
                <code key={variable} className="bg-surface-sunken border-border text-fg-muted rounded-md border px-2 py-1 text-xs">
                  {`{${variable}}`}
                </code>
              ))}
            </div>
            <p className="text-fg-subtle mt-2 text-xs">
              O campo <code>{"{link}"}</code> é obrigatório e recebe um link individual e seguro para cada fornecedor.
            </p>
          </div>
          <ErrorLine error={state.error} />
          <SuccessLine message={state.savedAt ? (state.reset ? "Modelo padrão restaurado." : "Modelo salvo.") : null} />
          <SubmitButtons canManage={canManage} />
        </form>
      </CardContent>
    </Card>
  );
}

export function WhatsAppTemplateSettings({
  templates,
  canManage,
}: {
  templates: Record<WhatsAppTemplateKind, string>;
  canManage: boolean;
}) {
  return (
    <section className="mt-4 space-y-3">
      <div>
        <h2 className="text-fg text-base font-semibold">Modelos de mensagem</h2>
        <p className="text-fg-muted text-sm">
          Personalize o convite e a cobrança. A prévia da cotação usa este mesmo texto antes do envio.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {WHATSAPP_TEMPLATE_KINDS.map((kind) => (
          <TemplateForm key={kind} kind={kind} body={templates[kind]} canManage={canManage} />
        ))}
      </div>
    </section>
  );
}
