import Link from "next/link";
import { getPermissions,requireActiveCompany } from "@/lib/auth/dal";
import { listResearchRoutines,researchToday } from "@/features/price-research/queries";
import { scheduledDates,shiftDate } from "@/features/price-research/model";
export async function ResearchAlerts(){
  const company=await requireActiveCompany();const permissions=await getPermissions(company.companyId);
  if(!permissions.has("purchase_round.view"))return null;
  const result=await Promise.all([listResearchRoutines(company.companyId),researchToday(company.companyId)]).catch(cause=>{
    console.error("[ResearchAlerts] Não foi possível carregar pesquisas",cause);
    return null;
  });
  if(!result)return null;
  const [data,today]=result;
  const alerts=data.routines.filter(r=>r.is_active).flatMap(r=>{
    const rounds=data.rounds.filter(c=>c.price_research_routine_id===r.id&&c.price_research_date!<=today);
    const missing=scheduledDates(r.starts_on,r.weekdays,shiftDate(today,-30),today).filter(date=>!rounds.some(c=>c.price_research_date===date)).length;
    const open=rounds.filter(c=>c.status!=="completed").length;
    return missing||open?[{id:r.id,name:r.name,missing,open}]:[];
  });
  if(!alerts.length)return null;
  return <section className="border-warning/30 bg-warning/5 mb-5 rounded-xl border p-4"><h2 className="font-semibold">Pesquisas de preços a acompanhar</h2><ul className="mt-2 space-y-2">{alerts.map(a=><li key={a.id} className="text-sm"><Link href={`/pesquisas-precos/${a.id}`} className="text-primary font-medium underline">{a.name}</Link> · {a.missing} coletas não preparadas nos últimos 30 dias · {a.open} cotações em aberto</li>)}</ul></section>;
}
