import {
  EsqueletoDaFerramenta,
  TableSkeleton,
} from "@/components/rounds/round-view-skeletons";

/**
 * Esqueleto da comparação. Reserva o espaço da alternância "Comparar | Decidir", que
 * vive no corpo e antes entrava depois, empurrando tudo para baixo.
 */
export default function Loading() {
  return (
    <>
      <EsqueletoDaFerramenta />
      <TableSkeleton rows={8} columns={6} />
    </>
  );
}
