"use client";

import { Eye, EyeOff, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setProductActive } from "@/features/products/actions";

/**
 * As ações de uma linha do catálogo, atrás de um gatilho só.
 *
 * Eram três controles repetidos em cada linha — lápis, "Desativar" escrito por
 * extenso e lixeira. Numa página de vinte produtos isso é sessenta elementos
 * disputando o olho com o que a tabela tem para dizer. Recolhidos no menu,
 * a coluna volta a ser uma coluna.
 *
 * `Desativar` sai por transição e não por `<form>`: o menu fecha no clique, e
 * um botão de submit desmontado junto com ele deixaria de disparar o envio.
 * Chamando a action direto, o fechamento não interrompe nada.
 */
export function ProductRowActions({
  productId,
  productName,
  isActive,
  podeEditar,
  podeExcluir,
}: {
  productId: string;
  productName: string;
  isActive: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={pending}
          aria-label={`Ações de ${productName}`}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-44">
        {podeEditar ? (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/produtos/editar/${productId}`}>
                <Pencil aria-hidden />
                Editar
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                startTransition(async () => {
                  await setProductActive(productId, !isActive);
                })
              }
            >
              {isActive ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              {isActive ? "Desativar" : "Reativar"}
            </DropdownMenuItem>
          </>
        ) : null}

        {podeEditar && podeExcluir ? <DropdownMenuSeparator /> : null}

        {/* O veredito de exclusão cruza sete tabelas e não é calculado por
            linha: quem clica abre a confirmação, e é lá que o produto revela se
            pode sair, se basta desfazer um vínculo ou se só resta inativar. */}
        {podeExcluir ? (
          <DropdownMenuItem variant="destructive" asChild>
            <Link href={`/produtos/excluir/${productId}`}>
              <Trash2 aria-hidden />
              Excluir
            </Link>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
