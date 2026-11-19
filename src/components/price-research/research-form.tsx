"use client";
import { useActionState, type ReactNode } from "react";
import { saveResearch,createResearchCollection,type ResearchState } from "@/features/price-research/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
export function ResearchForm({children,label,collection=false,id,className,resetAfterSave=false}:{children:ReactNode;label:string;collection?:boolean;id?:string;className?:string;resetAfterSave?:boolean}){
  const [state,action,pending]=useActionState<ResearchState,FormData>(collection?createResearchCollection:saveResearch,{error:null});
  return <form id={id} action={action} className={cn("flex w-full min-w-0 flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end",className)}><fieldset key={resetAfterSave?state.savedAt:undefined} disabled={pending} className="contents">{children}</fieldset>
    <Button type="submit" disabled={pending} className="min-h-11 w-full sm:w-auto">{pending?collection?"Preparando…":"Salvando…":label}</Button>
    {state.error?<p role="alert" className="text-destructive w-full text-sm">{state.error}</p>:state.saved?<p role="status" className="text-success text-sm">Salvo.</p>:null}
  </form>;
}
