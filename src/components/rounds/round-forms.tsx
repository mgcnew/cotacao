"use client";

import { ListChecks, Play } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine } from "@/components/layout/form-feedback";
import { useFechaModalAoConcluir } from "@/components/layout/route-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import {
  importShoppingItemsToRound,
  type ShoppingListState,
} from "@/features/shopping-list/actions";
import {
  activateRound,
  addQuotationItem,
  addRoundSupplier,
  createRound,
  createRoundGroup,
  type RoundFormState,
} from "@/features/rounds/actions";

type Option = { id: string; name: string };

const selectClass =
  "border-input bg-surface text-fg focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : label}
    </Button>
  );
}

/**
 * Os campos da rodada.
 *
 * Separados do formulário porque existem em dois lugares agora — a página
 * `/compras/nova` e o modal da lista — e são exatamente os mesmos campos com o
 * mesmo texto de ajuda. O que muda entre os dois é o que acontece depois de
 * salvar, não o que se digita.
 *
 * `idPrefixo` existe porque `id` tem que ser único na página: com o modal
 * aberto por cima de uma lista, dois campos "title" quebrariam a associação do
 * `<label>` — e um rótulo que aponta para o campo errado é pior do que nenhum.
 */
export function CamposDaRodada({
  idPrefixo = "",
  initialTitle = "",
}: {
  idPrefixo?: string;
  initialTitle?: string;
}) {
  const idTitulo = `${idPrefixo}title`;
  const idNotas = `${idPrefixo}notes`;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idTitulo} className="text-fg text-sm font-medium">
          Título
        </label>
        <Input
          id={idTitulo}
          name="title"
          required
          autoFocus
          maxLength={120}
          defaultValue={initialTitle}
          placeholder="Compra semanal — 3ª semana de agosto"
        />
        <p className="text-fg-subtle text-xs">
          É como a rodada aparece na lista e no que você vai procurar depois.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idNotas} className="text-fg text-sm font-medium">
          Observações <span className="text-fg-subtle">(opcional)</span>
        </label>
        <Input id={idNotas} name="notes" maxLength={500} />
      </div>
    </>
  );
}

/**
 * Criação da rodada na página própria.
 *
 * Aqui, salvar abre a rodada: quem digitou o endereço `/compras/nova` veio
 * montar a cotação, e parar numa lista seria um clique a mais para voltar ao
 * que já estava fazendo. É o `apos=abrir` que diz isso à action.
 */
export function RoundForm({
  initialSupplierId,
  initialScheduleId,
  initialTitle,
}: {
  initialSupplierId?: string;
  initialScheduleId?: string;
  initialTitle?: string;
} = {}) {
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    createRound,
    { error: null },
  );

  return (
    <form
      action={formAction}
      className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-5"
    >
      <input type="hidden" name="apos" value="abrir" />
      <input
        type="hidden"
        name="initialSupplierId"
        value={initialSupplierId ?? ""}
      />
      <input
        type="hidden"
        name="initialScheduleId"
        value={initialScheduleId ?? ""}
      />
      {/* Lado a lado só aqui. No modal os mesmos campos ficam empilhados —
          lá a caixa é estreita; aqui a rodada tem a página inteira, e dois
          campos soltos um sobre o outro viravam duas linhas de um metro. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <CamposDaRodada initialTitle={initialTitle} />
      </div>

      {initialScheduleId ? (
        <p className="border-primary/25 bg-primary-soft text-fg rounded-lg border px-3 py-2 text-sm">
          Ao criar, os produtos e quantidades habituais deste fornecedor serão
          incluídos na rodada para você revisar antes do envio.
        </p>
      ) : null}

      <ErrorLine error={state.error} />
      {state.roundId ? (
        <div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/compras/${state.roundId}`}>Abrir rodada criada</Link>
          </Button>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-fg-subtle text-xs">
          A rodada nasce em preparação. Nada é enviado até você iniciá-la.
        </p>
        <Submit label="Criar rodada" />
      </div>
    </form>
  );
}

export function GroupForm({ roundId }: { roundId: string }) {
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    createRoundGroup,
    { error: null },
  );

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="roundId" value={roundId} />
      <div className="flex max-w-md flex-col gap-1.5">
        <label htmlFor="group-name" className="text-fg text-sm font-medium">
          Novo grupo
        </label>
        <Input
          id="group-name"
          name="name"
          required
          maxLength={80}
          placeholder="Produtos para feijoada"
        />
        <p className="text-fg-subtle text-xs">
          Grupo é organização da cotação, diferente da categoria do produto.
        </p>
      </div>
      <ErrorLine error={state.error} />
      <div className="flex justify-end">
        <Submit label="Adicionar grupo" />
      </div>
    </form>
  );
}

/**
 * Adicionar produto à rodada.
 *
 * A pergunta "em que grupo?" só aparece quando ela tem resposta possível — ou
 * seja, quando a rodada tem mais de um grupo. Com um só, o campo seria uma
 * escolha entre uma coisa: três palavras de jargão a mais para quem só quer
 * cotar frango. Sem o campo, a action põe o item no grupo padrão.
 */
export function ItemForm({
  roundId,
  groups,
  products,
}: {
  roundId: string;
  groups: Option[];
  products: Option[];
}) {
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    addQuotationItem,
    { error: null },
  );
  const quantityRef = React.useRef<HTMLInputElement>(null);

  const perguntarGrupo = groups.length > 1;

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="roundId" value={roundId} />

      <div
        // `minmax(0,…)` e não `1fr`: numa tela larga o seletor de produto
        // esticava até a borda e a quantidade ficava sozinha no outro extremo,
        // longe do campo com que ela se lê junto.
        className={cn(
          "grid gap-3",
          perguntarGrupo
            ? "sm:grid-cols-[minmax(0,22rem)_minmax(0,16rem)_8rem]"
            : "sm:grid-cols-[minmax(0,28rem)_8rem]",
        )}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="productId" className="text-fg text-sm font-medium">
            Produto
          </label>
          <SearchableSelect
            id="productId"
            name="productId"
            options={products}
            placeholder="Digite o nome do produto…"
            emptyMessage="Nenhum produto encontrado."
            required
            focusKey={state.savedAt}
            onOptionSelected={() => quantityRef.current?.focus()}
          />
        </div>

        {perguntarGrupo ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="groupId" className="text-fg text-sm font-medium">
              Grupo
            </label>
            <select
              id="groupId"
              name="groupId"
              required
              defaultValue={groups[0].id}
              className={selectClass}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="quantity" className="text-fg text-sm font-medium">
            Quantidade
          </label>
          <Input
            ref={quantityRef}
            id="quantity"
            name="quantity"
            required
            inputMode="decimal"
            placeholder="100"
          />
        </div>
      </div>

      <ErrorLine error={state.error} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-subtle text-xs">
          Digite o produto, use Enter, informe a quantidade e use Enter
          novamente para adicionar. O foco volta ao produto.
        </p>
        <Submit label="Adicionar produto" />
      </div>
    </form>
  );
}

export function ShoppingListImportForm({
  roundId,
  groups,
  items,
}: {
  roundId: string;
  groups: Option[];
  items: {
    id: string;
    productName: string;
    quantity: string;
    purchaseUnit: string;
    notes: string;
    isActive: boolean;
  }[];
}) {
  const [state, action] = useActionState<ShoppingListState, FormData>(
    importShoppingItemsToRound,
    { error: null },
  );

  return (
    <details
      key={state.savedAt}
      className="border-border bg-surface rounded-xl border"
    >
      <summary className="text-fg flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
        <ListChecks className="text-primary size-4" aria-hidden />
        Adicionar da lista de compras
        <span className="text-fg-subtle font-normal">
          ({items.length} pendentes)
        </span>
      </summary>
      <form
        action={action}
        className="border-border flex flex-col gap-3 border-t p-4"
      >
        <input type="hidden" name="roundId" value={roundId} />
        {groups.length > 1 ? (
          <div className="flex max-w-xs flex-col gap-1.5">
            <label
              htmlFor="shopping-group"
              className="text-fg text-sm font-medium"
            >
              Inserir no grupo
            </label>
            <select id="shopping-group" name="groupId" className={selectClass}>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <label
              key={item.id}
              className="border-border hover:bg-surface-muted flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2"
            >
              <input
                type="checkbox"
                name="shoppingItemId"
                value={item.id}
                disabled={!item.isActive}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="min-w-0 text-sm">
                <span className="text-fg block font-medium">
                  {item.productName}
                </span>
                <span className="text-fg-muted block text-xs">
                  {item.quantity} {item.purchaseUnit}
                  {item.notes ? ` · ${item.notes}` : ""}
                </span>
              </span>
            </label>
          ))}
        </div>
        <ErrorLine error={state.error} />
        <div className="flex justify-end">
          <Submit label="Adicionar selecionados" />
        </div>
      </form>
    </details>
  );
}

export function SupplierPickerForm({
  roundId,
  suppliers,
}: {
  roundId: string;
  suppliers: Option[];
}) {
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    addRoundSupplier,
    { error: null },
  );

  return (
    <form
      key={state.savedAt}
      action={formAction}
      className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="roundId" value={roundId} />

      <div className="flex max-w-md flex-col gap-1.5">
        <label htmlFor="supplierId" className="text-fg text-sm font-medium">
          Convidar fornecedor
        </label>
        <SearchableSelect
          id="supplierId"
          name="supplierId"
          options={suppliers}
          placeholder="Digite o nome do fornecedor…"
          emptyMessage="Nenhum fornecedor encontrado."
          required
          focusKey={state.savedAt}
          submitOnEnter
        />
        <p className="text-fg-subtle text-xs">
          Digite e pressione Enter para adicionar rapidamente. O foco volta para
          este campo para o próximo fornecedor.
        </p>
      </div>

      <ErrorLine error={state.error} />

      <div className="flex justify-end">
        <Submit label="Adicionar fornecedor" />
      </div>
    </form>
  );
}

/**
 * O terceiro passo: conferir e iniciar.
 *
 * Antes isto era um botão no cabeçalho que abria uma confirmação. Virou o
 * fim da trilha, onde já se está olhando o que foi montado — a confirmação
 * deixou de ser um passo extra porque o resumo ESTÁ na tela, e não escondido
 * atrás de um "tem certeza?" que ninguém lê.
 *
 * Quando falta alguma coisa, o painel diz o que falta em vez de deixar a pessoa
 * apertar e descobrir pelo erro. O botão continua existindo e continua sendo
 * validado no servidor: o que some é a surpresa.
 */
export function StartRoundPanel({
  roundId,
  itemCount,
  supplierCount,
}: {
  roundId: string;
  itemCount: number;
  supplierCount: number;
}) {
  // Iniciar é o fim da montagem: dentro do modal, é a hora de fechar e devolver
  // a lista — que já vem com a rodada em "Em andamento".
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    useFechaModalAoConcluir(activateRound),
    { error: null },
  );

  const faltando: string[] = [];
  if (itemCount === 0) faltando.push("adicionar ao menos um produto");
  if (supplierCount === 0) faltando.push("convidar ao menos um fornecedor");
  const pronto = faltando.length === 0;

  return (
    <form
      action={formAction}
      className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-4"
    >
      <input type="hidden" name="roundId" value={roundId} />

      {pronto ? (
        <div className="flex flex-col gap-1">
          <p className="text-fg text-sm">
            <strong className="font-semibold tabular-nums">
              {itemCount} {itemCount === 1 ? "produto" : "produtos"}
            </strong>{" "}
            {itemCount === 1 ? "vai" : "vão"} para{" "}
            <strong className="font-semibold tabular-nums">
              {supplierCount}{" "}
              {supplierCount === 1 ? "fornecedor" : "fornecedores"}
            </strong>
            .
          </p>
          <p className="text-fg-muted text-sm">
            Iniciar não envia nada ainda. Ela sai da preparação e cada
            fornecedor ganha o seu link, que você manda quando quiser — pelo
            WhatsApp aqui mesmo ou copiando o texto.
          </p>
          <p className="text-fg-subtle text-xs">
            A partir daí a montagem se encerra: acrescentar produto ou
            fornecedor passa a ser alteração controlada.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-fg text-sm font-medium">
            Falta {faltando.join(" e ")}.
          </p>
          <p className="text-fg-muted text-sm">
            É o mínimo para haver cotação: alguém precisa receber a pergunta, e
            precisa haver o que perguntar.
          </p>
        </div>
      )}

      <ErrorLine error={state.error} />

      <div>
        <SubmitIniciar habilitado={pronto} />
      </div>
    </form>
  );
}

/** O botão de iniciar, ciente de estar enviando. */
function SubmitIniciar({ habilitado }: { habilitado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      className="gap-1.5"
      disabled={!habilitado || pending}
    >
      <Play className="size-3.5" aria-hidden />
      {pending ? "Iniciando…" : "Iniciar rodada"}
    </Button>
  );
}
