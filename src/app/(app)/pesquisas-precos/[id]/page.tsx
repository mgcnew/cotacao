import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { ThemedSelect } from "@/components/ui/themed-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CollectionPreparation } from "@/components/price-research/collection-preparation";
import { ResearchProductFields } from "@/components/price-research/product-fields";
import { Input } from "@/components/ui/input";
import { PrintReportButton } from "@/components/rounds/report-actions";
import { ResearchForm } from "@/components/price-research/research-form";
import { RoutineFields } from "@/components/price-research/routine-fields";
import { getResearchRoutine,researchToday,researchCollections,listResearchRoutines } from "@/features/price-research/queries";
import { scheduledDates,shiftDate,evolutionRows,priceVariation } from "@/features/price-research/model";
import { formatPurchaseWeekdays } from "@/features/suppliers/schedule-model";
import { getPermissions,requireActiveCompany } from "@/lib/auth/dal";
import { formatUnitPrice } from "@/lib/money";
const dateLabel=(day:string)=>new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC"}).format(new Date(`${day}T12:00:00Z`));
const percent=new Intl.NumberFormat("pt-BR",{style:"percent",maximumFractionDigits:1,signDisplay:"exceptZero"});
export default async function ResearchDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();
  const company=await requireActiveCompany();const permissions=await getPermissions(company.companyId);
  if(!permissions.has("purchase_round.view"))redirect("/dashboard");
  const [data,today,all,query]=await Promise.all([getResearchRoutine(company.companyId,id),researchToday(company.companyId),listResearchRoutines(company.companyId),searchParams]);
  if(!data.routine)notFound();const routine=data.routine;
  const manage=permissions.has("purchase_round.update");const canReadPrices=permissions.has("quotation_response.view");
  const from=z.iso.date().safeParse(query.de).success?String(query.de):shiftDate(today,-30);
  const to=z.iso.date().safeParse(query.ate).success?String(query.ate):today;
  const validPeriod=from<=to&&to<=shiftDate(from,92);
  const collections=canReadPrices&&validPeriod?await researchCollections(company.companyId,id,from,to):[];
  const dates=scheduledDates(routine.starts_on,routine.weekdays,shiftDate(today,-30),shiftDate(today,7));
  const selectedSupplier=z.uuid().safeParse(query.fornecedor).success?String(query.fornecedor):null;
  const historicalSuppliers=new Map(collections.flatMap(c=>c.prices.flatMap(item=>item.offers.map(o=>[o.supplier_id,o.supplier_name] as const))));
  const timelineDates=validPeriod?[...new Set([...scheduledDates(routine.starts_on,routine.weekdays,from,to),...collections.map(c=>c.price_research_date!)])].sort():[];
  const timeline=timelineDates.map(date=>collections.find(c=>c.price_research_date===date)??{id:`missing-${date}`,status:"missing",price_research_date:date,prices:[]});
  const rows=evolutionRows(selectedSupplier?timeline.map(c=>({...c,prices:c.prices.map(item=>({...item,best_price:item.offers.find(o=>o.supplier_id===selectedSupplier)?.comparable_price??null}))})):timeline);
  return <div className="w-full space-y-5"><div className="print:hidden"><PageHeader title={routine.name} description={`${formatPurchaseWeekdays(routine.weekdays)} · ${routine.is_active?"Ativa":"Pausada"}`} action={<><Button asChild variant="outline"><Link href="/pesquisas-precos">Rotinas</Link></Button><PrintReportButton/></>}/></div>
    <header className="hidden print:block"><p>{company.companyName}</p><h1 className="text-2xl font-semibold">{routine.name} · Evolução de preços</h1><p>{dateLabel(from)} a {dateLabel(to)} · {selectedSupplier?historicalSuppliers.get(selectedSupplier)??"Fornecedor selecionado":"Menor preço de cada coleta"}</p></header>
    <section className="border-border bg-surface rounded-xl border p-4 print:hidden"><h2 className="mb-2 font-semibold">Coletas previstas</h2><p className="text-fg-muted mb-3 text-sm">Uma cotação por data, com os produtos e fornecedores da rotina. Revise e envie pela cotação. A criação e o envio dependem da sua ação.</p><CollectionPreparation routineId={id} startsOn={routine.starts_on} weekdays={routine.weekdays} today={today} dates={dates} rounds={all.rounds.filter(r=>r.price_research_routine_id===id).map(r=>({id:r.id,date:r.price_research_date!,status:r.status}))} canPrepare={manage&&permissions.has("purchase_round.create")} isActive={routine.is_active}/></section>
    <section className="border-border bg-surface rounded-xl border p-4"><h2 className="font-semibold">Evolução por produto</h2><p className="text-fg-muted mt-1 text-sm">{selectedSupplier?"Preço do fornecedor selecionado em cada coleta, sem somar valores.":"Menor preço comparável de cada coleta, sem somar valores."} Colunas organizadas pela data prevista; os horários reais de preparação e fechamento constam no relatório individual. Sem cotação não significa preço zero. Mudanças de unidade aparecem em linhas separadas.</p>
      <form className="my-4 grid gap-3 print:hidden sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto] lg:items-end">
        <div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="research-from" className="text-sm">De</label><DateTimePicker key={from} id="research-from" name="de" dateOnly required defaultValue={from} className="h-11"/></div>
        <div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="research-to" className="text-sm">Até</label><DateTimePicker key={to} id="research-to" name="ate" dateOnly required defaultValue={to} className="h-11"/></div>
        <div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="research-reference" className="text-sm">Referência</label><ThemedSelect key={selectedSupplier??"all"} id="research-reference" name="fornecedor" defaultValue={selectedSupplier??""} emptyOptionLabel="Menor preço de cada coleta" options={[...historicalSuppliers].map(([value,label])=>({value,label}))} className="h-11"/></div>
        <Button type="submit" variant="outline" className="min-h-11 w-full lg:w-auto">Filtrar período</Button>
      </form>
      {!validPeriod?<p role="alert" className="text-destructive">Escolha um período de até 92 dias com início anterior ao fim.</p>:!canReadPrices?<p>Seu papel não permite visualizar preços.</p>:!collections.length?<p className="text-fg-muted">Nenhuma coleta preparada neste período.</p>:<>
      <div className="hidden overflow-x-auto sm:block print:block print:overflow-visible"><table className="w-full text-sm"><thead><tr className="border-border border-b text-left"><th className="p-2">Produto / unidade</th>{timeline.map(c=><th key={c.id} className="p-2 whitespace-nowrap">{dateLabel(c.price_research_date!)}<span className="text-fg-muted block text-xs">{c.status==="completed"?"Concluída · congelada":c.status==="missing"?"Não preparada":"Prévia"}</span></th>)}<th className="p-2">Variação entre as duas últimas coletas</th></tr></thead><tbody>{rows.map(([key,row])=>{
        const latest=timeline.at(-1),previous=timeline.at(-2);
        const variation=priceVariation(latest?row.values.get(latest.id)??null:null,previous?row.values.get(previous.id)??null:null);
        return <tr key={key} className="border-border border-b"><th className="p-2 text-left font-medium">{row.productName} / {row.unit??"Base não definida"}</th>{timeline.map(c=><td key={c.id} className="p-2 tabular-nums whitespace-nowrap">{row.values.get(c.id)!==undefined&&row.values.get(c.id)!==null?`R$ ${formatUnitPrice(row.values.get(c.id)!)}`:"Sem cotação comparável"}</td>)}<td className="p-2 tabular-nums">{variation===null?"Sem base para variação":percent.format(variation)}</td></tr>;
      })}</tbody></table></div>
      <div className="divide-border divide-y sm:hidden print:hidden">{rows.map(([key,row])=>{
        const latest=timeline.at(-1),previous=timeline.at(-2);
        const value=latest?row.values.get(latest.id)??null:null;
        const variation=priceVariation(value,previous?row.values.get(previous.id)??null:null);
        return <article key={key} className="py-4"><h3 className="text-sm font-semibold wrap-anywhere">{row.productName} / {row.unit??"Base não definida"}</h3><div className="mt-2 flex flex-wrap items-baseline justify-between gap-2"><p className="text-lg font-semibold tabular-nums">{value===null?"Sem cotação comparável":`R$ ${formatUnitPrice(value)}`}</p><p className="text-fg-muted text-sm tabular-nums">{variation===null?"Sem base para variação":percent.format(variation)}</p></div><p className="text-fg-muted mt-1 text-xs">Última data prevista: {latest?dateLabel(latest.price_research_date!):"—"}</p><details className="mt-2"><summary className="text-primary min-h-11 cursor-pointer py-3 text-sm font-medium">Ver evolução por data</summary><dl className="space-y-3">{timeline.map(c=><div key={c.id} className="flex justify-between gap-3 text-sm"><dt>{dateLabel(c.price_research_date!)}<span className="text-fg-muted block text-xs">{c.status==="completed"?"Concluída":c.status==="missing"?"Não preparada":"Prévia"}</span></dt><dd className="text-right tabular-nums">{row.values.get(c.id)!==null&&row.values.get(c.id)!==undefined?`R$ ${formatUnitPrice(row.values.get(c.id)!)}`:"Sem cotação comparável"}</dd></div>)}</dl></details></article>;
      })}</div>
      <ul className="mt-4 space-y-2 print:hidden">{collections.map(c=><li key={c.id}><Link className="text-primary underline" href={`/pesquisas-precos/${id}/coletas/${c.id}`}>Relatório da coleta de {dateLabel(c.price_research_date!)}</Link></li>)}</ul></>}
    </section>
    <section className="border-border bg-surface rounded-xl border p-4 print:hidden"><h2 className="mb-3 font-semibold">Produtos fixos</h2><ul className="space-y-3">{data.items.map(item=><li key={item.id} className="border-border flex min-w-0 flex-col gap-3 border-b pb-4 last:border-0 last:pb-0 sm:flex-row sm:flex-wrap sm:items-end"><span className="min-w-0 flex-1 text-sm font-medium wrap-anywhere">{data.products.find(p=>p.id===item.product_id)?.name??"Produto"}<span className="text-fg-muted ml-2 text-xs font-normal">{data.products.find(p=>p.id===item.product_id)?.purchase_unit?.symbol}</span></span>{manage?<><ResearchForm label="Atualizar quantidade"><input type="hidden" name="op" value="addItem"/><input type="hidden" name="routineId" value={id}/><input type="hidden" name="productId" value={item.product_id}/><label className="text-sm">Quantidade de referência<Input name="quantity" inputMode="decimal" required defaultValue={item.quantity} className="h-11 w-full sm:w-28"/></label></ResearchForm><ResearchForm label="Remover"><input type="hidden" name="op" value="removeItem"/><input type="hidden" name="routineId" value={id}/><input type="hidden" name="itemId" value={item.id}/></ResearchForm></>:<span>{item.quantity}</span>}</li>)}</ul>
      {manage?<div className="mt-4"><ResearchForm label="Adicionar produto" resetAfterSave><input type="hidden" name="op" value="addItem"/><input type="hidden" name="routineId" value={id}/><ResearchProductFields routineId={id} options={data.products.filter(p=>p.is_active&&!data.items.some(i=>i.product_id===p.id)).map(p=>({id:p.id,name:p.name,description:p.purchase_unit?.symbol??""}))}/></ResearchForm></div>:null}
    </section>
    <section className="border-border bg-surface rounded-xl border p-4 print:hidden"><h2 className="mb-3 font-semibold">Fornecedores consultados</h2><ul className="space-y-2">{data.suppliers.map(s=><li key={s.supplier_id} className="border-border flex flex-col gap-2 border-b pb-3 last:border-0 sm:flex-row sm:items-center sm:gap-3"><span className="flex-1 text-sm">{data.supplierOptions.find(option=>option.id===s.supplier_id)?.name??"Fornecedor"}</span>{manage?<ResearchForm label="Remover"><input type="hidden" name="op" value="removeSupplier"/><input type="hidden" name="routineId" value={id}/><input type="hidden" name="supplierId" value={s.supplier_id}/></ResearchForm>:null}</li>)}</ul>{manage?<div className="mt-4"><ResearchForm label="Adicionar fornecedor" resetAfterSave><input type="hidden" name="op" value="addSupplier"/><input type="hidden" name="routineId" value={id}/><div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-64"><label htmlFor={`research-supplier-${id}`} className="text-sm font-medium">Fornecedor</label><SearchableSelect className="[&_input[role=combobox]]:h-11" id={`research-supplier-${id}`} name="supplierId" required placeholder="Digite o nome do fornecedor…" emptyMessage="Nenhum fornecedor disponível encontrado." options={data.supplierOptions.filter(s=>s.status==="active"&&!data.suppliers.some(existing=>existing.supplier_id===s.id)).map(s=>({id:s.id,name:s.name}))}/></div></ResearchForm></div>:null}</section>
    {manage?<details className="border-border bg-surface rounded-xl border p-4 print:hidden"><summary className="cursor-pointer font-semibold">Editar rotina ou pausar</summary><div className="mt-4"><ResearchForm label="Salvar rotina"><input type="hidden" name="op" value="edit"/><input type="hidden" name="routineId" value={id}/><RoutineFields edit name={routine.name} startsOn={routine.starts_on} weekdays={routine.weekdays} isActive={routine.is_active}/></ResearchForm></div><p className="text-fg-muted mt-3 text-sm">Alterações na lista, nos dias e nos fornecedores valem para novas coletas. As cotações já preparadas mantêm sua configuração.</p></details>:null}
  </div>;
}
