/**
 * O preço da proposta contra o último que a empresa pagou.
 *
 * O menor preço de uma cotação diz quem é mais barato HOJE entre os que
 * responderam; não diz se o preço é bom. Um item que subiu 30% sem aviso, uma
 * promoção que acaba na semana que vem e um erro de digitação do fornecedor
 * parecem iguais na tela até alguém lembrar o que pagou da última vez. Esta é
 * a lembrança.
 *
 * Só compara o que é comparável: o preço histórico é por unidade de preço, e
 * uma proposta em outra unidade (caixa contra quilo) ficaria sem referência
 * em vez de ganhar uma diferença que não significa nada. Pagamento de mais de
 * `IDADE_MAXIMA_DIAS` atrás também fica de fora — três anos de inflação não
 * são uma referência.
 */

export const IDADE_MAXIMA_DIAS = 180;
/** A partir daqui a diferença merece atenção na tela e entra na contagem. */
export const LIMITE_ALTA = 0.1;
/** Abaixo disto a diferença é ruído e a tela diz "igual". */
export const LIMITE_RUIDO = 0.03;

export type UltimoPago = {
  price: number;
  unit: string;
  at: string;
  supplierId: string;
};

/** Tudo o que se pagou do produto, por fornecedor, na unidade de preço. */
export type UltimosPagosPorProduto = Map<string, UltimoPago[]>;

export type ComparacaoComUltimoPago = {
  /** 0,12 = 12% acima do último pago. */
  diff: number;
  referencia: UltimoPago;
  /** A referência é do mesmo fornecedor da proposta. */
  mesmoFornecedor: boolean;
};

/**
 * Prefere o último preço pago AO MESMO fornecedor; sem ele, o mais recente de
 * qualquer outro — o produto custa o que custa no mercado, e saber disso ainda
 * ajuda. Em ambos, só na mesma unidade de preço.
 */
export function compararComUltimoPago(
  pagos: UltimosPagosPorProduto,
  productId: string,
  supplierId: string,
  price: number,
  unit: string,
): ComparacaoComUltimoPago | null {
  const mesmaUnidade = (pagos.get(productId) ?? []).filter(
    (pago) => pago.unit === unit && pago.price > 0,
  );
  const doFornecedor = mesmaUnidade.find((pago) => pago.supplierId === supplierId);
  const referencia =
    doFornecedor ??
    [...mesmaUnidade].sort((a, b) => b.at.localeCompare(a.at))[0];
  if (!referencia || !(price > 0)) return null;
  return {
    diff: price / referencia.price - 1,
    referencia,
    mesmoFornecedor: Boolean(doFornecedor),
  };
}
