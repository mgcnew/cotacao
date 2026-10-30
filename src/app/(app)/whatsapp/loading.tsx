import { Skeleton } from "@/components/ui/skeleton";

/** Mesma moldura da caixa: lista, conversa e detalhes nos lugares em que vão aparecer. */
export default function WhatsAppLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Carregando as conversas"
      className="border-border bg-surface grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl border lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)_19rem]"
    >
      <div className="border-border space-y-3 p-3 lg:border-r">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-9 w-full" />
        <div className="flex gap-1">
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 pt-2">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden lg:block" />
      <div className="border-border hidden border-l xl:block" />
    </div>
  );
}
