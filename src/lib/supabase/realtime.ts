"use client";

/**
 * Atualização ao vivo, fora do caminho crítico da página.
 *
 * O cliente do Supabase pesa ~126 KB comprimidos e, importado de forma estática
 * em um componente do layout, ia junto em TODA tela — para uma função que só
 * importa depois que a tela já abriu: "avise-me se algo mudou". Aqui ele vira
 * um pedaço à parte, buscado quando o navegador está ocioso.
 *
 * O custo é uma janela de poucos segundos em que um evento passa sem aviso.
 * Ela é inofensiva: o aviso só serve para recarregar a tela, e quem acabou de
 * abri-la já está vendo o dado de agora.
 */

/** Carrega o cliente do navegador sob demanda. */
export async function loadBrowserClient() {
  const { createClient } = await import("@/lib/supabase/client");
  return createClient();
}

/**
 * Agenda `task` para quando o navegador estiver livre (no máximo `timeout` ms
 * depois). Devolve o cancelamento, para o `useEffect` limpar sem vazar.
 */
export function whenIdle(task: () => void, timeout = 1500): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  // Safari não tem requestIdleCallback: um respiro curto cumpre o mesmo papel.
  const id = window.setTimeout(task, 200);
  return () => window.clearTimeout(id);
}
