/** Cada dia configurado inicia uma ocorrência própria, inclusive na mesma semana. */
export function purchaseCycleStart(row: { weekdays?: number[]; weekday:number; anchor_date:string; interval_weeks:number }, occurrence:string):string {
  const date=(day:string)=>new Date(`${day}T12:00:00Z`);
  const anchor=date(row.anchor_date),end=date(occurrence);
  let previous:string|null=null;
  for(const weekday of row.weekdays?.length?row.weekdays:[row.weekday]){
    const first=new Date(anchor);
    first.setUTCDate(first.getUTCDate()+(weekday-anchor.getUTCDay()+7)%7);
    const elapsed=Math.floor((end.getTime()-first.getTime())/86400000);
    if(elapsed<=0)continue;
    const periods=Math.floor((elapsed-1)/(row.interval_weeks*7));
    if(periods<0)continue;
    const candidate=new Date(first);candidate.setUTCDate(candidate.getUTCDate()+periods*row.interval_weeks*7);
    const value=candidate.toISOString().slice(0,10);
    if(previous===null||value>previous)previous=value;
  }
  if(previous===null)return row.anchor_date;
  const start=date(previous);start.setUTCDate(start.getUTCDate()+1);
  return start.toISOString().slice(0,10);
}
