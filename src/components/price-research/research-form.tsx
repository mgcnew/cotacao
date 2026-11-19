"use client";
import { useActionState, type ReactNode } from "react";
import { saveResearch,createResearchCollection } from "@/features/price-research/actions";
import { Button } from "@/components/ui/button";
export function ResearchForm({children,label,collection=false}:{children:ReactNode;label:string;collection?:boolean}){
  const [state,action,pending]=useActionState(collection?createResearchCollection:saveResearch,{error:null});
  return <form action={action} className="flex flex-wrap items-end gap-3">{children}
    <Button type="submit" disabled={pending}>{pending?"Salvando…":label}</Button>
    {state.error?<p role="alert" className="text-destructive w-full text-sm">{state.error}</p>:state.saved?<p role="status" className="text-success text-sm">Salvo.</p>:null}
  </form>;
}
