import { notFound, redirect } from "next/navigation";

import { NfeDocumentView } from "@/app/(app)/recebimentos/historico/[id]/nota/page";
import { getReceiptNfeDocumentView } from "@/features/receipts/historical-queries";
import { getPermissions, requireActiveCompany } from "@/lib/auth/dal";

export default async function ReceiptNfeDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, company] = await Promise.all([params, requireActiveCompany()]);
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("receipt.view")) redirect("/dashboard");

  const result = await getReceiptNfeDocumentView(company.companyId, id);
  if (!result) notFound();

  return (
    <NfeDocumentView
      data={result.data}
      backHref={`/recebimentos/${result.receiptId}`}
    />
  );
}
