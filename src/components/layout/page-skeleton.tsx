import { cn } from "@/lib/utils";

/**
 * As peças da casca — o que a tela mostra enquanto os dados vêm.
 *
 * POR QUE ESQUELETO E NÃO GIRINHO
 *
 * O esqueleto ocupa o mesmo espaço do conteúdo que vai chegar. Assim a tela não
 * pula quando o dado entra: o título aparece onde já havia uma barra do tamanho
 * dele, a tabela cresce nas linhas que já estavam ali. Um spinner centralizado
 * não reserva espaço nenhum, e o salto seguinte é o que faz a navegação parecer
 * lenta mesmo quando não é.
 *
 * Por isso cada peça daqui copia as medidas da peça real — `h-10` do
 * `TableHead`, `p-4` e `rounded-xl` do `Metric`, o `mb-6` do `PageHeader`. Se
 * uma delas mudar de tamanho, a daqui precisa acompanhar.
 *
 * COMO É ANUNCIADO
 *
 * As barras são decoração e ficam `aria-hidden`: um leitor de tela não tem o
 * que ler numa caixa cinza. Quem carrega o recado é o `role="status"` de
 * `PageSkeleton`, que diz "Carregando" uma vez — em vez de trinta retângulos
 * anônimos.
 */

/** Uma barra pulsante. Toda peça daqui é composição desta. */
function Barra({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("bg-surface-muted animate-pulse rounded-md", className)}
    />
  );
}

/**
 * A moldura de qualquer tela em carregamento.
 *
 * `aria-busy` no contêiner e um texto só para leitor de tela: o anúncio sai uma
 * vez, e não a cada barra que aparece.
 */
export function PageSkeleton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn("mx-auto w-full max-w-6xl", className)}
    >
      <span className="sr-only">Carregando…</span>
      {children}
    </div>
  );
}

/** Copia o `PageHeader`: título, descrição e, se houver, o botão da direita. */
export function PageHeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <Barra className="h-6 w-48" />
        <Barra className="mt-2 h-4 w-full max-w-lg" />
      </div>
      {action ? <Barra className="h-8 w-32 shrink-0" /> : null}
    </div>
  );
}

/** A fileira de números. `count` é quantos cartões a tela real tem. */
export function MetricsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="border-border bg-surface flex flex-col gap-1 rounded-xl border p-4"
        >
          <Barra className="h-3 w-24" />
          <Barra className="h-6 w-16" />
          <Barra className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

/** A caixa de filtros, com os campos em grade. */
export function FilterBarSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="border-border bg-surface mb-6 flex flex-col gap-3 rounded-xl border p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Barra className="h-3 w-16" />
            <Barra className="h-8 w-full" />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Barra className="h-8 w-24" />
        <Barra className="h-8 w-20" />
      </div>
    </div>
  );
}

/**
 * A tabela.
 *
 * Sai como `<table>` de verdade, e não como um monte de divs: a largura das
 * colunas nasce do próprio algoritmo de tabela, então o cabeçalho real entra
 * depois sem reposicionar tudo.
 */
export function TableSkeleton({
  rows = 6,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="[&_tr]:border-b">
          <tr>
            {Array.from({ length: columns }, (_, i) => (
              <th key={i} className="h-10 px-2 text-left">
                <Barra className="h-3 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, linha) => (
            <tr key={linha} className="border-b">
              {Array.from({ length: columns }, (_, coluna) => (
                <td key={coluna} className="p-2">
                  {/* A primeira coluna é o nome — mais larga, como no real. */}
                  <Barra className={coluna === 0 ? "h-4 w-40" : "h-4 w-16"} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lista de cartões empilhados: pendências, atividades, fornecedores. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <li
          key={i}
          className="border-border bg-surface flex items-center gap-3 rounded-xl border px-4 py-3"
        >
          <Barra className="size-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Barra className="h-4 w-48" />
            <Barra className="mt-1.5 h-3 w-full max-w-xs" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Título de seção com a linha de explicação embaixo. */
export function SectionTitleSkeleton({ lines = 1 }: { lines?: number }) {
  return (
    <div className="mb-3">
      <Barra className="h-4 w-40" />
      {lines > 1 ? <Barra className="mt-2 h-3 w-full max-w-md" /> : null}
    </div>
  );
}

/** Formulário: pares de rótulo e campo, mais o botão de gravar. */
export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-4">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Barra className="h-3 w-24" />
          <Barra className="h-9 w-full" />
        </div>
      ))}
      <Barra className="h-9 w-32" />
    </div>
  );
}

/** Um painel qualquer: caixa com borda e algumas linhas dentro. */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="border-border bg-surface flex flex-col gap-2 rounded-xl border p-4">
      {Array.from({ length: lines }, (_, i) => (
        <Barra
          key={i}
          className={cn("h-4", i === 0 ? "w-40" : "w-full max-w-sm")}
        />
      ))}
    </div>
  );
}
