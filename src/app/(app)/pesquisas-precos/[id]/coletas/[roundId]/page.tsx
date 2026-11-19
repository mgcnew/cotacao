import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { PrintReportButton } from "@/components/rounds/report-actions";
import { researchCollections } from "@/features/price-research/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPermissions,requireActiveCompany } from "@/lib/auth/dal";
import { formatUnitPrice } from "@/lib/money";
export default async function ResearchCollectionReport({params}:{params:Promise<{id:string;roundId:string}>}){
  const {id,roundId}=await params;if(!z.uuid().safeParse(id).success||!z.uuid().safeParse(roundId).success)notFound();
  const company=await requireActiveCompany();const permissions=await getPermissions(company.companyId);
  if(!permissions.has("purchase_round.view")||!permissions.has("quotation_response.view"))redirect("/dashboard");
  const client=await createServerSupabaseClient();
  const {data:round,error}=await client.from("purchase_rounds").select("price_research_date,title,status,completed_at,created_at").eq("company_id",company.companyId).eq("price_research_routine_id",id).eq("id",roundId).maybeSingle();
  if(error)throw new Error(error.message);if(!round?.price_research_date)notFound();
  const collections=await researchCollections(company.companyId,id,round.price_research_date,round.price_research_date);
  const collection=collections.find(c=>c.id===roundId);if(!collection)notFound();
  const dateTime=new Intl.DateTimeFormat("pt-BR",{timeZone:company.companyTimezone,dateStyle:"short",timeStyle:"short"});
  return <div className="w-full space-y-4"><div className="print:hidden"><PageHeader title="Relatório de pesquisa de preços" description={round.title} action={<><Button asChild variant="outline"><Link href={`/pesquisas-precos/${id}`}>Evolução</Link></Button><Button asChild variant="outline"><Link href={`/compras/${roundId}`}>Abrir cotação</Link></Button><PrintReportButton/></>}/></div>
    <header><p className="text-fg-muted text-sm">{company.companyName}</p><h1 className="text-xl font-semibold">{round.title}</h1><p className="text-fg-muted text-sm">Preparada em {dateTime.format(new Date(round.created_at))}{round.completed_at?` · Fechada em ${dateTime.format(new Date(round.completed_at))}`:""}</p><p className="text-fg-muted text-sm">{round.status==="completed"?"Coleta concluída. Preços congelados no fechamento.":"Prévia: os preços podem mudar até a conclusão da cotação."}</p></header>
    {collection.prices.map(item=><section key={item.item_id} className="border-border bg-surface break-inside-avoid rounded-xl border p-4"><h2 className="font-semibold">{item.product_name}</h2><p className="text-fg-muted mb-3 text-sm">Menor preço comparável: {item.best_price===null?"Sem cotação comparável":`R$ ${formatUnitPrice(item.best_price)} / ${item.unit??"base não definida"}`}</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-border border-b text-left"><th className="p-2">Fornecedor</th><th className="p-2">Oferta</th><th className="p-2">Preço na base comum</th><th className="p-2">Situação</th></tr></thead><tbody>{item.offers.map(offer=><tr key={offer.supplier_id} className="border-border border-b"><td className="p-2">{offer.supplier_name}</td><td className="p-2">{offer.availability==="priced"&&offer.price!==null?`R$ ${formatUnitPrice(offer.price)} / ${offer.pricing_unit}`:"—"}</td><td className="p-2">{offer.comparable_price===null?"Sem base":`R$ ${formatUnitPrice(offer.comparable_price)} / ${item.unit??"?"}`}</td><td className="p-2">{offer.availability==="priced"?offer.comparable_price===null?"Falta conversão":"Respondido":offer.availability==="does_not_supply"?"Não fornece":offer.availability==="unavailable"?"Sem estoque":"Não respondeu"}</td></tr>)}</tbody></table></div></section>)}
  </div>;
}
