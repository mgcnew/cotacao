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
import { Suspense } from "react";

import type { AttentionItem } from "@/features/dashboard/attention";
import { getAttentionSuppliers } from "@/features/dashboard/attention-suppliers";
import { cn } from "@/lib/utils";

/**
 * O ícone de cada pendência, para a lista não virar uma fileira de triângulos
 * iguais. O ícone diz o assunto; a cor só diz uma coisa, a urgência: vermelho
 * no que é urgente e neutro em todo o resto. Com uma cor por linha (azul,
 * âmbar, roxo, verde) as linhas disputavam o olho e nenhuma se destacava.
 */
const ICONE: Record<string, LucideIcon> = {
  "pedidos-atrasados": Clock,
  "revisoes-pendentes": RefreshCw,
  "falhas-de-envio": MailX,
  "divergencias-comerciais": Receipt,
  "divergencias-fornecedor": MessageSquareWarning,
  "rodadas-para-fechar": ClipboardCheck,
  "itens-sem-alocacao": ListTodo,
  "pedidos-rascunho": FilePen,
  "fornecedores-sem-resposta": Hourglass,
  "entrega-hoje": Truck,
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
  companyId,
  hideEmpty = false,
}: {
  items: AttentionItem[];
  /** Para dizer de quem são os pedidos de cada item (`SupplierNames`). */
  companyId: string;
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
        const Icon = ICONE[item.key] ?? AlertTriangle;
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              className="hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:ring-ring/40 flex items-center gap-3 px-4 py-4 transition-colors outline-none focus-visible:ring-3 sm:px-5"
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-xl",
                  item.severity === "high" ? URGENTE : NEUTRO,
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
                    <span className="bg-destructive-soft text-destructive rounded-[4px] px-1.5 py-0.5 text-xs font-medium">
                      Urgente
                    </span>
                  ) : null}
                </span>
                {item.orderSituation ? (
                  <Suspense fallback={null}>
                    <SupplierNames
                      companyId={companyId}
                      situacao={item.orderSituation}
                    />
                  </Suspense>
                ) : null}
                <span className="text-fg-subtle block text-xs">
                  {item.hint}
                </span>
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

/** Quantos nomes cabem na linha antes de virar "e mais N". */
const NOMES_VISIVEIS = 3;

/**
 * "Alliz, Brf, Aurora e mais 5": de quem são os pedidos do item.
 *
 * Os nomes chegam depois da lista, num `<Suspense>` próprio, e são um
 * complemento — se a leitura falhar, a linha continua com o título e a dica, e
 * a pendência segue clicável.
 */
async function SupplierNames({
  companyId,
  situacao,
}: {
  companyId: string;
  situacao: string;
}) {
  let suppliers;
  try {
    suppliers = await getAttentionSuppliers(companyId, situacao);
  } catch (erro) {
    console.error(`[dashboard] fornecedores de "${situacao}":`, erro);
    return null;
  }

  const { names, partial, orderNumber } = suppliers;
  if (names.length === 0) return null;

  const visiveis = names.slice(0, NOMES_VISIVEIS);
  const resto = names.length - visiveis.length;
  const cauda =
    partial && resto === 0
      ? " e outros"
      : resto > 0
        ? ` e mais ${resto}${partial ? "+" : ""}`
        : "";

  return (
    <span className="text-fg-muted block truncate text-xs">
      {orderNumber !== null ? `Pedido #${orderNumber} · ` : null}
      {visiveis.join(", ")}
      {cauda}
    </span>
  );
}
