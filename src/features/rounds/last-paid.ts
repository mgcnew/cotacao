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
 * em vez de ganhar uma diferença que não significa nada. A exceção são as
 * formas de compra do produto (0127): "1 cx = 12 un" é uma conversão exata, e
 * `expandirPorFormas` traduz cada preço pago para as outras formas. Pagamento de mais de
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

type FormaDeCompra = { unit: string; baseUnit: string; perUnit: number };

/**
 * Cada preço pago vira referência também nas outras formas do produto.
 *
 * Pagou R$ 3,50 a unidade; a proposta da caixa de 12 a R$ 40 passa a ter com
 * que se comparar (R$ 42 a caixa), e vice-versa. O preço sai da forma em que
 * foi pago, passa pela base e entra em cada outra forma. Unidade que não é a
 * base nem uma forma fica só como está.
 *
 * Ordena por data, do mais recente: com a expansão o mesmo fornecedor pode
 * ter duas referências na mesma unidade, e `compararComUltimoPago` fica com a
 * primeira.
 */
export function expandirPorFormas(
  pagos: UltimosPagosPorProduto,
  formasPorProduto: Map<string, FormaDeCompra[]>,
): UltimosPagosPorProduto {
  const resultado: UltimosPagosPorProduto = new Map();
  for (const [productId, lista] of pagos) {
    const formas = formasPorProduto.get(productId) ?? [];
    const base = formas[0]?.baseUnit;
    const expandida = [...lista];
    if (base) {
      for (const pago of lista) {
        const deOrigem = formas.find((forma) => forma.unit === pago.unit);
        const porBase =
          pago.unit === base
            ? pago.price
            : deOrigem
              ? pago.price / deOrigem.perUnit
              : null;
        if (porBase === null) continue;
        if (pago.unit !== base) {
          expandida.push({ ...pago, price: porBase, unit: base });
        }
        for (const forma of formas) {
          if (forma.unit === pago.unit) continue;
          expandida.push({ ...pago, price: porBase * forma.perUnit, unit: forma.unit });
        }
      }
    }
    expandida.sort((a, b) => b.at.localeCompare(a.at));
    resultado.set(productId, expandida);
  }
  return resultado;
}
