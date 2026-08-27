import { Skeleton } from "@/components/ui/skeleton";

export default function WhatsAppLoading() {
  return (
    <div className="grid h-[calc(100dvh-6.5rem)] min-h-0 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[18rem_minmax(0,1fr)_17rem]">
      <Skeleton className="h-full" />
      <Skeleton className="h-full" />
      <Skeleton className="hidden h-full lg:block" />
    </div>
  );
}
