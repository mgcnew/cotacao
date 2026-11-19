import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { PURCHASE_WEEKDAYS } from "@/features/suppliers/schedule-model";
export function RoutineFields({name="",startsOn,weekdays=[1,4],isActive=true,edit=false}:{name?:string;startsOn:string;weekdays?:number[];isActive?:boolean;edit?:boolean}){
  return <>
    <label className="min-w-0 text-sm sm:min-w-64 sm:flex-1">Nome da pesquisa<Input className="h-11" name="name" required minLength={3} maxLength={120} defaultValue={name} placeholder="Ex.: acompanhamento de carnes" /></label>
    <div className="flex flex-col gap-1.5 sm:min-w-48"><label htmlFor={edit?"research-start-edit":"research-start-new"} className="text-sm">Início</label><DateTimePicker id={edit?"research-start-edit":"research-start-new"} name="startsOn" dateOnly required defaultValue={startsOn} className="h-11"/></div>
    <fieldset className="w-full"><legend className="mb-2 text-sm font-medium">Dias de coleta</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{PURCHASE_WEEKDAYS.map((day,index)=><label key={day} className="border-border has-checked:border-primary has-checked:bg-primary-soft flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm"><input className="accent-primary size-4 shrink-0" type="checkbox" name="weekday" value={index} defaultChecked={weekdays.includes(index)}/>{day}</label>)}</div></fieldset>
    {edit?<label className="flex min-h-11 items-center gap-2 text-sm"><input className="accent-primary size-4" type="checkbox" name="isActive" defaultChecked={isActive}/>Rotina ativa</label>:null}
  </>;
}
