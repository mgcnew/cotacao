"use client";

import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock3,
  FileText,
  ImageIcon,
  RotateCw,
  Video,
} from "lucide-react";
import Image from "next/image";
import * as React from "react";

import { MessageText } from "@/components/whatsapp/message-text";
import { formatClock } from "@/features/whatsapp/inbox-logic";
import type { InboxMessage } from "@/features/whatsapp/types";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  image: "Imagem",
  document: "Documento",
  audio: "Áudio",
  video: "Vídeo",
  contact: "Contato",
  location: "Localização",
  reaction: "Reação",
};

function Ticks({ status }: { status: InboxMessage["status"] }) {
  if (status === "failed") {
    return <AlertCircle className="text-destructive size-3.5" aria-label="Não enviada" />;
  }
  if (status === "read" || status === "played") {
    return <CheckCheck className="text-info size-3.5" aria-label="Lida" />;
  }
  if (status === "delivered") {
    return <CheckCheck className="size-3.5" aria-label="Entregue" />;
  }
  if (status === "sent") {
    return <Check className="size-3.5" aria-label="Enviada" />;
  }
  return <Clock3 className="size-3.5" aria-label="Enviando" />;
}

function Media({ message }: { message: InboxMessage }) {
  const src = `/api/whatsapp/media/${message.id}`;
  if (message.type === "image") {
    return message.hasMedia ? (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        aria-label="Abrir imagem em tamanho original"
        className="mb-1 block overflow-hidden rounded-lg"
      >
        <Image
          src={src}
          alt="Imagem recebida pelo WhatsApp"
          width={720}
          height={720}
          sizes="(max-width: 640px) 70vw, 20rem"
          unoptimized
          className="h-auto max-h-80 w-auto max-w-full object-contain"
        />
      </a>
    ) : (
      <p className="text-fg-muted mb-1 flex items-center gap-1.5 text-xs">
        <ImageIcon className="size-3.5" aria-hidden /> Imagem
      </p>
    );
  }
  if (message.type === "audio") {
    return message.hasMedia ? (
      <audio controls preload="none" className="mb-1 h-10 w-60 max-w-full" src={src}>
        Seu navegador não consegue reproduzir este áudio.
      </audio>
    ) : (
      <p className="text-fg-muted mb-1 text-xs">Áudio</p>
    );
  }
  const Icon = message.type === "video" ? Video : FileText;
  return (
    <p className="text-fg-muted mb-1 flex items-center gap-1.5 text-xs">
      <Icon className="size-3.5" aria-hidden />
      {message.fileName ?? TYPE_LABEL[message.type] ?? "Mensagem sem texto"}
    </p>
  );
}

/**
 * Uma mensagem. A hora e a confirmação ficam no canto de baixo, sobre o
 * espaço reservado no fim do texto, para uma frase curta não ocupar duas
 * linhas só por causa delas.
 */
function MessageBubbleView({
  message,
  startsRun,
  timeZone,
  onRetry,
}: {
  message: InboxMessage;
  startsRun: boolean;
  timeZone: string;
  onRetry: (message: InboxMessage) => void;
}) {
  const mine = message.direction === "outbound";
  const failed = message.status === "failed";
  const unsupported =
    !message.body &&
    !["image", "audio", "document", "video"].includes(message.type);

  return (
    <article
      className={cn(
        "flex flex-col",
        mine ? "items-end" : "items-start",
        startsRun ? "mt-3 first:mt-0" : "mt-0.5",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-1.5 text-[14px] leading-[1.45] sm:max-w-[70%]",
          mine
            ? "bg-primary-soft text-fg border-primary-line/50 border"
            : "bg-surface-elevated text-fg border-border border",
          startsRun && (mine ? "rounded-tr-md" : "rounded-tl-md"),
          failed && "border-destructive/40 bg-destructive-soft",
          message.status === "sending" && "opacity-80",
        )}
      >
        {message.type !== "text" && !unsupported ? <Media message={message} /> : null}
        {unsupported ? (
          <p className="text-fg-muted text-xs italic">
            {TYPE_LABEL[message.type] ?? "Mensagem"} — abra no WhatsApp para ver.
          </p>
        ) : null}
        <div className="relative">
          {message.body ? (
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              <MessageText body={message.body} />
              {/* Reserva, no fim da última linha, o lugar da hora e da confirmação. */}
              <span aria-hidden className="inline-block w-[4.5rem]" />
            </p>
          ) : null}
          <span
            className={cn(
              "text-fg-subtle flex items-center gap-1 text-xs leading-none tabular-nums",
              message.body ? "absolute right-0 bottom-[3px]" : "justify-end",
            )}
          >
            <time dateTime={message.occurredAt}>
              {formatClock(message.occurredAt, timeZone)}
            </time>
            {mine ? <Ticks status={message.status} /> : null}
          </span>
        </div>
        {message.error && !failed ? (
          <p className="text-warning mt-1 text-xs">{message.error}</p>
        ) : null}
      </div>
      {failed ? (
        <p
          role="alert"
          className="text-destructive mt-1 flex max-w-[85%] flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs sm:max-w-[70%]"
        >
          <span>{message.error ?? "Não foi possível enviar."}</span>
          <button
            type="button"
            onClick={() => onRetry(message)}
            className="text-fg hover:bg-surface-muted -my-1 inline-flex min-h-8 items-center gap-1 rounded-md px-2 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
          >
            <RotateCw className="size-3.5" aria-hidden /> Tentar de novo
          </button>
        </p>
      ) : null}
    </article>
  );
}

export const MessageBubble = React.memo(MessageBubbleView);
