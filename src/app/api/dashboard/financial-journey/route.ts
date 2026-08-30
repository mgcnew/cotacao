import { getFinancialJourney } from "@/features/dashboard/financial";
import type { FinancialJourneyMetric } from "@/features/dashboard/financial-journey-types";
import { getActiveCompany, getUser } from "@/lib/auth/dal";

export const runtime = "nodejs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string | null): value is string {
  if (!value || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value)
  );
}

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const company = await getActiveCompany();
  if (!company || !company.permissions.includes("analytics.view")) {
    return Response.json({ error: "Acesso não permitido." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const metric = params.get("metric");
  const de = params.get("de");
  const ate = params.get("ate");
  if (
    (metric !== "realized" && metric !== "divergence") ||
    !validDate(de) ||
    !validDate(ate) ||
    de > ate
  ) {
    return Response.json(
      { error: "Período ou indicador inválido." },
      { status: 400 },
    );
  }

  const days =
    (Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) /
    86_400_000;
  if (days > 366) {
    return Response.json(
      { error: "O período máximo é de 366 dias." },
      { status: 400 },
    );
  }

  try {
    const journey = await getFinancialJourney(company.companyId, {
      de,
      ate,
      metric: metric as FinancialJourneyMetric,
    });
    return Response.json(journey, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "Não foi possível carregar a memória de cálculo." },
      { status: 500 },
    );
  }
}
