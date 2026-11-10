"use client";

import { Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
  createStockCount,
  type StockCountResult,
} from "@/features/stock-counts/actions";

/** Abre uma contagem nova; o nome é opcional e a data já identifica. */
export function NewCountDialog() {
  const [state, action, pending] = React.useActionState<
    StockCountResult,
    FormData
  >(createStockCount, { error: null });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="h-11 w-full sm:h-9 sm:w-auto">
          <Plus aria-hidden /> Nova contagem
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Nova contagem</DialogTitle>
          <DialogDescription>
            Dê um nome se quiser separar por setor. Em branco, ela leva a data
            de hoje.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="contents">
          <DialogBody className="flex flex-col gap-1.5">
            <label htmlFor="stock-count-name" className="text-fg-muted text-xs">
              Nome (opcional)
            </label>
            <Input
              id="stock-count-name"
              name="name"
              maxLength={120}
              placeholder="Ex.: Bebidas — geladeiras do fundo"
              autoComplete="off"
              className="h-11 text-base sm:h-9 sm:text-sm"
            />
            {state.error ? (
              <p role="alert" className="text-destructive text-xs">
                {state.error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              type="submit"
              disabled={pending}
              className="h-11 w-full sm:h-9 sm:w-auto"
            >
              {pending ? "Abrindo…" : "Começar a contar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
