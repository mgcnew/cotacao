import { Check, Circle } from "lucide-react";
import Link from "next/link";

export type FirstStep = {
  label: string;
  hint: string;
  href: string;
  done: boolean;
};

/**
 * O que fazer primeiro, numa empresa que ainda não comprou nada.
 *
 * Sem isto, o Dashboard de quem acabou de entrar seria uma tela de zeros —
 * tecnicamente correta e inútil. Os passos estão na ordem em que o sistema os
 * exige: sem produto e fornecedor não há o que cotar, e sem cotação não há
 * compra a decidir.
 *
 * Some sozinho: a partir da primeira rodada, o lugar da tela é dos números.
 */
export function FirstSteps({ steps }: { steps: FirstStep[] }) {
  return (
    <div className="border-border bg-surface rounded-xl border p-5">
      <h2 className="text-fg text-sm font-semibold">Comece por aqui</h2>
      <p className="text-fg-muted mt-1 mb-4 text-sm">
        Ainda não há compras para acompanhar. Estes são os passos até a primeira
        cotação.
      </p>

      <ol className="flex flex-col gap-1">
        {steps.map((step, index) => (
          <li key={step.href}>
            <Link
              href={step.href}
              className="hover:bg-surface-sunken -mx-2 flex items-start gap-3 rounded-lg px-2 py-2 transition-colors"
            >
              <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                  step.done
                    ? "bg-success-soft text-success"
                    : "bg-surface-muted text-fg-subtle"
                }`}
                aria-hidden
              >
                {step.done ? (
                  <Check className="size-3" />
                ) : (
                  <Circle className="size-2 fill-current" />
                )}
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-sm font-medium ${
                    step.done ? "text-fg-muted line-through" : "text-fg"
                  }`}
                >
                  {index + 1}. {step.label}
                </span>
                <span className="text-fg-muted block text-xs">{step.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
