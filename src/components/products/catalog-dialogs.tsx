"use client";

import { Plus } from "lucide-react";
import * as React from "react";

import { CategoryForm } from "@/components/products/category-form";
import { UnitForm } from "@/components/products/unit-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Criar categoria e unidade de dentro do cadastro de produto.
 *
 * POR QUE AQUI
 *
 * Todo produto pertence a uma categoria e grava duas unidades. Quando faltava
 * uma delas, o cadastro parava e mandava a pessoa para outra tela — no caso da
 * categoria, com uma barreira que não deixava nem começar. Voltando, o que
 * tinha sido digitado estava perdido.
 *
 * O que falta agora se resolve no lugar. São os mesmos `CategoryForm` e
 * `UnitForm` das telas de catálogo, sem cópia: eles só ganharam um aviso de
 * "gravei", que é o que fecha a caixa.
 *
 * O QUE ACONTECE DEPOIS DE GRAVAR
 *
 * A action revalida `/produtos/novo`, então o `select` volta com a opção nova
 * dentro. Ela não vem selecionada: escolher é da pessoa, e um campo que se
 * preenche sozinho depois de uma caixa fechar é justamente o tipo de coisa que
 * passa despercebida.
 */
function DialogoDoCatalogo({
  rotulo,
  titulo,
  descricao,
  size,
  children,
}: {
  rotulo: string;
  titulo: string;
  descricao: string;
  size: "md" | "lg";
  children: (aoSalvar: () => void) => React.ReactNode;
}) {
  const [aberto, setAberto] = React.useState(false);
  const fechar = React.useCallback(() => setAberto(false), []);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-fg-muted h-8 shrink-0 gap-1 px-2 text-xs"
        >
          <Plus className="size-3.5" aria-hidden />
          {rotulo}
        </Button>
      </DialogTrigger>

      <DialogContent size={size}>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <DialogBody>{children(fechar)}</DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function NovaCategoriaDialog() {
  return (
    <DialogoDoCatalogo
      rotulo="Nova"
      titulo="Nova categoria"
      descricao="A categoria organiza o catálogo e é o que decide quais atributos o produto vai pedir."
      size="md"
    >
      {(fechar) => <CategoryForm aoSalvar={fechar} />}
    </DialogoDoCatalogo>
  );
}

export function NovaUnidadeDialog() {
  return (
    <DialogoDoCatalogo
      rotulo="Nova"
      titulo="Nova unidade"
      descricao="Unidade de compra é como a mercadoria chega; a de precificação é a base do preço. Podem ser diferentes — caixa e quilo, por exemplo."
      size="lg"
    >
      {(fechar) => <UnitForm aoSalvar={fechar} />}
    </DialogoDoCatalogo>
  );
}
