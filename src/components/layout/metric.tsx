import Link from "next/link";

/**
 * Um número em destaque, com o que ele significa embaixo.
 *
 * Nasceu duplicado em Análises e em Pedidos; um terceiro no Dashboard seria a
 * terceira cópia da mesma caixa. O `hint` não é decoração: número sem a regra
 * que o produziu vira palpite, e é ali que se diz de onde ele saiu.
 *
 * Com `href`, a caixa inteira vira o caminho para a tela que detalha aquele
 * número — que é o que o documento mestre pede do Dashboard: cada item leva à
 * ação, em vez de só informar.
 */
export function Metric({
  label,
  value,
  hint,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "good" | "bad";
  href?: string;
}) {
  const valueClass =
    tone === "good"
      ? "text-success"
      : tone === "bad"
        ? "text-destructive"
        : "text-fg";

  const conteudo = (
    <>
      <p className="text-fg-muted text-xs">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
      <p className="text-fg-subtle text-xs">{hint}</p>
    </>
  );

  const classe =
    "border-border bg-surface flex flex-col gap-1 rounded-xl border p-4";

  if (href) {
    return (
      <Link
        href={href}
        className={`${classe} hover:border-ring focus-visible:border-ring focus-visible:ring-ring/50 transition-colors outline-none focus-visible:ring-3`}
      >
        {conteudo}
      </Link>
    );
  }

  return <div className={classe}>{conteudo}</div>;
}
