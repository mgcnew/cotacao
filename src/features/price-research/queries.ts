import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ResearchPrice } from "@/features/price-research/model";

export async function researchToday(companyId: string) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("companies").select("timezone").eq("id",companyId).single();
  if (error) throw new Error(error.message);
  return new Intl.DateTimeFormat("en-CA",{timeZone:data.timezone}).format(new Date());
}
export async function listResearchRoutines(companyId: string) {
  const client = await createServerSupabaseClient();
  const [routines, rounds] = await Promise.all([
    client.from("price_research_routines").select("*").eq("company_id",companyId).order("name"),
    client.from("purchase_rounds").select("id,price_research_routine_id,price_research_date,status").eq("company_id",companyId).not("price_research_routine_id","is",null).neq("status","cancelled"),
  ]);
  if (routines.error) throw new Error(routines.error.message);
  if (rounds.error) throw new Error(rounds.error.message);
  return { routines:routines.data, rounds:rounds.data };
}
export async function getResearchRoutine(companyId: string, id: string) {
  const client = await createServerSupabaseClient();
  const results = await Promise.all([
    client.from("price_research_routines").select("*").eq("company_id",companyId).eq("id",id).maybeSingle(),
    client.from("price_research_items").select("*").eq("company_id",companyId).eq("routine_id",id),
    client.from("price_research_suppliers").select("*").eq("company_id",companyId).eq("routine_id",id),
    client.from("products").select("id,name,is_active,purchase_unit:units!products_company_id_purchase_unit_id_fkey(symbol)").eq("company_id",companyId).order("name"),
    client.from("suppliers").select("id,name,status").eq("company_id",companyId).order("name"),
  ]);
  for (const result of results) if(result.error) throw new Error(result.error.message);
  return { routine:results[0].data, items:results[1].data ?? [], suppliers:results[2].data ?? [], products:results[3].data ?? [], supplierOptions:results[4].data ?? [] };
}
export async function researchCollections(companyId:string,routineId:string,from:string,to:string) {
  const client=await createServerSupabaseClient();
  const {data,error}=await client.from("purchase_rounds").select("id,title,status,price_research_date,completed_at,created_at,started_at")
    .eq("company_id",companyId).eq("price_research_routine_id",routineId).neq("status","cancelled")
    .gte("price_research_date",from).lte("price_research_date",to).order("price_research_date");
  if(error) throw new Error(error.message);
  const collections=[];
  for(let offset=0;offset<(data?.length??0);offset+=5) {
    collections.push(...await Promise.all(data!.slice(offset,offset+5).map(async round=>{
      const result=await client.rpc("rpc_get_price_research_prices",{p_company_id:companyId,p_round_id:round.id});
      if(result.error) throw new Error(result.error.message);
      return {...round,prices:result.data as unknown as ResearchPrice[]};
    })));
  }
  return collections;
}
