"use client";

import {
  Check,
  CircleAlert,
  CircleCheck,
  Copy,
  ExternalLink,
  LoaderCircle,
} from "lucide-react";
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
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ModoDoLote = "convite" | "cobranca" | "link";

export type CandidatoDoLote = {
  id: string;
  name: string;
  contact: string;
  whatsapp: string;
  /** Vazio quando pode entrar; senão, o motivo de ficar de fora. */
  bloqueio: string | null;
  jaEnviado: boolean;
};

type Situacao =
  | { tipo: "aguardando" }
  | { tipo: "enviando" }
  | { tipo: "ok"; aviso?: string }
  | { tipo: "erro"; erro: string }
  | {
      tipo: "link";
      url: string;
      mensagem: string;
      phone: string | null;
      aberto: boolean;
    };

/**
 * Pausa entre uma mensagem e outra. Muitas mensagens iguais do mesmo número
 * em sequência rápida é o que faz o WhatsApp bloquear a conexão; uns
 * segundos, com variação, deixam o lote com cara de envio feito à mão.
 */
const PAUSA_MIN_MS = 5000;
const PAUSA_VARIACAO_MS = 3000;

const TEXTOS: Record<
  ModoDoLote,
  { titulo: string; acao: (n: number) => string; descricao: string }
> = {
  convite: {
    titulo: "Enviar cotação para todos",
    acao: (n) => `Enviar para ${n}`,
    descricao:
      "Cada fornecedor recebe o link dele pelo WhatsApp da empresa, um de cada vez.",
  },
  cobranca: {
    titulo: "Cobrar respostas pendentes",
    acao: (n) => `Cobrar ${n}`,
    descricao:
      "Quem foi cobrado há menos de 2 horas fica de fora automaticamente.",
  },
  link: {
    titulo: "Gerar links para enviar pelo celular",
    acao: (n) => `Gerar ${n} ${n === 1 ? "link" : "links"}`,
    descricao:
      "Gera o link de cada um com a mensagem pronta. Depois é só abrir o WhatsApp de um em um.",
  },
};

/** Espera entre mensagens, com contagem regressiva; "Parar" corta a espera. */
async function pausar(
  parar: React.RefObject<boolean>,
  setEspera: (segundos: number) => void,
) {
  const total = PAUSA_MIN_MS + Math.random() * PAUSA_VARIACAO_MS;
  const fim = Date.now() + total;
  while (Date.now() < fim && !parar.current) {
    setEspera(Math.ceil((fim - Date.now()) / 1000));
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  setEspera(0);
}

async function chamar(roundId: string, acao: string, roundSupplierId: string) {
  try {
    const response = await fetch(`/api/compras/${roundId}/envio`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acao, roundSupplierId }),
    });
    const data = await response.json().catch(() => null);
    if (!data)
      return { ok: false as const, error: "Resposta inválida do servidor." };
    if (!response.ok && !("ok" in data))
      return { ok: false as const, error: String(data.error ?? "Falhou.") };
    return data as
      | {
          ok: true;
          aviso?: string;
          url?: string;
          message?: string;
          phone?: string | null;
        }
      | { ok: false; error: string };
  } catch {
    return { ok: false as const, error: "Sem conexão com o servidor." };
  }
}

export function BulkSendDialog({
  roundId,
  modo,
  candidatos,
  previa,
  open,
  onOpenChange,
}: {
  roundId: string;
  modo: ModoDoLote;
  candidatos: CandidatoDoLote[];
  /** A mensagem do primeiro selecionado, para conferir antes de enviar. */
  previa: (candidato: CandidatoDoLote | undefined) => string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const texto = TEXTOS[modo];
  const [selecionados, setSelecionados] = React.useState<Set<string>>(
    () => new Set(candidatos.filter((c) => !c.bloqueio).map((c) => c.id)),
  );
  const [situacoes, setSituacoes] = React.useState<Map<string, Situacao>>(
    () => new Map(),
  );
  const [rodando, setRodando] = React.useState(false);
  const [espera, setEspera] = React.useState(0);
  const parar = React.useRef(false);
  const mexeu = React.useRef(false);
  const iniciado = situacoes.size > 0;

  // Fechar no meio cortaria o lote: enquanto roda, a janela não fecha e a
  // página avisa antes de sair.
  React.useEffect(() => {
    if (!rodando) return;
    const avisar = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [rodando]);

  const marcar = (id: string, situacao: Situacao) =>
    setSituacoes((atual) => new Map(atual).set(id, situacao));

  async function executar(ids: string[]) {
    parar.current = false;
    mexeu.current = true;
    setRodando(true);
    setSituacoes((atual) => {
      const proximo = new Map(atual);
      for (const id of ids) proximo.set(id, { tipo: "aguardando" });
      return proximo;
    });
    for (const [indice, id] of ids.entries()) {
      if (parar.current) break;
      marcar(id, { tipo: "enviando" });
      const resultado = await chamar(roundId, modo, id);
      if (!resultado.ok) marcar(id, { tipo: "erro", erro: resultado.error });
      else if (modo === "link")
        marcar(id, {
          tipo: "link",
          url: resultado.url ?? "",
          mensagem: resultado.message ?? "",
          phone: resultado.phone ?? null,
          aberto: false,
        });
      else marcar(id, { tipo: "ok", aviso: resultado.aviso });
      // Gerar link não manda mensagem: não precisa de pausa.
      if (modo !== "link" && indice < ids.length - 1 && !parar.current)
        await pausar(parar, setEspera);
    }
    setRodando(false);
  }

  function fechar(proximo: boolean) {
    if (rodando) return;
    onOpenChange(proximo);
    if (!proximo && mexeu.current) router.refresh();
  }

  const ordem = candidatos.filter((c) => selecionados.has(c.id));
  const comErro = ordem
    .filter((c) => situacoes.get(c.id)?.tipo === "erro")
    .map((c) => c.id);
  const feitos = ordem.filter((c) => {
    const s = situacoes.get(c.id);
    return s?.tipo === "ok" || s?.tipo === "link";
  }).length;
  const proximoLink = ordem.find((c) => {
    const s = situacoes.get(c.id);
    return s?.tipo === "link" && !s.aberto && s.phone;
  });

  async function abrirWhatsApp(candidato: CandidatoDoLote) {
    const s = situacoes.get(candidato.id);
    if (s?.tipo !== "link" || !s.phone) return;
    window.open(
      `https://wa.me/${s.phone}?text=${encodeURIComponent(s.mensagem)}`,
      "_blank",
      "noopener",
    );
    marcar(candidato.id, { ...s, aberto: true });
    // Abrir a conversa é o mais perto que o sistema chega de saber que saiu.
    if (!candidato.jaEnviado) await chamar(roundId, "marcar", candidato.id);
  }

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{texto.titulo}</DialogTitle>
          <DialogDescription>{texto.descricao}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {modo === "link" && iniciado ? (
            <p className="text-warning text-xs">
              Os links aparecem só nesta janela. Se fechar antes de mandar, gere
              de novo.
            </p>
          ) : null}

          <ul className="border-border divide-border divide-y rounded-xl border">
            {candidatos.map((candidato) => {
              const situacao = situacoes.get(candidato.id);
              const marcado = selecionados.has(candidato.id);
              if (iniciado && !marcado) return null;
              return (
                <li
                  key={candidato.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  {iniciado ? (
                    <IconeDaSituacao situacao={situacao} />
                  ) : (
                    <input
                      type="checkbox"
                      className="accent-primary size-4 shrink-0"
                      checked={marcado}
                      disabled={Boolean(candidato.bloqueio)}
                      aria-label={`Incluir ${candidato.name}`}
                      onChange={(event) =>
                        setSelecionados((atual) => {
                          const proximo = new Set(atual);
                          if (event.target.checked) proximo.add(candidato.id);
                          else proximo.delete(candidato.id);
                          return proximo;
                        })
                      }
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-fg truncate text-sm font-medium",
                        candidato.bloqueio && "text-fg-subtle",
                      )}
                    >
                      {candidato.name}
                    </p>
                    <p className="text-fg-muted truncate text-xs">
                      {situacao?.tipo === "erro" ? (
                        <span className="text-destructive">
                          {situacao.erro}
                        </span>
                      ) : situacao?.tipo === "ok" && situacao.aviso ? (
                        <span className="text-warning">{situacao.aviso}</span>
                      ) : (
                        (candidato.bloqueio ??
                        `${candidato.contact}${candidato.whatsapp ? ` · ${candidato.whatsapp}` : ""}`)
                      )}
                    </p>
                  </div>
                  {situacao?.tipo === "link" ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <CopiarMensagem texto={situacao.mensagem} />
                      {situacao.phone ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={situacao.aberto ? "ghost" : "outline"}
                          onClick={() => abrirWhatsApp(candidato)}
                        >
                          {situacao.aberto ? (
                            <Check aria-hidden />
                          ) : (
                            <ExternalLink aria-hidden />
                          )}
                          {situacao.aberto ? "Aberto" : "Abrir"}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {!iniciado ? (
            <details className="group">
              <summary className="text-fg-muted cursor-pointer text-xs">
                Ver a mensagem
              </summary>
              <div className="bg-surface-sunken border-border mt-2 rounded-xl border p-3">
                <p className="text-fg-muted text-sm whitespace-pre-wrap">
                  {previa(ordem[0])}
                </p>
              </div>
            </details>
          ) : null}

          {iniciado ? (
            <p
              className="text-fg-muted text-sm tabular-nums"
              aria-live="polite"
            >
              {rodando
                ? espera > 0
                  ? `${feitos} de ${ordem.length} · próximo em ${espera}s`
                  : `${feitos} de ${ordem.length}…`
                : `${feitos} de ${ordem.length} ${modo === "link" ? "links gerados" : modo === "cobranca" ? "cobrados" : "enviados"}${comErro.length > 0 ? ` · ${comErro.length} com erro` : ""}.`}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {!iniciado ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => fechar(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={ordem.length === 0}
                onClick={() => executar(ordem.map((c) => c.id))}
              >
                {texto.acao(ordem.length)}
              </Button>
            </>
          ) : rodando ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => (parar.current = true)}
            >
              Parar depois deste
            </Button>
          ) : (
            <>
              {comErro.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => executar(comErro)}
                >
                  Tentar de novo ({comErro.length})
                </Button>
              ) : null}
              {modo === "link" && proximoLink ? (
                <Button
                  type="button"
                  onClick={() => abrirWhatsApp(proximoLink)}
                >
                  <ExternalLink aria-hidden /> Abrir WhatsApp de{" "}
                  {proximoLink.name}
                </Button>
              ) : (
                <Button type="button" onClick={() => fechar(false)}>
                  Concluir
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IconeDaSituacao({ situacao }: { situacao: Situacao | undefined }) {
  if (!situacao || situacao.tipo === "aguardando")
    return (
      <span
        className="border-border size-4 shrink-0 rounded-full border"
        aria-label="Aguardando"
      />
    );
  if (situacao.tipo === "enviando")
    return (
      <LoaderCircle
        className="text-primary size-4 shrink-0 animate-spin"
        aria-label="Enviando"
      />
    );
  if (situacao.tipo === "erro")
    return (
      <CircleAlert
        className="text-destructive size-4 shrink-0"
        aria-label="Falhou"
      />
    );
  return (
    <CircleCheck className="text-success size-4 shrink-0" aria-label="Pronto" />
  );
}

function CopiarMensagem({ texto }: { texto: string }) {
  const [copiado, setCopiado] = React.useState(false);
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={copiado ? "Mensagem copiada" : "Copiar mensagem com o link"}
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        window.setTimeout(() => setCopiado(false), 2000);
      }}
    >
      {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
    </Button>
  );
}
