"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback } from "react";

import { ErrorLine } from "@/components/layout/form-feedback";
import { useModalDeRota } from "@/components/layout/route-modal";
import { Button } from "@/components/ui/button";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import {
  deleteProduct,
  setProductActive,
  type ProductDeleteState,
} from "@/features/products/actions";
import type { ProductDeleteContext } from "@/features/products/queries";

const INITIAL_STATE: ProductDeleteState = { error: null };

/** Rótulos na ordem em que a pessoa reconhece o que cadastrou. */
const COLLATERAL_LABEL: {
  key: keyof ProductDeleteContext["collateral"];
  singular: string;
  plural: string;
}[] = [
  { key: "barcodes", singular: "código de barras", plural: "códigos de barras" },
  {
    key: "supplierLinks",
    singular: "vínculo com fornecedor",
    plural: "vínculos com fornecedores",
  },
  { key: "attributes", singular: "atributo preenchido", plural: "atributos preenchidos" },
  {
    key: "nfeAliases",
    singular: "descrição de fornecedor aprendida de NF-e",
    plural: "descrições de fornecedor aprendidas de NF-e",
  },
  {
    key: "nfeUnitRules",
    singular: "regra de unidade de NF-e",
    plural: "regras de unidade de NF-e",
  },
  {
    key: "archivedListItems",
    singular: "item em lista de compras arquivada",
    plural: "itens em listas de compras arquivadas",
  },
  {
    key: "importReferences",
    singular: "referência em lote de importação",
    plural: "referências em lotes de importação",
  },
];

export function ProductDeleteForm({
  context,
  inModal = false,
}: {
  context: ProductDeleteContext;
  inModal?: boolean;
}) {
  const modal = useModalDeRota();
  const router = useRouter();
  const { product, canDelete, kind, reason, collateral } = context;

  /**
   * Sucesso não pode apenas fechar a caixa como nas outras edições: o produto
   * deixou de existir, e a rota `/produtos/excluir/<id>` aberta em página
   * inteira passaria a apontar para o nada. Dentro do modal, fechar já devolve
   * a lista; fora dele, é preciso sair da rota à mão.
   *
   * A action não lê nada do formulário — o produto vem do id, e o resto o
   * servidor reavalia sozinho —, então ela ignora estado anterior e FormData.
   */
  const action = useCallback(async () => {
    const result = await deleteProduct(product.id);
    if (!result.error) {
      if (modal) modal.fechar();
      else router.replace("/produtos");
    }
    return result;
  }, [product.id, modal, router]);

  const [state, formAction] = useActionState(action, INITIAL_STATE);

  const losses = COLLATERAL_LABEL.map(({ key, singular, plural }) => {
    const total = collateral?.[key] ?? 0;
    return total > 0 ? `${total} ${total === 1 ? singular : plural}` : null;
  }).filter((item): item is string => item !== null);

  const body = canDelete ? (
    <>
      <p className="text-sm">
        Excluir <strong className="font-medium">{product.name}</strong> do
        catálogo. Nenhuma cotação respondida, pedido enviado ou nota fiscal
        conferida depende dele.
      </p>
      {losses.length > 0 ? (
        <div className="border-warning/30 bg-warning-soft text-warning rounded-lg border px-3 py-2.5 text-sm">
          <p className="font-medium">Sai junto e não volta:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {losses.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-fg-muted text-sm">
        A exclusão é definitiva. Se a intenção é só tirar o produto de
        circulação mantendo o cadastro, desative em vez de excluir.
      </p>
    </>
  ) : (
    <>
      <p className="border-warning/30 bg-warning-soft text-warning rounded-lg border px-3 py-2.5 text-sm">
        {reason}
      </p>
      {kind === "historical" ? (
        <p className="text-fg-muted text-sm">
          Produtos com história comercial permanecem no catálogo para que
          cotações, pedidos e comparações antigas continuem legíveis. Inativar
          tira o produto das telas de trabalho sem apagar esse rastro.
        </p>
      ) : (
        <p className="text-fg-muted text-sm">
          Nada aqui é definitivo: desfeito esse vínculo, a exclusão fica
          liberada.
        </p>
      )}
    </>
  );

  const content = (
    <>
      {body}
      <ErrorLine error={state.error} />
    </>
  );

  const cancelButton = inModal ? (
    <Button type="button" variant="ghost" onClick={modal?.fechar}>
      Cancelar
    </Button>
  ) : (
    <Button asChild variant="ghost">
      <Link href="/produtos">Voltar</Link>
    </Button>
  );

  const deactivateButton =
    !canDelete && kind === "historical" && product.isActive ? (
      <form action={setProductActive.bind(null, product.id, false)}>
        <Button type="submit" variant="ghost">
          Inativar produto
        </Button>
      </form>
    ) : null;

  const confirmButton = canDelete ? (
    <form action={formAction}>
      <FormSubmitButton variant="destructive" pendingLabel="Excluindo…">
        Excluir definitivamente
      </FormSubmitButton>
    </form>
  ) : null;

  const footer = (
    <>
      {cancelButton}
      {deactivateButton}
      {confirmButton}
    </>
  );

  return inModal ? (
    <>
      <DialogBody className="space-y-4">{content}</DialogBody>
      <DialogFooter className="justify-end">{footer}</DialogFooter>
    </>
  ) : (
    <>
      <section className="border-border bg-surface space-y-4 rounded-xl border p-5">
        {content}
      </section>
      <div className="mt-4 flex justify-end gap-2">{footer}</div>
    </>
  );
}
