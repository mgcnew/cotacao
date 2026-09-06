import { publicEnv } from "@/lib/env";

/** URL pública de um ativo cujo caminho seguro está persistido na empresa. */
export function companyAssetUrl(path: string | null | undefined) {
  if (!path) return null;
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/company-assets/${encodedPath}`;
}
