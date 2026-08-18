"use client";

import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Os filtros da lista, guardados atrás de um botão.
 *
 * POR QUE ESCONDER
 *
 * A barra de filtros ocupava um bloco inteiro no alto de toda lista, todos os
 * dias, para um uso que é ocasional. Empurrava para baixo o que a pessoa veio
 * ver — os números e a tabela — e competia com eles pela atenção. Guardada
 * atrás de um botão, ela continua a um clique de distância e some do caminho.
 *
 * O PREÇO DE ESCONDER, E COMO ELE É PAGO
 *
 * Filtro escondido é filtro esquecido: uma lista recortada passa a parecer a
 * lista inteira, e "sumiu um pedido" vira chamado de suporte. Por isso o botão
 * conta quantos filtros estão valendo e muda de cor quando há algum. A lista
 * também continua dizendo, no vazio e no rodapé, que está filtrada.
 *
 * APLICAR NAVEGA PELO CLIENTE
 *
 * O `<form method="get">` continua ali — é o que faz o Enter no campo de texto
 * submeter, e o que sobra se algo der errado com o JavaScript. Mas o envio é
 * interceptado para virar `router.push`: o recorte continua morando na URL,
 * compartilhável e com o botão de voltar funcionando, sem recarregar a página
 * inteira para trocar uma data.
 */
export function FilterDialog({
  basePath,
  ativos,
  ajuda,
  children,
}: {
  /** Para onde "Limpar" leva, e a base do endereço aplicado. */
  basePath: string;
  /** Quantos filtros estão valendo agora — vira o número no botão. */
  ativos: number;
  /** A frase que explica as situações compostas da lista. */
  ajuda?: React.ReactNode;
  /** Os campos, renderizados no servidor. */
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);

  function aplicar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const dados = new FormData(evento.currentTarget);
    const busca = new URLSearchParams();
    for (const [chave, valor] of dados.entries()) {
      // Campo em branco não vira parâmetro: "?situacao=&de=" polui o endereço
      // e faz um recorte vazio parecer um recorte.
      if (typeof valor === "string" && valor.trim() !== "") {
        busca.set(chave, valor.trim());
      }
    }

    const query = busca.toString();
    setAberto(false);
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm" variant={ativos > 0 ? "default" : "outline"} className="gap-1.5">
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Filtros
          {ativos > 0 ? (
            <span className="bg-surface/25 rounded-full px-1.5 text-xs tabular-nums">
              {ativos}
            </span>
          ) : null}
        </Button>
      </DialogTrigger>

      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Filtros</DialogTitle>
          <DialogDescription>
            O recorte vira endereço: dá para guardar nos favoritos e mandar
            pronto para outra pessoa.
          </DialogDescription>
        </DialogHeader>

        <form method="get" action={basePath} onSubmit={aplicar} className="contents">
          <DialogBody className="flex flex-col gap-4">
            {children}
            {ajuda ? <p className="text-fg-subtle text-xs">{ajuda}</p> : null}
          </DialogBody>

          <DialogFooter>
            <Button type="submit" size="sm">
              Aplicar
            </Button>
            {ativos > 0 ? (
              <Button
                asChild
                size="sm"
                variant="ghost"
                onClick={() => setAberto(false)}
              >
                <Link href={basePath}>Limpar</Link>
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
