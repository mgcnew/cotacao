"use client";
import { useState } from "react";
import Link from "next/link";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Button } from "@/components/ui/button";
import { ResearchForm } from "@/components/price-research/research-form";
import { scheduledDates,shiftDate } from "@/features/price-research/model";
import { formatPurchaseWeekdays } from "@/features/suppliers/schedule-model";
import { ROUND_STATUS_LABEL } from "@/features/rounds/status";
const label=(date:string)=>new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",weekday:"short",day:"2-digit",month:"2-digit"}).format(new Date(`${date}T12:00:00Z`));
export function CollectionPreparation({routineId,startsOn,weekdays,today,dates,rounds,canPrepare,isActive}:{
  routineId:string;startsOn:string;weekdays:number[];today:string;dates:string[];
  rounds:{id:string;date:string;status:string}[];canPrepare:boolean;isActive:boolean;
}){
  const nextDates=scheduledDates(startsOn,weekdays,today,shiftDate(startsOn>today?startsOn:today,7));
  const [selectedDate,setSelectedDate]=useState(nextDates.find(date=>!rounds.some(r=>r.date===date))??nextDates[0]??startsOn);
  const selected=rounds.find(r=>r.date===selectedDate);
  const formId=`prepare-${routineId}`;
  const pending=dates.filter(date=>date<=today&&!rounds.some(r=>r.date===date));
  return <>
    <div className="bg-surface-sunken rounded-xl p-3 sm:p-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="research-collection-date" className="text-sm font-medium">Data da coleta</label>
          <DateTimePicker id="research-collection-date" name="date" form={formId} dateOnly required min={startsOn} allowedWeekdays={weekdays} defaultValue={selectedDate} onValueChange={setSelectedDate} className="h-11"/>
          <p className="text-fg-muted text-xs">{formatPurchaseWeekdays(weekdays)}. Os demais dias ficam indisponíveis no calendário.</p>
        </div>
        {selected?<Button asChild className="min-h-11 w-full sm:w-auto"><Link href={`/compras/${selected.id}`}>Abrir cotação</Link></Button>:canPrepare&&isActive?<ResearchForm id={formId} label="Preparar coleta" collection><input type="hidden" name="routineId" value={routineId}/></ResearchForm>:<p className="text-fg-muted text-sm">{isActive?"Seu papel não permite preparar coletas.":"Rotina pausada."}</p>}
      </div>
      <p className="text-fg mt-3 text-sm" role="status">{label(selectedDate)} · {selected?ROUND_STATUS_LABEL[selected.status]??selected.status:selectedDate<today?"Coleta pendente de preparação":selectedDate===today?"Coleta prevista para hoje":"Coleta ainda não preparada"}</p>
    </div>
    <details className="mt-3"><summary className="text-fg-muted min-h-11 cursor-pointer py-3 text-sm">Ver agenda e pendências{pending.length?` · ${pending.length} pendentes`:""}</summary>
      <ul className="divide-border divide-y">{dates.map(date=>{const round=rounds.find(r=>r.date===date);return <li key={date} className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm"><span>{label(date)}{date===today?" · Hoje":""}</span>{round?<Link className="text-primary inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline" href={`/compras/${round.id}`}>Abrir cotação</Link>:<span className={date<today?"text-warning":"text-fg-muted"}>{date<today?"Pendente":"Não preparada"}</span>}</li>;})}</ul>
    </details>
  </>;
}
