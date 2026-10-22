import {
  CardSkeleton,
  SectionTitleSkeleton,
} from "@/components/layout/page-skeleton";

/** Esqueleto do miolo do fornecedor. Cabeçalho e abas vêm do `layout.tsx`. */
export default function Loading() {
  return (
    <>
      <div className="mb-6">
        <CardSkeleton lines={4} />
      </div>
      <section>
        <SectionTitleSkeleton lines={2} />
        <CardSkeleton lines={3} />
      </section>
    </>
  );
}
