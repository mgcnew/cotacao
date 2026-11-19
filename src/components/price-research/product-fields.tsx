"use client";
import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
export function ResearchProductFields({options,routineId}:{options:SearchableOption[];routineId:string}){
  const quantity=useRef<HTMLInputElement>(null);
  return <>
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-64"><label htmlFor={`research-product-${routineId}`} className="text-sm font-medium">Produto</label><SearchableSelect className="[&_input[role=combobox]]:h-11" id={`research-product-${routineId}`} name="productId" required options={options} placeholder="Digite o nome do produto…" emptyMessage="Nenhum produto disponível encontrado." onOptionSelected={()=>quantity.current?.focus()}/></div>
    <div className="flex flex-col gap-1.5 sm:w-32"><label htmlFor={`research-quantity-${routineId}`} className="text-sm font-medium">Quantidade</label><Input ref={quantity} id={`research-quantity-${routineId}`} name="quantity" required defaultValue="1" inputMode="decimal" className="h-11"/></div>
  </>;
}
