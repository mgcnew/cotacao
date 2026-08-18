"use client";

import * as React from "react";

/**
 * Fecha o painel — ou o modal — quando a action confirma o salvamento.
 *
 * Ajuste de estado durante a renderização, e não `useEffect`: é o padrão que o
 * React recomenda para reagir a um valor novo, e evita o render em cascata que
 * um efeito com `setState` provoca (é a regra `react-hooks/set-state-in-effect`,
 * que esta base de código respeita).
 *
 * O `savedAt` visto fica guardado para que reabrir depois de salvar continue
 * funcionando: sem isso, o mesmo carimbo antigo fecharia o painel de novo na
 * primeira renderização seguinte.
 *
 * Nasceu dentro de `round-crud-forms.tsx`, para os painéis de edição em linha.
 * Saiu de lá quando os modais passaram a precisar exatamente da mesma coisa —
 * "a action confirmou, pode sumir" é a mesma pergunta nos dois casos.
 */
export function useFechaAoSalvar(savedAt: number | undefined) {
  const [aberto, setAberto] = React.useState(false);
  const [savedVisto, setSavedVisto] = React.useState(savedAt);

  if (savedAt !== savedVisto) {
    setSavedVisto(savedAt);
    if (savedAt) setAberto(false);
  }

  return [aberto, setAberto] as const;
}
