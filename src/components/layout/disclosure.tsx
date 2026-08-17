import { ChevronRight } from "lucide-react";

/**
 * Uma seção que começa fechada.
 *
 * `<details>`/`<summary>` de verdade, e não um `useState`: abre e fecha sem
 * JavaScript, já vem com o papel de botão, com `aria-expanded` administrado
 * pelo navegador e com a busca da página (Ctrl+F) capaz de abrir o conteúdo
 * escondido. Um acordeão feito à mão custa código para chegar a menos que isso.
 *
 * Serve ao que é opcional de verdade — o recurso que a maioria não vai usar e
 * que, aberto o tempo todo, transforma a tela numa parede. O que é necessário
 * fica fora daqui: esconder o essencial atrás de um clique é o mesmo erro com
 * outro nome.
 */
export function Disclosure({
  titulo,
  resumo,
  aberto = false,
  children,
}: {
  titulo: string;
  /** Uma linha dizendo para que serve, visível com a seção fechada. */
  resumo?: string;
  aberto?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={aberto}
      className="border-border bg-surface group rounded-xl border"
    >
      <summary className="marker:content-none flex cursor-pointer list-none items-center gap-2 px-4 py-3">
        <ChevronRight
          className="text-fg-subtle size-4 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden
        />
        <span className="min-w-0">
          <span className="text-fg block text-sm font-medium">{titulo}</span>
          {resumo ? (
            <span className="text-fg-muted block text-xs">{resumo}</span>
          ) : null}
        </span>
      </summary>
      <div className="border-border border-t px-4 py-4">{children}</div>
    </details>
  );
}
