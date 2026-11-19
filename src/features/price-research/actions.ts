"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getPermissions,requireActiveCompany } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export type ResearchState={error:string|null;saved?:boolean;savedAt?:number};
export async function saveResearch(_previous:ResearchState,form:FormData):Promise<ResearchState>{
  const company=await requireActiveCompany();
  const permissions=await getPermissions(company.companyId);
  if(!permissions.has("purchase_round.update"))return {error:"Seu papel não permite configurar pesquisas."};
  const client=await createServerSupabaseClient();
  const op=String(form.get("op"));
  const routineId=String(form.get("routineId")??"");
  if(op!=="create"&&!z.uuid().safeParse(routineId).success)return {error:"Rotina inválida."};
  let createdId:string|null=null;
  try{
    if(op==="create"||op==="edit"){
      const values=z.object({name:z.string().trim().min(3).max(120),starts_on:z.iso.date(),weekdays:z.array(z.coerce.number().int().min(0).max(6)).min(1)})
        .parse({name:form.get("name"),starts_on:form.get("startsOn"),weekdays:form.getAll("weekday")});
      const payload={company_id:company.companyId,...values,weekdays:[...new Set(values.weekdays)],is_active:op==="create"||form.get("isActive")==="on"};
      const result=op==="create"?await client.from("price_research_routines").insert(payload).select("id").single():await client.from("price_research_routines").update(payload).eq("company_id",company.companyId).eq("id",routineId).select("id").single();
      if(result.error)throw result.error;
      if(op==="create")createdId=result.data.id;
    }else if(op==="addItem"){
      const productId=z.uuid().parse(form.get("productId"));
      const quantity=z.coerce.number().positive().finite().parse(String(form.get("quantity")).replace(",","."));
      const result=await client.from("price_research_items").upsert({company_id:company.companyId,routine_id:routineId,product_id:productId,quantity},{onConflict:"routine_id,product_id"});
      if(result.error)throw result.error;
    }else if(op==="removeItem"){
      const result=await client.from("price_research_items").delete().eq("company_id",company.companyId).eq("routine_id",routineId).eq("id",z.uuid().parse(form.get("itemId")));
      if(result.error)throw result.error;
    }else if(op==="addSupplier"||op==="removeSupplier"){
      const supplierId=z.uuid().parse(form.get("supplierId"));
      const result=op==="addSupplier"?await client.from("price_research_suppliers").upsert({company_id:company.companyId,routine_id:routineId,supplier_id:supplierId},{onConflict:"routine_id,supplier_id"}):await client.from("price_research_suppliers").delete().eq("company_id",company.companyId).eq("routine_id",routineId).eq("supplier_id",supplierId);
      if(result.error)throw result.error;
    }else return {error:"Ação inválida."};
  }catch(cause){
    return {error:cause instanceof z.ZodError?"Confira os campos obrigatórios, os dias e a quantidade.":"Não foi possível salvar. Confira sua permissão e os dados da rotina."};
  }
  revalidatePath("/pesquisas-precos");revalidatePath(`/pesquisas-precos/${routineId}`);revalidatePath("/dashboard");
  if(createdId)redirect(`/pesquisas-precos/${createdId}`);
  return {error:null,saved:true,savedAt:Date.now()};
}
export async function createResearchCollection(_previous:ResearchState,form:FormData):Promise<ResearchState>{
  const company=await requireActiveCompany();
  const permissions=await getPermissions(company.companyId);
  if(!permissions.has("purchase_round.create")||!permissions.has("purchase_round.update"))return {error:"Seu papel não permite preparar coletas."};
  const values=z.object({routineId:z.uuid(),date:z.iso.date()}).safeParse({routineId:form.get("routineId"),date:form.get("date")});
  if(!values.success)return {error:"Rotina ou data inválida."};
  const client=await createServerSupabaseClient();
  const {data,error}=await client.rpc("rpc_create_price_research_collection",{p_company_id:company.companyId,p_routine_id:values.data.routineId,p_date:values.data.date});
  if(error)return {error:error.message};
  revalidatePath("/pesquisas-precos");revalidatePath("/dashboard");revalidatePath("/compras");
  redirect(`/compras/${data}`);
}
