/**
 * O ciclo de vida do pedido, na parte em que o resto do sistema precisa dele.
 *
 * Mora em módulo próprio porque três lugares perguntam a mesma coisa — a lista
 * de pedidos, o retrato do dashboard e a RPC que o alimenta — e a resposta
 * precisa ser uma. Estava escrita duas vezes, e duas cópias de uma regra
 * envelhecem em ritmos diferentes.
 */

/**
 * Situações em que ainda se espera mercadoria: o pedido saiu daqui e não
 * terminou. É o que a view de entregas chama de "aberto".
 *
 * `draft` fica de fora de propósito — rascunho nunca saiu, então não há o que
 * esperar dele. Quem quer os dois junta na chamada.
 */
export const PEDIDO_EM_ANDAMENTO = [
  "awaiting_confirmation",
  "awaiting_delivery",
  "partially_received",
];
