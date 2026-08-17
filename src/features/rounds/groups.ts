/**
 * O grupo padrão da rodada.
 *
 * Mora em módulo próprio, e não junto das actions, porque um arquivo
 * `"use server"` só pode exportar funções assíncronas — constante exportada de
 * lá quebra em tempo de execução, mesmo compilando sem erro. Mesmo motivo do
 * `kinds.ts` da busca.
 *
 * O nome importa para a interface: é por ele que a tela sabe que a rodada ainda
 * está com a organização que veio de fábrica, e por isso pode esconder a
 * conversa sobre grupos de quem não pediu por ela.
 */
export const GRUPO_PADRAO = "Geral";
