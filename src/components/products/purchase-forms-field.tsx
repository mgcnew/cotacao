"use client";

import { Plus, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";

type Unit = { id: string; label: string; symbol: string };
type Linha = {
  chave: number;
  unitId: string;
  unitQuantity: string;
  baseQuantity: string;
};

const numero = (texto: string) => {
  const valor = Number(texto.trim().replace(/\./g, "").replace(",", "."));
  return texto.trim() && Number.isFinite(valor) && valor > 0 ? valor : null;
};

const QTD = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

/**
 * Outras formas de comprar o produto: "1 cx = 12 un", "1 dp = 6 un".
 *
 * A equivalência é sempre escrita contra a unidade-base — a de comparação, ou a
 * de precificação sem ela —, a mesma régua em que a rodada normaliza o preço.
 * A unidade de compra fica de fora da escolha: ela já é a forma padrão.
 *
 * O conjunto vai inteiro num campo oculto e a action o grava de uma vez; o que
 * sumir daqui sai do banco.
 */
export function PurchaseFormsField({
  initial,
  units,
  baseUnitId,
  savedBaseUnitId,
  purchaseUnitId,
}: {
  initial: { unitId: string; unitQuantity: string; baseQuantity: string }[];
  units: Unit[];
  baseUnitId: string;
  savedBaseUnitId: string;
  purchaseUnitId: string;
}) {
  const proxima = React.useRef(initial.length);
  const [linhas, setLinhas] = React.useState<Linha[]>(() =>
    initial.map((forma, chave) => ({ chave, ...forma })),
  );

  const base = units.find((unit) => unit.id === baseUnitId);
  const simbolo = (id: string) =>
    units.find((unit) => unit.id === id)?.symbol ?? "";

  const atualizar = (chave: number, campo: Partial<Linha>) =>
    setLinhas((atuais) =>
      atuais.map((linha) =>
        linha.chave === chave ? { ...linha, ...campo } : linha,
      ),
    );

  const adicionar = () =>
    setLinhas((atuais) => [
      ...atuais,
      {
        chave: proxima.current++,
        unitId: "",
        unitQuantity: "1",
        baseQuantity: "",
      },
    ]);

  const baseMudou = baseUnitId !== savedBaseUnitId && linhas.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <input
        type="hidden"
        name="purchaseForms"
        value={JSON.stringify(
          linhas.map(({ unitId, unitQuantity, baseQuantity }) => ({
            unitId,
            unitQuantity,
            baseQuantity,
          })),
        )}
      />

      {baseMudou ? (
        <p
          role="status"
          className="border-warning/30 bg-warning-soft text-warning rounded-lg border px-3 py-2.5 text-sm"
        >
          A unidade-base mudou. As formas abaixo foram escritas na anterior;
          remova-as para salvar a troca, e cadastre de novo depois.
        </p>
      ) : null}

      {linhas.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {linhas.map((linha) => {
            const usadas = new Set(
              linhas
                .filter((outra) => outra.chave !== linha.chave)
                .map((outra) => outra.unitId),
            );
            const opcoes = units
              .filter(
                (unit) =>
                  unit.id !== baseUnitId &&
                  unit.id !== purchaseUnitId &&
                  (!usadas.has(unit.id) || unit.id === linha.unitId),
              )
              .map((unit) => ({ value: unit.id, label: unit.label }));

            const porBase =
              numero(linha.baseQuantity) !== null
                ? numero(linha.baseQuantity)! /
                  (numero(linha.unitQuantity) ?? 1)
                : null;
            const forma = simbolo(linha.unitId);

            return (
              <li
                key={linha.chave}
                className="border-border flex flex-col gap-2 rounded-lg border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <Input
                      aria-label="Quantidade desta forma"
                      inputMode="decimal"
                      value={linha.unitQuantity}
                      onChange={(event) =>
                        atualizar(linha.chave, {
                          unitQuantity: event.target.value,
                        })
                      }
                      className="w-16 shrink-0 text-right tabular-nums"
                    />
                    <ThemedSelect
                      id={`forma-${linha.chave}`}
                      ariaLabel="Unidade desta forma"
                      value={linha.unitId}
                      onValueChange={(unitId) =>
                        atualizar(linha.chave, { unitId })
                      }
                      placeholder="Unidade"
                      options={opcoes}
                      className="min-w-0 flex-1 sm:w-44 sm:flex-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-fg-muted text-sm" aria-hidden>
                      =
                    </span>
                    <Input
                      aria-label={`Quanto contém, em ${base?.symbol ?? "unidade-base"}`}
                      inputMode="decimal"
                      placeholder="Ex.: 12"
                      value={linha.baseQuantity}
                      onChange={(event) =>
                        atualizar(linha.chave, {
                          baseQuantity: event.target.value,
                        })
                      }
                      className="w-24 shrink-0 text-right tabular-nums"
                    />
                    <span className="text-fg text-sm">{base?.symbol}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto"
                    aria-label="Remover esta forma"
                    onClick={() =>
                      setLinhas((atuais) =>
                        atuais.filter((outra) => outra.chave !== linha.chave),
                      )
                    }
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
                {forma && porBase !== null && base ? (
                  <p className="text-fg-subtle text-xs">
                    1 {forma} = {QTD.format(porBase)} {base.symbol}. Na
                    comparação, o preço desta forma é dividido por{" "}
                    {QTD.format(porBase)}.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div>
        <Button type="button" variant="outline" size="sm" onClick={adicionar}>
          <Plus aria-hidden />
          Adicionar forma
        </Button>
      </div>
    </div>
  );
}
