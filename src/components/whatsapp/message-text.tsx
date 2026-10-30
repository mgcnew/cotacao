import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

const URL_PATTERN = /(https?:\/\/[^\s<>"]+)/g;
const TRAILING = /[).,;:!?\]]+$/;

/** Páginas públicas do próprio CotaPro: viram um nome, não 90 caracteres de token. */
const OWN_LINKS: Record<string, string> = {
  q: "Link da cotação",
  o: "Link do pedido",
  n: "Link da negociação",
  r: "Próximas entregas",
};

function describeLink(url: string) {
  try {
    const parsed = new URL(url);
    const first = parsed.pathname.split("/")[1] ?? "";
    const own = OWN_LINKS[first];
    if (own && parsed.pathname.split("/")[2]?.length >= 12) return own;
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    const label = `${parsed.hostname.replace(/^www\./, "")}${path}`;
    return label.length > 44 ? `${label.slice(0, 43)}…` : label;
  } catch {
    return url;
  }
}

/**
 * *negrito*, _itálico_ e ~riscado~, como o WhatsApp mostra. Os marcadores só
 * valem na borda de uma palavra: `snake_case` e `2*3*4` ficam como estão.
 */
const MARKUP =
  /(?<![\p{L}\p{N}])(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)(?![\p{L}\p{N}])/gu;

function Marked({ text }: { text: string }) {
  const parts = text.split(MARKUP);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 0) return part;
        const inner = part.slice(1, -1);
        if (part.startsWith("*")) return <strong key={index}>{inner}</strong>;
        if (part.startsWith("_")) return <em key={index}>{inner}</em>;
        return <s key={index}>{inner}</s>;
      })}
    </>
  );
}

/** Para a lista de conversas, onde o marcador seria só ruído no meio da frase. */
export function stripMarkup(text: string) {
  return text.replace(MARKUP, (match) => match.slice(1, -1));
}

/**
 * Texto da mensagem com os endereços clicáveis.
 *
 * Os links de cotação que o sistema envia são longos e ficavam como um
 * parágrafo de letras em cada bolha; aqui aparecem como "Link da cotação".
 * O endereço completo continua no `href` e no `title`.
 */
export function MessageText({ body }: { body: string }) {
  const parts = body.split(URL_PATTERN);
  const nodes: ReactNode[] = parts.map((part, index) => {
    if (index % 2 === 0) return <Marked key={index} text={part} />;
    const trailing = part.match(TRAILING)?.[0] ?? "";
    const url = trailing ? part.slice(0, -trailing.length) : part;
    return (
      <span key={index}>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          title={url}
          className="text-primary decoration-primary/40 hover:decoration-primary inline-flex max-w-full items-center gap-1 align-baseline font-medium underline underline-offset-2 [overflow-wrap:anywhere]"
        >
          {describeLink(url)}
          <ExternalLink className="size-3 shrink-0" aria-hidden />
        </a>
        {trailing}
      </span>
    );
  });
  return <>{nodes}</>;
}
