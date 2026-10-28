import { AlertTriangle, PackageX } from "lucide-react";

import { ConvidarSugeridos } from "@/components/rounds/invite-suggested";
import {
  sugerirFornecedores,
  type FornecedorCandidato,
  type ItemParaSugerir,
  type SugestaoDeFornecedor,
} from "@/features/rounds/supplier-suggestions";
import { requireActiveCompany } from "@/lib/auth/dal";

/** Quantas sugestões ficam à vista; o resto abre sob demanda. */
const VISIVEIS = 6;
/** Quantos nomes de produto sem fornecedor cabem na frase antes do "e mais N". */
const NOMES_NO_AVISO = 4;

function Linha({
  roundId,
  sugestao,
  total,
  nomesDeGrupo,
  temConvidados,
}: {
  roundId: string;
  sugestao: SugestaoDeFornecedor;
  total: number;
  /** Só quando a rodada tem mais de um grupo: com um só, "grupos" não informa. */
  nomesDeGrupo: string[] | null;
  temConvidados: boolean;
}) {
  const percentual = Math.round((sugestao.cobre / total) * 100);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-fg text-sm font-medium">{sugestao.name}</span>
          {sugestao.aviso ? (
            <span
              title={sugestao.aviso}
              className="bg-warning-soft text-fg inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
            >
              <AlertTriangle className="text-warning size-3" aria-hidden />
              Aviso em aberto
            </span>
          ) : null}
        </div>
        <p className="text-fg-muted mt-0.5 text-xs">
          Já vendeu {sugestao.cobre} de {total}{" "}
          {total === 1 ? "produto" : "produtos"}
          {temConvidados && sugestao.cobreOQueFalta > 0
            ? ` · ${sugestao.cobreOQueFalta} sem cobertura até agora`
            : ""}
        </p>
        <div
          aria-hidden
          className="bg-surface-muted mt-1.5 h-1 w-32 max-w-full overflow-hidden rounded-full"
        >
          <div
            className="bg-primary h-full rounded-full"
            style={{ width: `${percentual}%` }}
          />
        </div>
        {nomesDeGrupo && nomesDeGrupo.length > 0 ? (
          <p className="text-fg-subtle mt-1 text-xs">
            Grupos: {nomesDeGrupo.join(", ")}
          </p>
        ) : null}
      </div>
      <ConvidarSugeridos
        roundId={roundId}
        supplierIds={[sugestao.supplierId]}
        rotulo="Convidar"
        rotuloAcessivel={`Convidar ${sugestao.name}`}
        variante="outline"
      />
    </li>
  );
}

/**
 * "Sugeridos para esta cotação": quem já vendeu o que a rodada pede, e os
 * produtos que ninguém conhecido vende.
 *
 * Serve à montagem, quando a lista de itens já existe e a de fornecedores ainda
 * não. Chega depois da tela, por `Suspense`: ler os vínculos custa uma ida ao
 * banco e não pode segurar o resto da montagem.
 */
export async function SugestoesDeFornecedores({
  roundId,
  items,
  disponiveis,
  convidados,
  nomesDeGrupo,
}: {
  roundId: string;
  items: ItemParaSugerir[];
  disponiveis: FornecedorCandidato[];
  convidados: string[];
  /** Id do grupo → nome. Só é mostrado quando há mais de um grupo. */
  nomesDeGrupo: Map<string, string> | null;
}) {
  const company = await requireActiveCompany();
  const { totalDeProdutos, sugestoes, semFornecedor } =
    await sugerirFornecedores({
      companyId: company.companyId,
      items,
      candidatos: disponiveis,
      convidados: new Set(convidados),
    });

  if (sugestoes.length === 0 && semFornecedor.length === 0) return null;

  const aVista = sugestoes.slice(0, VISIVEIS);
  const resto = sugestoes.slice(VISIVEIS);
  const temConvidados = convidados.length > 0;
  const gruposDe = (s: SugestaoDeFornecedor) =>
    nomesDeGrupo
      ? s.groupIds
          .map((id) => nomesDeGrupo.get(id))
          .filter((nome): nome is string => Boolean(nome))
      : null;
  const linha = (s: SugestaoDeFornecedor) => (
    <Linha
      key={s.supplierId}
      roundId={roundId}
      sugestao={s}
      total={totalDeProdutos}
      nomesDeGrupo={gruposDe(s)}
      temConvidados={temConvidados}
    />
  );

  return (
    <section
      aria-label="Fornecedores sugeridos"
      className="border-border bg-surface mb-4 overflow-hidden rounded-xl border"
    >
      {sugestoes.length > 0 ? (
        <>
          <header className="border-border flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
            <div>
              <h3 className="text-fg text-sm font-semibold">
                Sugeridos para esta cotação
              </h3>
              <p className="text-fg-muted text-xs">
                Quem já vendeu, ou já cotou, o que você está pedindo. O convite
                já marca os grupos de cada um.
              </p>
            </div>
            {aVista.length > 1 ? (
              <ConvidarSugeridos
                roundId={roundId}
                supplierIds={aVista.map((s) => s.supplierId)}
                rotulo={
                  sugestoes.length > VISIVEIS
                    ? `Convidar os ${aVista.length} primeiros`
                    : `Convidar os ${aVista.length}`
                }
              />
            ) : null}
          </header>
          <ul className="divide-border divide-y">{aVista.map(linha)}</ul>
          {resto.length > 0 ? (
            <details className="border-border group border-t">
              <summary className="text-fg-muted hover:text-fg cursor-pointer list-none px-4 py-2.5 text-xs font-medium marker:content-none">
                <span className="group-open:hidden">
                  Ver mais {resto.length}
                </span>
                <span className="hidden group-open:inline">Mostrar menos</span>
              </summary>
              <ul className="divide-border divide-y">{resto.map(linha)}</ul>
            </details>
          ) : null}
        </>
      ) : null}

      {semFornecedor.length > 0 ? (
        <div
          className={`bg-warning-soft flex items-start gap-2.5 px-4 py-3 ${sugestoes.length > 0 ? "border-border border-t" : ""}`}
        >
          <PackageX
            className="text-warning mt-0.5 size-4 shrink-0"
            aria-hidden
          />
          <p className="text-fg text-xs">
            <span className="font-semibold">
              {semFornecedor.length}{" "}
              {semFornecedor.length === 1
                ? "produto sem fornecedor conhecido"
                : "produtos sem fornecedor conhecido"}
              :
            </span>{" "}
            {semFornecedor.slice(0, NOMES_NO_AVISO).join(", ")}
            {semFornecedor.length > NOMES_NO_AVISO
              ? ` e mais ${semFornecedor.length - NOMES_NO_AVISO}`
              : ""}
            . Convide alguém novo pela busca abaixo ou tire da cotação.
          </p>
        </div>
      ) : null}
    </section>
  );
}
