import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ResearchForm } from "@/components/price-research/research-form";
import { RoutineFields } from "@/components/price-research/routine-fields";
import { listResearchRoutines,researchToday } from "@/features/price-research/queries";
import { scheduledDates,shiftDate } from "@/features/price-research/model";
import { formatPurchaseWeekdays } from "@/features/suppliers/schedule-model";
import { getPermissions,requireActiveCompany } from "@/lib/auth/dal";
export default async function ResearchPage(){
  const company=await requireActiveCompany();const permissions=await getPermissions(company.companyId);
  if(!permissions.has("purchase_round.view"))redirect("/dashboard");
  const [data,today]=await Promise.all([listResearchRoutines(company.companyId),researchToday(company.companyId)]);
  return <div className="w-full space-y-5"><PageHeader title="Pesquisas de preços" description="Listas fixas, coletas independentes e evolução por produto." action={<Button asChild variant="outline"><Link href="/compras">Compras</Link></Button>}/>
    <div className="space-y-3">{data.routines.map(routine=>{
      const dates=scheduledDates(routine.starts_on,routine.weekdays,shiftDate(today,-30),today);
      const missing=dates.filter(date=>!data.rounds.some(round=>round.price_research_routine_id===routine.id&&round.price_research_date===date));
      return <section key={routine.id} className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><h2 className="text-fg font-semibold">{routine.name}</h2><p className="text-fg-muted text-sm">{formatPurchaseWeekdays(routine.weekdays)} · {routine.is_active?"Ativa":"Pausada"}</p>{routine.is_active&&missing.length>0?<p className="text-warning mt-1 text-sm">{missing.length} coletas ainda não preparadas nos últimos 30 dias.</p>:null}</div><Button asChild variant="outline"><Link href={`/pesquisas-precos/${routine.id}`}>Abrir rotina e evolução</Link></Button></section>;
    })}{!data.routines.length?<p className="text-fg-muted">Crie uma rotina e escolha os produtos e fornecedores que deseja acompanhar.</p>:null}</div>
    {permissions.has("purchase_round.update")?<section className="border-border bg-surface rounded-xl border p-4"><h2 className="mb-4 font-semibold">Nova rotina</h2><ResearchForm label="Criar rotina"><input type="hidden" name="op" value="create"/><RoutineFields startsOn={today}/></ResearchForm></section>:null}
  </div>;
}
