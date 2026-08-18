"use client";

import { Plus } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { useFechaAoSalvar } from "@/components/layout/fecha-ao-salvar";
import { ErrorLine } from "@/components/layout/form-feedback";
import { CamposDaRodada } from "@/components/rounds/round-forms";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  useFormularioSujo,
} from "@/components/ui/dialog";
import { createRound, type RoundFormState } from "@/features/rounds/actions";

/**
 * Nova rodada sem sair da lista.
 *
 * É o caso em que o modal ganha por inteiro: o formulário são dois campos e
 * NÃO DEPENDE DE DADO NENHUM do servidor. Abrir custa zero — nada é buscado.
 * Ir até `/compras/nova` e voltar custava duas navegações e ~700 ms, para
 * digitar um título.
 *
 * Depois de salvar, a tela fica onde está e a tabela atrás já mostra a linha
 * nova: a action chama `revalidatePath("/compras")`, e o React re-renderiza a
 * lista embaixo do modal enquanto ele ainda está aberto — por isso o fechamento
 * pode acontecer depois, sem piscar uma lista velha.
 *
 * A página `/compras/nova` continua existindo, para link colado e para quem
 * chega por endereço direto. Os campos são o mesmo componente nos dois.
 */
export function NewRoundDialog({
  rotulo = "Nova rodada",
}: {
  /** O estado vazio convida com outras palavras que o botão do cabeçalho. */
  rotulo?: string;
}) {
  const [state, formAction] = useActionState<RoundFormState, FormData>(
    createRound,
    { error: null },
  );
  const [aberto, setAberto] = useFechaAoSalvar(state.savedAt);
  const { sujo, marcarSujo, limpar } = useFormularioSujo();

  return (
    <Dialog
      open={aberto}
      onOpenChange={(proximo) => {
        setAberto(proximo);
        // Fechou: o formulário some do DOM e volta em branco na próxima vez.
        // Sem limpar, ele reabriria já se achando sujo.
        if (!proximo) limpar();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-3.5" aria-hidden /> {rotulo}
        </Button>
      </DialogTrigger>

      <DialogContent size="sm" impedirFechamentoAcidental={sujo}>
        <DialogHeader>
          <DialogTitle>Nova rodada de compras</DialogTitle>
          <DialogDescription>
            Primeiro o título. Produtos e fornecedores entram na sequência, com
            a rodada ainda em preparação.
          </DialogDescription>
        </DialogHeader>

        {/* O `onChange` do formulário recebe os eventos de todos os campos por
            borbulhamento: é assim que ele sabe que há algo a perder. */}
        <form action={formAction} onChange={marcarSujo} className="contents">
          <DialogBody className="flex flex-col gap-4">
            <CamposDaRodada idPrefixo="modal-" />
            <ErrorLine error={state.error} />
          </DialogBody>

          <DialogFooter>
            <SubmitCriar />
            <DialogClose asChild>
              <Button type="button" size="sm" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <p className="text-fg-subtle ml-auto text-xs">
              Nada é enviado até você iniciá-la.
            </p>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubmitCriar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Criando…" : "Criar rodada"}
    </Button>
  );
}
