import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FilePen,
  Hourglass,
  ListTodo,
  MailX,
  MessageSquareWarning,
  Receipt,
  RefreshCw,
  Truck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import type { AttentionItem } from "@/features/dashboard/attention";
import { cn } from "@/lib/utils";

/**
 * Ícone e cor de cada pendência, para a lista não virar uma fileira de
 * triângulos iguais. O urgente fica sempre vermelho — a cor diz a prioridade
 * — e o ícone diz o assunto; os outros ganham a cor do que pedem.
 */
const VISUAL: Record<string, { icon: LucideIcon; tone: string }> = {
  "pedidos-atrasados": { icon: Clock, tone: "" },
  "revisoes-pendentes": { icon: RefreshCw, tone: "" },
  "falhas-de-envio": { icon: MailX, tone: "" },
  "divergencias-comerciais": { icon: Receipt, tone: "" },
  "divergencias-fornecedor": { icon: MessageSquareWarning, tone: "" },
  "rodadas-para-fechar": { icon: ClipboardCheck, tone: "" },
  "itens-sem-alocacao": {
    icon: ListTodo,
    tone: "bg-warning-soft text-warning",
  },
  "pedidos-rascunho": { icon: FilePen, tone: "bg-info-soft text-info" },
  "fornecedores-sem-resposta": {
    icon: Hourglass,
    tone: "bg-primary-soft text-primary",
  },
  "entrega-hoje": { icon: Truck, tone: "bg-success-soft text-success" },
};

const URGENTE = "bg-destructive-soft text-destructive";
const NEUTRO = "bg-surface-muted text-fg-subtle";

/**
 * A lista de pendências, na ordem em que pedem atenção.
 *
 * Cada linha é um link inteiro, e não um texto com um botão ao lado: o alvo de
 * toque no celular passa a ser a linha toda. O verbo fica visível à direita,
 * em qualquer tamanho de tela, porque saber que existe uma pendência não
 * adianta sem saber o que fazer com ela — é o que o documento mestre pede em
 * 13.2.
 */
export function AttentionList({
  items,
  hideEmpty = false,
}: {
  items: AttentionItem[];
  /** Quem renderiza outras pendências no mesmo cartão não quer o "nada pedindo atenção". */
  hideEmpty?: boolean;
}) {
  if (items.length === 0 && hideEmpty) return null;
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 px-5 py-8">
        <span className="bg-success-soft text-success grid size-10 shrink-0 place-items-center rounded-xl">
          <CheckCircle2 className="size-5" aria-hidden />
        </span>
        <div className="text-sm">
          <p className="text-fg font-medium">Tudo em dia por enquanto</p>
          <p className="text-fg-muted">
            Nenhum pedido atrasado, nenhuma divergência aberta e nenhuma compra
            parada esperando você.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="divide-border divide-y">
      {items.map((item) => {
        const visual = VISUAL[item.key];
        const Icon = visual?.icon ?? AlertTriangle;
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              className="hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:ring-ring/40 flex items-center gap-3 px-4 py-3.5 transition-colors outline-none focus-visible:ring-3 sm:px-5"
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-xl",
                  item.severity === "high" ? URGENTE : visual?.tone || NEUTRO,
                )}
                aria-hidden
              >
                <Icon className="size-4" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-fg block text-sm font-medium">
                    {item.title}
                  </span>
                  {item.severity === "high" ? (
                    <span className="bg-destructive-soft text-destructive rounded-full px-1.5 py-0.5 text-xs font-semibold uppercase">
                      Urgente
                    </span>
                  ) : null}
                </span>
                <span className="text-fg-muted block text-xs">{item.hint}</span>
              </span>

              <span className="text-fg-muted flex shrink-0 items-center gap-1 text-xs font-medium">
                {/* No celular também: saber que existe a pendência não adianta
                  sem saber o que fazer com ela. */}
                <span>{item.actionLabel}</span>
                <ArrowRight className="size-3.5" aria-hidden />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
