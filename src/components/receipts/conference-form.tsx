"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCheck,
  MessageSquareText,
  Minus,
  Plus,
} from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ErrorLine } from "@/components/layout/form-feedback";
import { ConversionFix } from "@/components/receipts/conversion-fix";
import {
  BarcodeCameraDialog,
  type BarcodeScanOutcome,
} from "@/components/shopping-list/barcode-camera-dialog";
import {
  NfeImportPanel,
  importedItemValues,
  replaceUnitRule,
  type NfeImportPayload,
  type NfeUnitRule,
} from "@/components/receipts/nfe-import-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  forgetSupplierProductAlias,
  postDraftReceipt,
  type ReceiptActionState,
} from "@/features/receipts/actions";
import { barcodeMatches } from "@/features/products/barcodes";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

type Item = {
  id: string;
  productName: string;
  requestedQuantity: number;
  receivedQuantity: number;
  pendingQuantity: number;
  agreedPrice: number;
  purchaseUnit: string;
  pricingUnit: string;
  /** Tipo da unidade de precificação; "count" é contado em peças. */
  pricingUnitKind: string;
  /** Quanto o pedido previa na unidade de precificação, para o pedido todo. */
  estimatedPricingQuantity: number | null;
  /** Peças por embalagem no último recebimento deste produto. */
  lastPricingPerPackage: number | null;
  sameUnit: boolean;
  barcodes: string[];
  aliases: {
    supplierCode: string | null;
    supplierName: string;
    barcode: string | null;
  }[];
  unitRules: {
    id: string;
    xmlUnit: string;
    targetUnit: string;
    mode: "fixed_factor" | "manual_quantity";
    factor: number | null;
  }[];
  /** "1 cx = 12 un", quando o pedido está noutra forma de compra (0129). */
  form?: { perUnit: number; baseUnit: string } | null;
};

function numberFromField(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function decimalInput(value: number | null | undefined, digitsAfter = 6) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }
  return value
    .toFixed(digitsAfter)
    .replace(/0+$/, "")
    .replace(/\.$/, "")
    .replace(".", ",");
}

/**
 * Preço por peça e compra em embalagem (3 pct de 24 un): quem confere digita
 * as peças de UMA embalagem e o total sai da multiplicação. Peso não entra:
 * cada peça pesa diferente e o total só existe na balança.
 */
function porEmbalagem(item: Item) {
  return !item.sameUnit && item.pricingUnitKind === "count";
}

/**
 * Peças por embalagem já preenchidas: pela nota, se veio; senão pelo que o
 * pedido previa; senão pelo último recebimento. Só número inteiro — "23,333 un por pct" é sinal de que a
 * previsão não fecha por embalagem, e aí é melhor o campo vazio.
 */
function pecasPorEmbalagemSugeridas(
  item: Item,
  imported: NfeImportPayload["items"][string] | undefined,
) {
  const candidatos = [
    imported?.logisticQuantity && imported.pricingQuantity
      ? imported.pricingQuantity / imported.logisticQuantity
      : null,
    item.estimatedPricingQuantity && item.requestedQuantity > 0
      ? item.estimatedPricingQuantity / item.requestedQuantity
      : null,
    item.lastPricingPerPackage,
  ];
  for (const candidato of candidatos) {
    if (candidato === null) continue;
    const arredondado = Math.round(candidato * 1000) / 1000;
    if (arredondado > 0 && Number.isInteger(arredondado)) return arredondado;
  }
  return null;
}

function multiplicar(a: number, b: number) {
  return Math.round(a * b * 1000) / 1000;
}

function signedMoney(value: number) {
  return value > 0 ? `+${MONEY.format(value)}` : MONEY.format(value);
}

function matchLabel(
  method: NfeImportPayload["items"][string]["match"]["method"],
) {
  switch (method) {
    case "supplier-code":
      return "XML · código aprendido";
    case "supplier-name":
      return "XML · nome aprendido";
    case "barcode":
      return "XML · código de barras";
    case "exact-name":
      return "XML · nome exato";
    default:
      return "XML · nome semelhante";
  }
}

/**
 * Escreve num campo sem estado do formulário e avisa o `onInput` dele.
 *
 * Os campos da conferência são não controlados (o XML os remonta com
 * `defaultValue`), e o total é relido do DOM. O passo e a câmera do celular
 * mexem no MESMO campo que se digita — não há um segundo campo para o envio.
 */
function escreverCampo(
  form: HTMLFormElement | null,
  name: string,
  value: string,
) {
  const field = form?.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement)) return;
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

const STEP_BUTTON =
  "border-border bg-surface text-fg-muted active:bg-surface-muted grid size-11 shrink-0 place-items-center rounded-md border sm:hidden";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="max-sm:h-12 max-sm:w-full max-sm:text-base"
    >
      {pending ? "Confirmando entrega…" : "Confirmar esta entrega"}
    </Button>
  );
}

export function ReceiptConferenceForm({
  receiptId,
  orderId,
  items,
  invoiceNumber,
  invoiceSeries,
  invoiceTotal,
  notes,
  companyDocument,
  supplierDocument,
  canUpdateSupplier,
  canReviseOrder,
  existingDocuments,
}: {
  receiptId: string;
  orderId: string;
  items: Item[];
  invoiceNumber: string | null;
  invoiceSeries: string | null;
  invoiceTotal: number | null;
  notes: string | null;
  companyDocument: string | null;
  supplierDocument: string | null;
  canUpdateSupplier: boolean;
  canReviseOrder: boolean;
  existingDocuments: {
    id: string;
    fileName: string;
    downloadUrl: string | null;
  }[];
}) {
  const [state, action] = useActionState<ReceiptActionState, FormData>(
    postDraftReceipt,
    { error: null },
  );
  const [calculatedTotal, setCalculatedTotal] = React.useState(0);
  /** Itens com alguma quantidade recebida — o resumo da barra do celular. */
  const [filledCount, setFilledCount] = React.useState(0);
  /** No celular a observação do produto fica atrás de um toque. */
  const [notesOpen, setNotesOpen] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [typedInvoiceTotal, setTypedInvoiceTotal] = React.useState(
    invoiceTotal ?? 0,
  );
  const [xmlImport, setXmlImport] = React.useState<NfeImportPayload | null>(
    null,
  );
  const [formVersion, setFormVersion] = React.useState(0);
  const [unmatching, setUnmatching] = React.useState<string | null>(null);
  const [unmatchError, setUnmatchError] = React.useState<string | null>(null);
  /**
   * Regras de conversão corrigidas nesta conferência, por item do pedido.
   *
   * Moram aqui, e não no painel do XML, porque a correção parte do card do
   * produto — onde o número errado aparece — e o painel também precisa delas
   * para recalcular o que já importou.
   */
  const [unitRuleOverrides, setUnitRuleOverrides] = React.useState<
    Record<string, NfeUnitRule[]>
  >({});
  /**
   * Remonta os campos de um único produto.
   *
   * Corrigir a conversão troca a quantidade sugerida, e `defaultValue` só é
   * lido na montagem. Trocar a `key` do formulário inteiro resolveria — e
   * apagaria tudo que já foi digitado nos outros produtos.
   */
  const [itemVersions, setItemVersions] = React.useState<
    Record<string, number>
  >({});
  const formRef = React.useRef<HTMLFormElement>(null);
  /** Produtos em que a pessoa preferiu digitar o total de peças à mão. */
  const [totalDigitado, setTotalDigitado] = React.useState<Set<string>>(
    () => new Set(),
  );
  /** Recebido e peças por embalagem de cada produto, para mostrar a conta. */
  const [embalagens, setEmbalagens] = React.useState<
    Record<string, { recebido: number; porEmbalagem: number }>
  >({});

  /**
   * Devolve a linha da nota à lista dos não reconhecidos e apaga o que o
   * sistema aprendeu com a associação errada.
   *
   * Só tirar daqui não bastaria: o casamento por código do fornecedor tem
   * confiança máxima, então a mesma descrição voltaria a cair no produto
   * errado na próxima nota, sem perguntar nada.
   */
  async function unmatchItem(
    itemId: string,
    imported: NfeImportPayload["items"][string],
  ) {
    if (!xmlImport) return;
    setUnmatching(itemId);
    setUnmatchError(null);
    for (const xmlItem of imported.xmlItems) {
      const data = new FormData();
      data.set("receiptId", receiptId);
      data.set("supplierName", xmlItem.description);
      if (xmlItem.supplierCode) data.set("supplierCode", xmlItem.supplierCode);
      const result = await forgetSupplierProductAlias(data);
      if (result.error) {
        setUnmatchError(result.error);
        setUnmatching(null);
        return;
      }
    }
    const { [itemId]: removed, ...rest } = xmlImport.items;
    applyXml({
      ...xmlImport,
      items: rest,
      unmatched: [
        ...xmlImport.unmatched,
        ...removed.xmlItems.map((xmlItem) => ({
          ...xmlItem,
          receiptAccessKey: removed.receiptAccessKey,
        })),
      ],
    });
    setUnmatching(null);
  }

  function applyXml(payload: NfeImportPayload | null) {
    setXmlImport(payload);
    setTypedInvoiceTotal(payload?.nfe.total ?? invoiceTotal ?? 0);
    setCalculatedTotal(
      payload
        ? items.reduce((sum, item) => {
            const imported = payload.items[item.id];
            const quantity = item.sameUnit
              ? imported?.logisticQuantity
              : imported?.pricingQuantity;
            return sum + (quantity ?? 0) * (imported?.practicedPrice ?? 0);
          }, 0)
        : 0,
    );
    setFormVersion((version) => version + 1);
  }

  const recalculate = React.useCallback(
    (form: HTMLFormElement) => {
      // O total de peças vai num campo oculto, recalculado aqui a cada toque:
      // o envio e a soma abaixo continuam lendo `prec_` como sempre.
      const antes = new FormData(form);
      const contas: Record<string, { recebido: number; porEmbalagem: number }> =
        {};
      for (const item of items) {
        if (!porEmbalagem(item) || totalDigitado.has(item.id)) continue;
        const recebido = numberFromField(antes.get(`log_${item.id}`));
        const porEmb = numberFromField(antes.get(`emb_${item.id}`));
        contas[item.id] = { recebido, porEmbalagem: porEmb };
        const oculto = form.elements.namedItem(`prec_${item.id}`);
        if (oculto instanceof HTMLInputElement) {
          oculto.value =
            recebido > 0 && porEmb > 0
              ? decimalInput(multiplicar(recebido, porEmb))
              : "";
        }
      }
      setEmbalagens(contas);

      const data = new FormData(form);
      setCalculatedTotal(
        items.reduce(
          (sum, item) =>
            sum +
            numberFromField(
              data.get(`${item.sameUnit ? "log" : "prec"}_${item.id}`),
            ) *
              numberFromField(data.get(`preco_${item.id}`)),
          0,
        ),
      );
      setTypedInvoiceTotal(numberFromField(data.get("invoiceTotal")));
      setFilledCount(
        items.filter((item) => numberFromField(data.get(`log_${item.id}`)) > 0)
          .length,
      );
    },
    [items, totalDigitado],
  );

  /** + e − no recebido: soma sobre o que está no campo agora. */
  function passo(item: Item, delta: number) {
    const field = formRef.current?.elements.namedItem(`log_${item.id}`);
    if (!(field instanceof HTMLInputElement)) return 0;
    const next = Math.max(
      0,
      Math.round((numberFromField(field.value) + delta) * 1000) / 1000,
    );
    escreverCampo(
      formRef.current,
      `log_${item.id}`,
      next ? decimalInput(next) : "",
    );
    return next;
  }

  /**
   * "Veio tudo": o pendente de cada item no recebido, para só corrigir o que
   * chegou diferente. Não sobrescreve o que já foi digitado ou veio do XML.
   */
  function veioTudo() {
    for (const item of items) {
      const field = formRef.current?.elements.namedItem(`log_${item.id}`);
      if (!(field instanceof HTMLInputElement) || field.value.trim()) continue;
      escreverCampo(
        formRef.current,
        `log_${item.id}`,
        decimalInput(item.pendingQuantity),
      );
    }
  }

  function handleScan(code: string): BarcodeScanOutcome {
    const item = items.find(
      (candidate) =>
        barcodeMatches(candidate.barcodes, code) ||
        barcodeMatches(
          candidate.aliases.flatMap((alias) =>
            alias.barcode ? [alias.barcode] : [],
          ),
          code,
        ),
    );
    if (!item) {
      return {
        ok: false,
        message: `O código ${code} não é de nenhum produto pendente deste pedido.`,
      };
    }
    const next = passo(item, 1);
    return {
      ok: true,
      label: `${item.productName} · ${QTY.format(next)} de ${QTY.format(item.pendingQuantity)} ${item.purchaseUnit}${next > item.pendingQuantity ? " — acima do pendente" : ""}`,
    };
  }

  /**
   * Relê o formulário depois que um produto foi remontado.
   *
   * A soma precisa do valor novo do produto corrigido e do que já estava
   * digitado nos outros — e só o DOM tem os dois juntos.
   */
  const firstRender = React.useRef(true);
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (formRef.current) recalculate(formRef.current);
  }, [itemVersions, formVersion, recalculate]);

  /**
   * Passa a valer a conversão corrigida: recalcula as quantidades deste
   * produto e remonta só os campos dele.
   */
  function applyConversion(item: Item, rule: NfeUnitRule) {
    if (!xmlImport) return;
    const imported = xmlImport.items[item.id];
    if (!imported) return;
    const nextRules = replaceUnitRule(
      unitRuleOverrides[item.id] ?? item.unitRules,
      rule,
    );
    setUnitRuleOverrides((current) => ({ ...current, [item.id]: nextRules }));
    setXmlImport({
      ...xmlImport,
      items: {
        ...xmlImport.items,
        [item.id]: {
          ...imported,
          ...importedItemValues(imported.xmlItems, {
            ...item,
            unitRules: nextRules,
          }),
        },
      },
    });
    setItemVersions((current) => ({
      ...current,
      [item.id]: (current[item.id] ?? 0) + 1,
    }));
  }

  const fiscal = xmlImport?.nfe.fiscalTotals;
  const productReconciliation = fiscal
    ? fiscal.products - calculatedTotal
    : typedInvoiceTotal - calculatedTotal;
  const fiscalComponents = fiscal
    ? [
        ["Frete", fiscal.freight],
        ["Seguro", fiscal.insurance],
        ["Outras despesas", fiscal.other],
        ["IPI", fiscal.ipi],
        ["IPI devolvido", fiscal.returnedIpi],
        ["ICMS ST", fiscal.icmsSt],
        ["FCP ST", fiscal.fcpSt],
        ["ICMS monofásico retido", fiscal.monophaseRetainedIcms],
        ["Imposto de importação", fiscal.importTax],
        ["Serviços", fiscal.services],
        ["Desconto", -fiscal.discount],
        ["ICMS desonerado", -fiscal.desoneratedIcms],
        ["Outros ajustes fiscais", fiscal.residual],
      ].filter((component) => Math.abs(Number(component[1])) > 0.004)
    : [];

  return (
    <div className="flex flex-col gap-5">
      <NfeImportPanel
        receiptId={receiptId}
        items={items}
        companyDocument={companyDocument}
        supplierDocument={supplierDocument}
        canUpdateSupplier={canUpdateSupplier}
        canReviseOrder={canReviseOrder}
        existingDocuments={existingDocuments}
        value={xmlImport}
        onChange={applyXml}
        unitRuleOverrides={unitRuleOverrides}
        onUnitRules={(orderItemId, rules) =>
          setUnitRuleOverrides((current) => ({
            ...current,
            [orderItemId]: rules,
          }))
        }
      />
      <form
        ref={formRef}
        key={formVersion}
        action={action}
        onInput={(event) => recalculate(event.currentTarget)}
        className="flex flex-col gap-5"
      >
        <input type="hidden" name="receiptId" value={receiptId} />
        <input type="hidden" name="orderId" value={orderId} />

        {/* No celular os produtos vêm antes da nota: quem confere está com a
            mercadoria na frente, e a nota se preenche depois. */}
        <section className="border-border bg-surface rounded-xl border p-4 max-sm:order-2">
          <h2 className="text-fg text-sm font-semibold">Documentos fiscais</h2>
          <p className="text-fg-muted mt-1 mb-4 text-sm">
            Estes dados identificam a entrega. A soma calculada usa quantidade
            de precificação × preço de cada produto.
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="invoiceNumber"
                className="text-fg text-sm font-medium"
              >
                Número
              </label>
              <Input
                id="invoiceNumber"
                name="invoiceNumber"
                defaultValue={xmlImport?.nfe.number ?? invoiceNumber ?? ""}
                maxLength={60}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="invoiceSeries"
                className="text-fg text-sm font-medium"
              >
                Série
              </label>
              <Input
                id="invoiceSeries"
                name="invoiceSeries"
                defaultValue={xmlImport?.nfe.series ?? invoiceSeries ?? ""}
                maxLength={20}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="invoiceTotal"
                className="text-fg text-sm font-medium"
              >
                Total da nota
              </label>
              <Input
                id="invoiceTotal"
                name="invoiceTotal"
                inputMode="decimal"
                defaultValue={decimalInput(
                  xmlImport?.nfe.total ?? invoiceTotal,
                  2,
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="receiptNotes"
                className="text-fg text-sm font-medium"
              >
                Observação
              </label>
              <Input
                id="receiptNotes"
                name="notes"
                defaultValue={notes ?? ""}
                maxLength={500}
              />
            </div>
          </div>
          <div
            className={`bg-surface-sunken mt-4 grid gap-2 rounded-lg px-3 py-2 text-sm ${fiscal ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}
          >
            <span>
              Produtos conferidos:{" "}
              <strong>{MONEY.format(calculatedTotal)}</strong>
            </span>
            {fiscal ? (
              <span>
                Produtos no XML:{" "}
                <strong>{MONEY.format(fiscal.products)}</strong>
              </span>
            ) : null}
            <span>
              Total da nota: <strong>{MONEY.format(typedInvoiceTotal)}</strong>
            </span>
            <span
              className={
                Math.abs(productReconciliation) > 0.009
                  ? "text-destructive"
                  : "text-success"
              }
            >
              {fiscal ? "Produtos a conciliar:" : "Diferença:"}{" "}
              <strong>{signedMoney(productReconciliation)}</strong>
            </span>
          </div>
          {fiscal ? (
            <div className="border-border mt-3 rounded-lg border px-3 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-fg font-medium">
                    Ajuste fiscal da nota:{" "}
                    {signedMoney(fiscal.invoice - fiscal.products)}
                  </p>
                  <p className="text-fg-muted text-xs">
                    É a diferença entre os produtos do XML e o total a pagar;
                    não altera o preço unitário usado nas divergências.
                  </p>
                </div>
                {Math.abs(productReconciliation) <= 0.009 ? (
                  <Badge variant="secondary">Produtos conciliados</Badge>
                ) : (
                  <Badge variant="outline">Revisar produtos</Badge>
                )}
              </div>
              {fiscalComponents.length ? (
                <details className="mt-3">
                  <summary className="text-primary cursor-pointer text-xs font-medium">
                    Ver composição fiscal
                  </summary>
                  <div className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    {fiscalComponents.map(([label, amount]) => (
                      <div
                        key={String(label)}
                        className="text-fg-muted flex justify-between gap-3 text-xs"
                      >
                        <span>{label}</span>
                        <strong className="text-fg">
                          {signedMoney(Number(amount))}
                        </strong>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              {fiscal.estimatedTaxes > 0 ? (
                <p className="text-fg-subtle mt-2 text-xs">
                  Tributos aproximados informativos no XML:{" "}
                  {MONEY.format(fiscal.estimatedTaxes)}. Esse valor já está
                  embutido e não é somado novamente.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-3 max-sm:order-1">
          <div>
            <h2 className="text-fg text-sm font-semibold">
              Produtos recebidos
            </h2>
            <p className="text-fg-muted mt-1 text-sm">
              Deixe em branco o que não veio nesta entrega; o saldo continuará
              pendente.
            </p>
          </div>
          {/* No celular a conferência é feita com a mercadoria na frente: ou
              veio tudo e só se corrige a exceção, ou se bipa produto a
              produto. */}
          <div className="flex gap-2 sm:hidden">
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1 gap-2 text-base pointer-coarse:h-12"
              onClick={veioTudo}
            >
              <CheckCheck className="size-4" aria-hidden /> Veio tudo
            </Button>
            <BarcodeCameraDialog
              continuous
              onDetected={handleScan}
              triggerClassName="size-12 rounded-xl pointer-coarse:size-12"
            />
          </div>
          {items.map((item) => {
            const imported = xmlImport?.items[item.id];
            return (
              <div
                key={item.id}
                className={`bg-surface rounded-xl border p-3 sm:p-4 ${
                  imported?.warnings.length
                    ? "border-warning"
                    : imported
                      ? "border-success"
                      : "border-border"
                }`}
              >
                <input type="hidden" name="itemId" value={item.id} />
                {imported || (xmlImport?.documents.length ?? 0) <= 1 ? (
                  <input
                    type="hidden"
                    name={`xml_${item.id}`}
                    value={imported?.receiptAccessKey ?? ""}
                  />
                ) : null}
                <input
                  type="hidden"
                  name={`nome_${item.id}`}
                  value={item.productName}
                />
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-fg font-medium">{item.productName}</p>
                      {xmlImport ? (
                        <Badge variant={imported ? "secondary" : "outline"}>
                          {imported
                            ? matchLabel(imported.match.method)
                            : "Não localizado no XML"}
                        </Badge>
                      ) : null}
                    </div>
                    {/* Sem recebimento anterior, no celular repete o pendente. */}
                    <p
                      className={`text-fg-subtle text-xs ${item.receivedQuantity > 0 ? "" : "max-sm:hidden"}`}
                    >
                      Pedido {QTY.format(item.requestedQuantity)}{" "}
                      {item.purchaseUnit}
                      {item.receivedQuantity > 0
                        ? ` · já recebido ${QTY.format(item.receivedQuantity)}`
                        : ""}
                    </p>
                  </div>
                  <p className="text-fg-muted text-sm">
                    Pendente{" "}
                    <strong>
                      {QTY.format(item.pendingQuantity)} {item.purchaseUnit}
                    </strong>
                    {" · "}combinado{" "}
                    <strong>
                      {MONEY.format(item.agreedPrice)}/{item.pricingUnit}
                    </strong>
                  </p>
                </div>
                {imported ? (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-fg-muted text-xs">
                      Na nota:{" "}
                      {imported.xmlItems
                        .map((xmlItem) => xmlItem.description)
                        .join(", ")}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={unmatching === item.id}
                      onClick={() => void unmatchItem(item.id, imported)}
                    >
                      {unmatching === item.id
                        ? "Desfazendo…"
                        : "Não é este produto"}
                    </Button>
                  </div>
                ) : null}
                {!imported && (xmlImport?.documents.length ?? 0) > 1 ? (
                  <div className="mb-3 max-w-md">
                    <label
                      htmlFor={`xml_${item.id}`}
                      className="text-fg-muted mb-1 block text-xs"
                    >
                      NF-e de origem, caso este produto tenha chegado
                    </label>
                    <ThemedSelect
                      id={`xml_${item.id}`}
                      name={`xml_${item.id}`}
                      defaultValue=""
                      emptyOptionLabel="Não veio nesta entrega"
                      options={xmlImport!.documents.map((document) => ({
                        value: document.nfe.accessKey!,
                        label: `NF-e ${document.nfe.number} · ${document.nfe.issuer.name ?? "emitente não identificado"}`,
                      }))}
                    />
                  </div>
                ) : null}
                <div
                  key={itemVersions[item.id] ?? 0}
                  className={`grid gap-3 ${item.sameUnit ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
                >
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`log_${item.id}`}
                      className="text-fg-muted text-xs"
                    >
                      Recebido ({item.purchaseUnit})
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Diminuir ${item.productName}`}
                        onClick={() => passo(item, -1)}
                        className={STEP_BUTTON}
                      >
                        <Minus className="size-4" aria-hidden />
                      </button>
                      <Input
                        id={`log_${item.id}`}
                        name={`log_${item.id}`}
                        inputMode="decimal"
                        defaultValue={decimalInput(imported?.logisticQuantity)}
                        placeholder={`de ${QTY.format(item.pendingQuantity)}`}
                        className="h-8 max-sm:text-center max-sm:font-semibold max-sm:tabular-nums sm:placeholder:text-transparent"
                      />
                      <button
                        type="button"
                        aria-label={`Aumentar ${item.productName}`}
                        onClick={() => {
                          passo(item, 1);
                          navigator.vibrate?.(30);
                        }}
                        className={STEP_BUTTON}
                      >
                        <Plus className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                  {porEmbalagem(item) && !totalDigitado.has(item.id) ? (
                    <PecasPorEmbalagem
                      item={item}
                      imported={imported}
                      conta={embalagens[item.id]}
                      onDigitarTotal={() =>
                        setTotalDigitado((atual) => new Set(atual).add(item.id))
                      }
                    />
                  ) : !item.sameUnit ? (
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`prec_${item.id}`}
                        className="text-fg-muted text-xs"
                      >
                        Precificação ({item.pricingUnit})
                      </label>
                      <Input
                        id={`prec_${item.id}`}
                        name={`prec_${item.id}`}
                        inputMode="decimal"
                        defaultValue={
                          totalDigitado.has(item.id)
                            ? decimalInput(
                                embalagens[item.id]
                                  ? multiplicar(
                                      embalagens[item.id].recebido,
                                      embalagens[item.id].porEmbalagem,
                                    )
                                  : imported?.pricingQuantity,
                              )
                            : decimalInput(imported?.pricingQuantity)
                        }
                        className="h-8"
                      />
                      {porEmbalagem(item) ? (
                        <button
                          type="button"
                          onClick={() =>
                            setTotalDigitado((atual) => {
                              const proximo = new Set(atual);
                              proximo.delete(item.id);
                              return proximo;
                            })
                          }
                          className="text-primary self-start text-xs font-medium"
                        >
                          Calcular por {item.purchaseUnit}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-[auto_1fr] items-center gap-x-1.5 gap-y-1">
                    <label
                      htmlFor={`preco_${item.id}`}
                      className="text-fg-muted col-span-2 text-xs"
                    >
                      Preço da nota
                    </label>
                    {/* O checkbox precisa vir ANTES do campo, como irmão: é
                        assim que o `peer-checked` enxerga o estado dele.
                        Marcado, a action ignora o preço digitado e grava o
                        combinado, marcado como a confirmar. */}
                    <input
                      type="checkbox"
                      id={`semnota_${item.id}`}
                      name={`semnota_${item.id}`}
                      className="peer"
                    />
                    <label
                      htmlFor={`semnota_${item.id}`}
                      className="text-fg-muted text-xs"
                    >
                      Sem a nota agora (confirmar o preço depois)
                    </label>
                    <Input
                      id={`preco_${item.id}`}
                      name={`preco_${item.id}`}
                      inputMode="decimal"
                      defaultValue={decimalInput(
                        imported?.practicedPrice ?? item.agreedPrice,
                      )}
                      className="col-span-2 h-8 peer-checked:pointer-events-none peer-checked:opacity-40"
                    />
                  </div>
                </div>
                {item.sameUnit ? (
                  <p className="text-fg-subtle mt-2 text-xs max-sm:hidden">
                    A quantidade usada no valor é a mesma recebida, pois compra
                    e precificação estão em {item.purchaseUnit}.
                  </p>
                ) : null}
                {imported?.conversionNotes.length ? (
                  <div className="bg-primary/5 text-fg-muted mt-3 rounded-md px-3 py-2 text-xs">
                    {imported.conversionNotes.map((note) => (
                      <p key={note}>{note}</p>
                    ))}
                  </div>
                ) : null}
                {imported?.appliedConversions
                  .filter((applied) => applied.rule.mode === "fixed_factor")
                  .map((applied) => (
                    <ConversionFix
                      key={`${applied.targetKind}:${applied.rule.xmlUnit}`}
                      receiptId={receiptId}
                      orderItemId={item.id}
                      applied={applied}
                      targetUnit={
                        applied.targetKind === "purchase"
                          ? item.purchaseUnit
                          : item.pricingUnit
                      }
                      xmlItems={imported.xmlItems}
                      onApply={(rule) => applyConversion(item, rule)}
                    />
                  ))}
                {imported?.manualConfirmationRequired ? (
                  <label className="border-warning/40 bg-warning/5 text-fg mt-3 flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-xs">
                    <input
                      type="hidden"
                      name={`manual_required_${item.id}`}
                      value="1"
                    />
                    <input
                      type="checkbox"
                      name={`manual_confirm_${item.id}`}
                      required
                      className="border-input mt-0.5 size-4 rounded"
                    />
                    <span>
                      Confirmo a quantidade física informada acima. Ela não veio
                      no XML e precisa ser conferida na entrega.
                    </span>
                  </label>
                ) : null}
                {imported?.associationDoubt ? (
                  <label className="border-warning/40 bg-warning/5 text-fg mt-3 flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-xs">
                    <input
                      type="hidden"
                      name={`assoc_required_${item.id}`}
                      value="1"
                    />
                    <input
                      type="checkbox"
                      name={`assoc_confirm_${item.id}`}
                      className="border-input mt-0.5 size-4 rounded"
                    />
                    <span>
                      Confirmo que{" "}
                      <strong>
                        {imported.xmlItems
                          .map((xmlItem) => xmlItem.description)
                          .join(", ")}
                      </strong>{" "}
                      é {item.productName}. O preço está longe demais do
                      combinado; se não for o mesmo produto, use “Não é este
                      produto” acima.
                    </span>
                  </label>
                ) : null}
                {imported?.warnings.length ? (
                  <div className="bg-warning-soft text-warning mt-3 flex items-start gap-2 rounded-md px-3 py-2 text-xs">
                    <AlertTriangle
                      className="mt-0.5 size-3.5 shrink-0"
                      aria-hidden
                    />
                    <div>
                      {imported.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
                {notesOpen.has(item.id) ? null : (
                  <button
                    type="button"
                    onClick={() =>
                      setNotesOpen((current) => new Set(current).add(item.id))
                    }
                    className="text-primary mt-2 flex items-center gap-1.5 text-xs sm:hidden"
                  >
                    <MessageSquareText className="size-3" aria-hidden />
                    Adicionar observação
                  </button>
                )}
                <Input
                  name={`obs_${item.id}`}
                  maxLength={200}
                  placeholder="Observação do produto (opcional)"
                  className={`mt-3 h-8 ${notesOpen.has(item.id) ? "" : "max-sm:hidden"}`}
                />
              </div>
            );
          })}
        </section>

        <div className="empty:hidden max-sm:order-3">
          <ErrorLine error={unmatchError ?? state.error} />
        </div>
        {/* No celular a barra cola na borda de baixo: a `main` tem 24px de
            respiro, que o `sticky` respeitaria; o `-bottom-6` e o `-mb-6`
            compensam, como na tela do pedido. */}
        <div className="border-border bg-surface sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 shadow-lg max-sm:order-4 max-sm:-bottom-6 max-sm:-mx-4 max-sm:-mb-6 max-sm:gap-2 max-sm:rounded-none max-sm:border-x-0 max-sm:border-b-0 max-sm:px-4 max-sm:pt-2.5">
          <p className="text-fg-muted text-xs tabular-nums sm:hidden">
            {filledCount} de {items.length}{" "}
            {items.length === 1 ? "item" : "itens"} com quantidade ·{" "}
            {MONEY.format(calculatedTotal)}
          </p>
          <p className="text-fg-subtle text-xs max-sm:hidden">
            Se ainda houver saldo, o pedido ficará parcialmente recebido e
            aceitará uma nova chegada depois. Preço diferente ou excesso abre
            divergência automaticamente.
          </p>
          <Submit />
        </div>
      </form>
    </div>
  );
}

/**
 * "Quantas peças vêm em cada embalagem", com a conta à vista logo abaixo.
 *
 * O total de peças vai num campo oculto `prec_`, que o formulário recalcula a
 * cada toque — para o servidor, nada muda. "Digitar o total" volta ao campo
 * antigo, para a caixa que veio incompleta.
 */
function PecasPorEmbalagem({
  item,
  imported,
  conta,
  onDigitarTotal,
}: {
  item: Item;
  imported: NfeImportPayload["items"][string] | undefined;
  conta: { recebido: number; porEmbalagem: number } | undefined;
  onDigitarTotal: () => void;
}) {
  const sugerido = pecasPorEmbalagemSugeridas(item, imported);
  const recebidoInicial = imported?.logisticQuantity ?? 0;
  const { recebido, porEmbalagem: porEmb } = conta ?? {
    recebido: recebidoInicial,
    porEmbalagem: sugerido ?? 0,
  };
  const total = recebido > 0 && porEmb > 0 ? multiplicar(recebido, porEmb) : 0;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`emb_${item.id}`} className="text-fg-muted text-xs">
        Quantidade por {item.purchaseUnit} ({item.pricingUnit})
      </label>
      <Input
        id={`emb_${item.id}`}
        name={`emb_${item.id}`}
        inputMode="decimal"
        defaultValue={decimalInput(sugerido)}
        placeholder={`${item.pricingUnit} em cada ${item.purchaseUnit}`}
        className="h-8"
      />
      {/* Controlado: em campo oculto o React regrava o valor a cada render, e
          um `defaultValue` apagaria a conta feita no `recalculate`. */}
      <input
        type="hidden"
        name={`prec_${item.id}`}
        value={total > 0 ? decimalInput(total) : ""}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="text-fg-muted tabular-nums" aria-live="polite">
          {total > 0 ? (
            <>
              Total: {QTY.format(recebido)} × {QTY.format(porEmb)} ={" "}
              <strong className="text-fg">
                {QTY.format(total)} {item.pricingUnit}
              </strong>
            </>
          ) : (
            `Total em ${item.pricingUnit} sai do recebido vezes esta quantidade`
          )}
        </span>
        <button
          type="button"
          onClick={onDigitarTotal}
          className="text-primary font-medium"
        >
          Digitar o total
        </button>
      </div>
    </div>
  );
}
