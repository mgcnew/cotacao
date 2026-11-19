import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
const require=createRequire(import.meta.url);
function load(path){const source=readFileSync(new URL(`../${path}`,import.meta.url),"utf8");const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});const mod={exports:{}};vm.runInNewContext(outputText,{module:mod,exports:mod.exports,require,Date,Map,Number});return mod.exports;}
const {scheduledDates,priceVariation,evolutionRows}=load("src/features/price-research/model.ts");
const {purchaseCycleStart}=load("src/features/suppliers/schedule-cycle.ts");
test("coletas de segunda e quinta são ocorrências distintas e respeitam o início",()=>{
  assert.equal(scheduledDates("2026-11-16",[1,4],"2026-11-15","2026-11-26").join(),"2026-11-16,2026-11-19,2026-11-23,2026-11-26");
  assert.equal(scheduledDates("2026-11-19",[1,4],"2026-11-15","2026-11-19").join(),"2026-11-19");
});
test("ciclo da quinta não inclui atividade de segunda e ciclo semanal preserva antecedência",()=>{
  const row={weekdays:[1,4],weekday:1,anchor_date:"2026-11-16",interval_weeks:1};
  assert.equal(purchaseCycleStart(row,"2026-11-19"),"2026-11-17");
  assert.equal(purchaseCycleStart(row,"2026-11-23"),"2026-11-20");
  assert.equal(purchaseCycleStart({...row,weekdays:[1]},"2026-11-23"),"2026-11-17");
  assert.equal(purchaseCycleStart({...row,weekdays:[1],interval_weeks:2},"2026-11-30"),"2026-11-17");
});
test("sem resposta não vira zero ou repetição do preço anterior",()=>{
  assert.equal(priceVariation(null,10),null);assert.equal(priceVariation(10,null),null);assert.equal(priceVariation(10,0),null);
  assert.ok(Math.abs(priceVariation(11,10)-0.1)<1e-10);
  const item={item_id:"item",product_id:"product",product_name:"Produto",unit_id:"kg",unit:"kg",best_price:10,offers:[]};
  const rows=evolutionRows([{id:"segunda",prices:[item]},{id:"quinta",prices:[{...item,best_price:null}]}]);
  assert.equal(rows[0][1].values.get("segunda"),10);assert.equal(rows[0][1].values.get("quinta"),null);
});
test("evolução separa bases diferentes e não soma preços de embalagens",()=>{
  const item={item_id:"item",product_id:"product",product_name:"Produto",unit_id:"kg",unit:"kg",best_price:10,offers:[]};
  const rows=evolutionRows([{id:"segunda",prices:[item,{...item,item_id:"other",best_price:9}]},{id:"quinta",prices:[{...item,unit_id:"un",unit:"un",best_price:4}]}]);
  assert.equal(rows.length,2);
  const kg=rows.find(([,row])=>row.unit==="kg")[1];assert.equal(kg.values.get("segunda"),9);assert.equal(kg.values.has("quinta"),false);
});

test("coleta não preparada mantém uma coluna vazia e interrompe a variação",()=>{
  const item={item_id:"item",product_id:"product",product_name:"Produto",unit_id:"kg",unit:"kg",best_price:10,offers:[]};
  const rows=evolutionRows([{id:"segunda",prices:[item]},{id:"quinta-nao-preparada",prices:[]}]);
  assert.equal(rows[0][1].values.has("quinta-nao-preparada"),false);
  assert.equal(priceVariation(rows[0][1].values.get("quinta-nao-preparada")??null,rows[0][1].values.get("segunda")),null);
});
