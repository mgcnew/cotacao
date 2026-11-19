import { Input } from "@/components/ui/input";
import { PURCHASE_WEEKDAYS } from "@/features/suppliers/schedule-model";
export function RoutineFields({name="",startsOn,weekdays=[1,4],isActive=true,edit=false}:{name?:string;startsOn:string;weekdays?:number[];isActive?:boolean;edit?:boolean}){
  return <>
    <label className="text-sm">Nome da pesquisa<Input name="name" required minLength={3} maxLength={120} defaultValue={name} placeholder="Ex.: acompanhamento de carnes" /></label>
    <label className="text-sm">Início<Input name="startsOn" type="date" required defaultValue={startsOn}/></label>
    <fieldset className="w-full"><legend className="mb-2 text-sm font-medium">Dias de coleta</legend><div className="flex flex-wrap gap-3">{PURCHASE_WEEKDAYS.map((day,index)=><label key={day} className="flex items-center gap-2 text-sm"><input type="checkbox" name="weekday" value={index} defaultChecked={weekdays.includes(index)}/>{day}</label>)}</div></fieldset>
    {edit?<label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={isActive}/>Rotina ativa</label>:null}
  </>;
}
