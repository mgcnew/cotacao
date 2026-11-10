"use client";

import {
  ArrowLeft,
  Check,
  Copy,
  Flag,
  Link2,
  Lock,
  LockOpen,
  MoreVertical,
  Pencil,
  RefreshCw,
  RotateCcw,
  ScanBarcode,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";

import { CrumbTitle } from "@/components/layout/app-breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import {
  BarcodeCameraDialog,
  type BarcodeScanOutcome,
} from "@/components/shopping-list/barcode-camera-dialog";
import {
  indexProducts,
  parseQuantity,
  searchProducts,
} from "@/components/shopping-list/mobile-quick-add";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import { avisar } from "@/components/ui/toaster";
import {
  addCountEntry,
  deleteCountEntry,
  deleteStockCount,
  removeCountItem,
  renameStockCount,
  restartCountItem,
  rotateStockCountLink,
  setCountItemRecount,
  setCountItemUnit,
  setStockCountStatus,
} from "@/features/stock-counts/actions";
import {
  buildCountMessage,
  describeLocations,
  formatCountQuantity,
  itemTotal,
  sortCountItems,
} from "@/features/stock-counts/message";
import type {
  CountItem,
  CountProduct,
  CountUnit,
} from "@/features/stock-counts/queries";
import { barcodeMatches } from "@/features/products/barcodes";
import { cn } from "@/lib/utils";

/** Os cantos de toda loja; os que a pessoa digitar entram na frente. */
const LOCAIS_PADRAO = ["Geladeira", "Estoque", "Gôndola", "Depósito"];

type CountInfo = {
  id: string;
  name: string | null;
  title: string;
  dateLabel: string;
  author: string | null;
  status: "open" | "closed";
  /** Link público, só leitura, que vai no fim da mensagem. */
  publicUrl: string;
};

type Target = { product: CountProduct } | null;

/**
 * A contagem, inteira no cliente.
 *
 * Os lançamentos moram aqui e vão ao servidor um a um, sem refazer a página:
 * quem conta uma gôndola digita número atrás de número e não pode esperar. O
 * id do lançamento nasce na tela, então dá para apagar um que ainda nem
 * chegou ao banco. Se o servidor recusar, o lançamento sai da lista e o aviso
 * diz o porquê.
 *
 * O catálogo chega como promessa e só é esperado dentro da busca: a lista do
 * que já foi contado aparece sem esperar mil produtos.
 */
export function CountWorkspace({
  count,
  initialItems,
  products,
  units,
  lastUnits,
  defaultUnitId,
  canManage,
}: {
  count: CountInfo;
  initialItems: CountItem[];
  products: Promise<CountProduct[]>;
  units: CountUnit[];
  lastUnits: Record<string, string>;
  defaultUnitId: string | null;
  canManage: boolean;
}) {
  const [items, setItems] = React.useState(initialItems);
  const [target, setTarget] = React.useState<Target>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [location, setLocation] = React.useState("");
  const editable = canManage && count.status === "open";

  const unitById = React.useMemo(
    () => new Map(units.map((unit) => [unit.id, unit])),
    [units],
  );
  const symbol = (unitId: string) => unitById.get(unitId)?.symbol ?? "";

  const locations = React.useMemo(() => {
    const used = items.flatMap((item) =>
      item.entries.flatMap((entry) => (entry.location ? [entry.location] : [])),
    );
    return [...new Set([...used, ...LOCAIS_PADRAO])];
  }, [items]);

  const sorted = React.useMemo(() => sortCountItems(items), [items]);

  function openProduct(product: CountProduct) {
    setTarget({ product });
    setSheetOpen(true);
  }

  function openSearch() {
    setTarget(null);
    setSheetOpen(true);
  }

  function addEntry(product: CountProduct, unitId: string, quantity: number) {
    const entry = {
      id: crypto.randomUUID(),
      quantity,
      location: location.trim() || null,
      createdAt: new Date().toISOString(),
    };
    setItems((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current.map((item) =>
          item === existing
            ? { ...item, needsRecount: false, entries: [...item.entries, entry] }
            : item,
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          category: product.category,
          unitId,
          needsRecount: false,
          entries: [entry],
        },
      ];
    });
    navigator.vibrate?.(30);

    void addCountEntry({
      countId: count.id,
      entryId: entry.id,
      productId: product.id,
      unitId,
      quantity,
      location: entry.location ?? "",
    })
      .catch(() => ({ error: "Sem conexão. O lançamento não foi salvo." }))
      .then((result) => {
        if (!result.error) return;
        dropEntry(product.id, entry.id);
        avisar(`${product.name}: ${result.error}`);
      });
  }

  function dropEntry(productId: string, entryId: string) {
    setItems((current) =>
      current.flatMap((item) => {
        if (item.productId !== productId) return [item];
        const entries = item.entries.filter((entry) => entry.id !== entryId);
        // Marcado para recontar fica na lista mesmo sem lançamento.
        return entries.length > 0 || item.needsRecount
          ? [{ ...item, entries }]
          : [];
      }),
    );
  }

  function deleteEntry(item: CountItem, entryId: string) {
    const before = items;
    dropEntry(item.productId, entryId);
    void deleteCountEntry(count.id, entryId)
      .catch(() => ({ error: "Sem conexão. O lançamento continua." }))
      .then((result) => {
        if (!result.error) return;
        setItems(before);
        avisar(result.error);
      });
  }

  function changeUnit(item: CountItem, unitId: string) {
    const before = items;
    setItems((current) =>
      current.map((other) =>
        other.productId === item.productId ? { ...other, unitId } : other,
      ),
    );
    void setCountItemUnit(count.id, item.productId, unitId)
      .catch(() => ({ error: "Sem conexão. A unidade não mudou." }))
      .then((result) => {
        if (!result.error) return;
        setItems(before);
        avisar(result.error);
      });
  }

  function toggleRecount(item: CountItem) {
    const before = items;
    const needsRecount = !item.needsRecount;
    setItems((current) =>
      current.map((other) =>
        other.productId === item.productId ? { ...other, needsRecount } : other,
      ),
    );
    void setCountItemRecount(count.id, item.productId, needsRecount)
      .catch(() => ({ error: "Sem conexão. A marcação não mudou." }))
      .then((result) => {
        if (!result.error) return;
        setItems(before);
        avisar(result.error);
      });
  }

  function restartItem(item: CountItem) {
    const before = items;
    setItems((current) =>
      current.map((other) =>
        other.productId === item.productId
          ? { ...other, needsRecount: true, entries: [] }
          : other,
      ),
    );
    void restartCountItem(count.id, item.productId)
      .catch(() => ({ error: "Sem conexão. Os lançamentos continuam." }))
      .then((result) => {
        if (!result.error) return;
        setItems(before);
        avisar(result.error);
      });
  }

  function removeItem(item: CountItem) {
    const before = items;
    setItems((current) =>
      current.filter((other) => other.productId !== item.productId),
    );
    setSheetOpen(false);
    void removeCountItem(count.id, item.productId)
      .catch(() => ({ error: "Sem conexão. O produto continua na contagem." }))
      .then((result) => {
        if (!result.error) return;
        setItems(before);
        avisar(result.error);
      });
  }

  const message = buildCountMessage({
    title: count.title,
    dateLabel: count.dateLabel,
    author: count.author,
    items: items.map((item) => ({
      name: item.name,
      category: item.category,
      unit: symbol(item.unitId),
      entries: item.entries,
    })),
    link: count.publicUrl,
  });

  const counted = items.filter((item) => item.entries.length > 0).length;
  const totalLabel =
    counted === 1 ? "1 produto contado" : `${counted} produtos contados`;
  const toRecount = items.filter((item) => item.needsRecount).length;

  return (
    <div className="w-full pb-4">
      <CrumbTitle title={count.title} />
      <PageHeader
        title={count.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{count.dateLabel}</span>
            <span aria-hidden>·</span>
            <span>{totalLabel}</span>
            {toRecount > 0 ? (
              <span className="bg-warning-soft text-warning inline-flex items-center gap-1 rounded-sm px-1.5 text-xs font-medium">
                <Flag className="size-3" aria-hidden />
                {toRecount === 1 ? "1 para recontar" : `${toRecount} para recontar`}
              </span>
            ) : null}
            {count.status === "closed" ? (
              <span className="bg-surface-muted text-fg-muted inline-flex items-center gap-1 rounded-sm px-1.5 text-xs">
                <Lock className="size-3" aria-hidden /> Finalizada
              </span>
            ) : null}
          </span>
        }
        action={
          <CountMenu count={count} canManage={canManage} message={message} />
        }
      />

      {editable ? (
        <SearchBar
          onOpen={openSearch}
          products={products}
          onScan={openProduct}
        />
      ) : null}

      {sorted.length === 0 ? (
        <div className="border-border bg-surface text-fg-muted flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <span className="bg-surface-muted text-fg-subtle grid size-12 place-items-center rounded-2xl">
            <ScanBarcode className="size-6" aria-hidden />
          </span>
          <p className="text-sm">
            {editable
              ? "Busque um produto ou bipe o código para lançar a primeira contagem."
              : "Nenhum produto foi contado."}
          </p>
        </div>
      ) : (
        <ul
          aria-label="Produtos contados"
          className="border-border bg-surface overflow-hidden rounded-xl border shadow-xs"
        >
          {sorted.map((item) => (
            <ItemRow
              key={item.productId}
              item={item}
              unit={symbol(item.unitId)}
              onOpen={
                editable
                  ? () =>
                      openProduct({
                        id: item.productId,
                        name: item.name,
                        category: item.category,
                        barcodes: [],
                      })
                  : undefined
              }
            />
          ))}
        </ul>
      )}

      {sorted.length > 0 ? (
        <ShareBlock
          count={count}
          canManage={canManage}
          message={message}
          totalLabel={totalLabel}
        />
      ) : null}

      {editable ? (
        <CountSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          target={target}
          onTarget={setTarget}
          products={products}
          items={items}
          units={units}
          unitFor={(productId) =>
            items.find((item) => item.productId === productId)?.unitId ??
            lastUnits[productId] ??
            defaultUnitId ??
            units[0]?.id ??
            ""
          }
          symbol={symbol}
          locations={locations}
          location={location}
          onLocation={setLocation}
          onAdd={addEntry}
          onDeleteEntry={deleteEntry}
          onChangeUnit={changeUnit}
          onRemoveItem={removeItem}
          onToggleRecount={toggleRecount}
          onRestartItem={restartItem}
        />
      ) : null}
    </div>
  );
}

function ItemRow({
  item,
  unit,
  onOpen,
}: {
  item: CountItem;
  unit: string;
  onOpen?: () => void;
}) {
  const waiting = item.entries.length === 0;
  const content = (
    <>
      <span className="min-w-0 flex-1">
        {item.needsRecount ? (
          <span className="text-warning mb-0.5 flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase">
            <Flag className="size-3" aria-hidden /> Recontar
          </span>
        ) : null}
        <span className="text-fg line-clamp-2 text-sm leading-snug font-semibold">
          {item.name}
        </span>
        <span className="text-fg-subtle mt-0.5 block truncate text-xs">
          {waiting
            ? "Lançamentos zerados, aguardando a recontagem"
            : describeLocations(item.entries).join(" + ")}
        </span>
      </span>
      <span className="text-fg shrink-0 text-right text-base font-semibold tabular-nums">
        {waiting ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          <>
            {formatCountQuantity(itemTotal(item.entries))}
            <span className="text-fg-muted ml-1 text-xs font-normal">{unit}</span>
          </>
        )}
      </span>
    </>
  );

  return (
    <li
      className={cn(
        "border-border border-b last:border-b-0",
        item.needsRecount &&
          "bg-warning-soft/60 shadow-[inset_3px_0_0_var(--color-warning)]",
      )}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="active:bg-surface-muted hover:bg-surface-muted flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
        >
          {content}
        </button>
      ) : (
        <div className="flex min-h-16 items-center gap-3 px-4 py-2.5">
          {content}
        </div>
      )}
    </li>
  );
}

/**
 * A barra de busca do topo e a câmera.
 *
 * No celular ela gruda no alto ao rolar, como na lista de compras: a `main`
 * tem 24px de respiro, e o `-top-6`/`pt-6`/`-mt-5` devolvem a posição.
 */
function SearchBar({
  onOpen,
  products,
  onScan,
}: {
  onOpen: () => void;
  products: Promise<CountProduct[]>;
  onScan: (product: CountProduct) => void;
}) {
  return (
    <div className="bg-background sticky -top-6 z-20 -mx-4 -mt-5 mb-1 flex gap-2 px-4 pt-6 pb-3 sm:static sm:mx-0 sm:mt-0 sm:mb-3 sm:p-0">
      <button
        type="button"
        onClick={onOpen}
        className="border-input bg-input-bg text-fg-muted active:bg-surface-muted flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3.5 text-left text-base shadow-xs sm:h-10 sm:max-w-md sm:text-sm"
      >
        <Search className="text-fg-subtle size-4 shrink-0" aria-hidden />
        <span className="truncate">Buscar produto para contar</span>
      </button>
      <React.Suspense
        fallback={
          <span className="bg-surface-muted size-12 shrink-0 rounded-xl sm:size-10" />
        }
      >
        <ScanButton
          products={products}
          onScan={onScan}
          className="size-12 rounded-xl pointer-coarse:size-12 sm:size-10"
        />
      </React.Suspense>
    </div>
  );
}

function ScanButton({
  products,
  onScan,
  className,
}: {
  products: Promise<CountProduct[]>;
  onScan: (product: CountProduct) => void;
  className?: string;
}) {
  const catalog = React.use(products);

  function handleScan(code: string): BarcodeScanOutcome {
    const product = catalog.find((candidate) =>
      barcodeMatches(candidate.barcodes, code),
    );
    if (!product) {
      return {
        ok: false,
        message: `O código ${code} não está vinculado a nenhum produto cadastrado.`,
      };
    }
    // Fecha a câmera primeiro: a folha de contagem abre por cima da página.
    window.setTimeout(() => onScan(product), 0);
    return { ok: true, label: product.name };
  }

  return (
    <BarcodeCameraDialog
      onDetected={handleScan}
      successVibrationMs={40}
      triggerClassName={className}
    />
  );
}

/**
 * A folha de contagem: busca e, escolhido o produto, o lançamento.
 *
 * Duas vistas na mesma caixa, para o vai e vem entre produtos não abrir e
 * fechar telas. Depois de lançar ela volta à busca limpa, pronta para o
 * próximo — o local escolhido fica, porque quem conta a geladeira conta a
 * geladeira inteira antes de ir para o estoque.
 */
function CountSheet({
  open,
  onOpenChange,
  target,
  onTarget,
  products,
  items,
  units,
  unitFor,
  symbol,
  locations,
  location,
  onLocation,
  onAdd,
  onDeleteEntry,
  onChangeUnit,
  onRemoveItem,
  onToggleRecount,
  onRestartItem,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: Target;
  onTarget: (target: Target) => void;
  products: Promise<CountProduct[]>;
  items: CountItem[];
  units: CountUnit[];
  unitFor: (productId: string) => string;
  symbol: (unitId: string) => string;
  locations: string[];
  location: string;
  onLocation: (value: string) => void;
  onAdd: (product: CountProduct, unitId: string, quantity: number) => void;
  onDeleteEntry: (item: CountItem, entryId: string) => void;
  onChangeUnit: (item: CountItem, unitId: string) => void;
  onRemoveItem: (item: CountItem) => void;
  onToggleRecount: (item: CountItem) => void;
  onRestartItem: (item: CountItem) => void;
}) {
  const [query, setQuery] = React.useState("");

  function handleOpenChange(next: boolean) {
    if (next) setQuery("");
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md" alturaEstavel>
        {target ? (
          <EntryView
            key={target.product.id}
            product={target.product}
            item={items.find((item) => item.productId === target.product.id)}
            units={units}
            unitId={unitFor(target.product.id)}
            symbol={symbol}
            locations={locations}
            location={location}
            onLocation={onLocation}
            onBack={() => onTarget(null)}
            onAdd={(unitId, quantity) => {
              onAdd(target.product, unitId, quantity);
              setQuery("");
              onTarget(null);
            }}
            onDeleteEntry={onDeleteEntry}
            onChangeUnit={onChangeUnit}
            onRemoveItem={onRemoveItem}
            onToggleRecount={onToggleRecount}
            onRestartItem={onRestartItem}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Contar produto</DialogTitle>
              <DialogDescription className="sr-only">
                Busque o produto pelo nome ou pelo código de barras e toque nele
                para lançar a quantidade.
              </DialogDescription>
            </DialogHeader>
            <React.Suspense
              fallback={
                <p className="text-fg-muted px-4 py-10 text-center text-sm">
                  Carregando produtos…
                </p>
              }
            >
              <SearchView
                products={products}
                items={items}
                symbol={symbol}
                query={query}
                onQuery={setQuery}
                onPick={(product) => onTarget({ product })}
              />
            </React.Suspense>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SearchView({
  products,
  items,
  symbol,
  query,
  onQuery,
  onPick,
}: {
  products: Promise<CountProduct[]>;
  items: CountItem[];
  symbol: (unitId: string) => string;
  query: string;
  onQuery: (value: string) => void;
  onPick: (product: CountProduct) => void;
}) {
  const catalog = React.use(products);
  const index = React.useMemo(() => indexProducts(catalog), [catalog]);
  const results = searchProducts(index, query);
  const byProduct = new Map(items.map((item) => [item.productId, item]));

  function handleScan(code: string): BarcodeScanOutcome {
    const product = catalog.find((candidate) =>
      barcodeMatches(candidate.barcodes, code),
    );
    if (!product) {
      return {
        ok: false,
        message: `O código ${code} não está vinculado a nenhum produto cadastrado.`,
      };
    }
    window.setTimeout(() => onPick(product), 0);
    return { ok: true, label: product.name };
  }

  return (
    <>
      <div className="border-border flex shrink-0 gap-2 border-b px-4 py-3">
        <div className="relative min-w-0 flex-1">
          <Search
            className="text-fg-subtle pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            value={query}
            autoFocus
            onChange={(event) => onQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              // Leitor físico manda o código e um Enter: vai direto ao produto.
              if (results[0]) onPick(results[0]);
            }}
            role="searchbox"
            aria-label="Buscar produto"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            placeholder="Nome ou código de barras"
            className="border-input bg-input-bg text-fg placeholder:text-fg-subtle focus:border-ring focus:ring-ring/30 h-12 w-full rounded-xl border pr-11 pl-10 text-base outline-none focus:ring-3"
          />
          {query ? (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => onQuery("")}
              className="text-fg-subtle active:text-fg absolute top-1/2 right-0.5 grid size-11 -translate-y-1/2 place-items-center"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <BarcodeCameraDialog
          onDetected={handleScan}
          successVibrationMs={40}
          triggerClassName="size-12 rounded-xl pointer-coarse:size-12"
        />
      </div>

      <DialogBody className="p-0">
        {query.trim() ? (
          results.length > 0 ? (
            <ul aria-label="Produtos encontrados">
              {results.map((product) => {
                const item = byProduct.get(product.id);
                return (
                  <li
                    key={product.id}
                    className="border-border border-b last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => onPick(product)}
                      className="active:bg-surface-muted hover:bg-surface-muted flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="text-fg line-clamp-2 text-sm leading-snug font-medium">
                          {product.name}
                        </span>
                        <span className="text-fg-subtle block truncate text-xs">
                          {product.category}
                        </span>
                      </span>
                      {item?.needsRecount ? (
                        <span className="bg-warning-soft text-warning shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold">
                          Recontar
                        </span>
                      ) : item ? (
                        <span className="bg-primary-soft text-primary shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums">
                          {formatCountQuantity(itemTotal(item.entries))}{" "}
                          {symbol(item.unitId)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-fg-muted px-4 py-10 text-center text-sm">
              Nenhum produto com “{query.trim()}”. Confira a grafia ou tente
              parte do nome.
            </p>
          )
        ) : (
          <div className="text-fg-muted flex flex-col items-center gap-3 px-8 py-12 text-center">
            <span className="bg-surface-muted text-fg-subtle grid size-12 place-items-center rounded-2xl">
              <ScanBarcode className="size-6" aria-hidden />
            </span>
            <p className="text-sm">
              Digite o nome do produto ou toque na câmera para bipar o código.
            </p>
          </div>
        )}
      </DialogBody>
    </>
  );
}

function EntryView({
  product,
  item,
  units,
  unitId: initialUnitId,
  symbol,
  locations,
  location,
  onLocation,
  onBack,
  onAdd,
  onDeleteEntry,
  onChangeUnit,
  onRemoveItem,
  onToggleRecount,
  onRestartItem,
}: {
  product: CountProduct;
  item: CountItem | undefined;
  units: CountUnit[];
  unitId: string;
  symbol: (unitId: string) => string;
  locations: string[];
  location: string;
  onLocation: (value: string) => void;
  onBack: () => void;
  onAdd: (unitId: string, quantity: number) => void;
  onDeleteEntry: (item: CountItem, entryId: string) => void;
  onChangeUnit: (item: CountItem, unitId: string) => void;
  onRemoveItem: (item: CountItem) => void;
  onToggleRecount: (item: CountItem) => void;
  onRestartItem: (item: CountItem) => void;
}) {
  // Produto novo: a unidade é escolha local até o primeiro lançamento. Já
  // contado: a unidade é do item e trocar vale para todos os lançamentos.
  const [draftUnitId, setDraftUnitId] = React.useState(initialUnitId);
  const unitId = item?.unitId ?? draftUnitId;
  const [text, setText] = React.useState("");
  const [otherLocation, setOtherLocation] = React.useState(
    location !== "" && !locations.includes(location),
  );
  // Campo vazio não é zero: o zero se lança digitando 0 ou pelo "Zerado".
  const quantity = text.trim() ? parseQuantity(text) : null;
  const valid = quantity !== null;
  const total = item ? itemTotal(item.entries) : 0;
  const unit = symbol(unitId);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || !unitId) return;
    onAdd(unitId, quantity);
  }

  return (
    <>
      <DialogHeader>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar para a busca"
            className="text-fg-muted active:bg-surface-muted hover:bg-surface-muted -ml-2 grid size-10 shrink-0 place-items-center rounded-lg"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </button>
          <div className="min-w-0">
            <DialogTitle className="line-clamp-2 leading-snug">
              {product.name}
            </DialogTitle>
            <DialogDescription>
              {!item
                ? "Ainda não contado nesta contagem"
                : item.entries.length === 0
                  ? "Recontando: lance o número novo"
                  : `Contado até agora: ${formatCountQuantity(total)} ${unit}`}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={submit} className="contents">
        <DialogBody className="flex flex-col gap-5">
          {item?.needsRecount ? (
            <RecountPanel
              item={item}
              onRestart={() => onRestartItem(item)}
              onUnmark={() => onToggleRecount(item)}
            />
          ) : null}

          <div className="flex flex-col gap-2">
            <span className="text-fg-muted text-xs font-medium">Onde</span>
            <div className="flex flex-wrap gap-2">
              {locations.map((option) => {
                const active = !otherLocation && location === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setOtherLocation(false);
                      onLocation(active ? "" : option);
                    }}
                    className={cn(
                      "h-10 rounded-full border px-4 text-sm transition-colors",
                      active
                        ? "border-primary bg-primary-soft text-primary font-medium"
                        : "border-border bg-surface text-fg-muted active:bg-surface-muted",
                    )}
                  >
                    {option}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={otherLocation}
                onClick={() => {
                  setOtherLocation(true);
                  onLocation("");
                }}
                className={cn(
                  "h-10 rounded-full border border-dashed px-4 text-sm transition-colors",
                  otherLocation
                    ? "border-primary bg-primary-soft text-primary font-medium"
                    : "border-border text-fg-muted active:bg-surface-muted",
                )}
              >
                Outro…
              </button>
            </div>
            {otherLocation ? (
              <Input
                value={location}
                onChange={(event) => onLocation(event.target.value)}
                maxLength={60}
                placeholder="Ex.: Câmara fria"
                aria-label="Nome do local"
                className="h-11 text-base"
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="count-quantity"
              className="text-fg-muted text-xs font-medium"
            >
              Quantidade
            </label>
            <div className="flex gap-2">
              <input
                id="count-quantity"
                value={text}
                onChange={(event) => setText(event.target.value)}
                inputMode="decimal"
                enterKeyHint="done"
                autoComplete="off"
                autoFocus
                placeholder="0"
                className="border-input bg-input-bg text-fg placeholder:text-fg-subtle focus:border-ring focus:ring-ring/30 h-14 min-w-0 flex-1 rounded-xl border px-4 text-2xl font-semibold tabular-nums outline-none focus:ring-3"
              />
              <div className="w-28 shrink-0">
                <ThemedSelect
                  id="count-unit"
                  ariaLabel="Unidade da contagem"
                  value={unitId}
                  onValueChange={(next) => {
                    if (!next) return;
                    if (item) onChangeUnit(item, next);
                    else setDraftUnitId(next);
                  }}
                  options={units.map((option) => ({
                    value: option.id,
                    label: option.symbol,
                  }))}
                  className="h-14 rounded-xl pointer-coarse:h-14 text-base"
                />
              </div>
            </div>
            {item && item.entries.length > 0 && valid ? (
              <p className="text-fg-muted text-xs">
                Novo total: {formatCountQuantity(total + quantity)} {unit}
              </p>
            ) : null}
          </div>

          {item && item.entries.length > 0 ? (
            <section aria-label="Lançamentos" className="flex flex-col gap-2">
              <h3 className="text-fg-muted text-xs font-medium">
                Lançamentos ({item.entries.length})
              </h3>
              <ul className="border-border overflow-hidden rounded-xl border">
                {item.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="border-border flex items-center gap-3 border-b py-1 pr-1 pl-4 last:border-b-0"
                  >
                    <span className="text-fg-muted min-w-0 flex-1 truncate text-sm">
                      {entry.location ?? "Sem local"}
                    </span>
                    <span className="text-fg text-sm font-semibold tabular-nums">
                      {formatCountQuantity(entry.quantity)} {unit}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteEntry(item, entry.id)}
                      aria-label={`Apagar lançamento de ${formatCountQuantity(entry.quantity)} ${unit}${entry.location ? ` em ${entry.location}` : ""}`}
                      className="text-fg-subtle active:text-destructive hover:text-destructive grid size-10 place-items-center"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {item ? (
            <div className="flex flex-wrap items-center justify-between gap-x-4">
              {!item.needsRecount ? (
                <button
                  type="button"
                  onClick={() => onToggleRecount(item)}
                  className="text-warning flex items-center gap-1.5 py-2 text-xs font-medium"
                >
                  <Flag className="size-3.5" aria-hidden /> Marcar para
                  recontar
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onRemoveItem(item)}
                className="text-destructive flex items-center gap-1.5 py-2 text-xs"
              >
                <Trash2 className="size-3.5" aria-hidden /> Tirar produto da
                contagem
              </button>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter className="flex-nowrap pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
          {/* "Procurei e não tem": um toque, sem digitar. O produto entra na
              conferência com 0 em vez de ficar de fora, o que não diria se
              foi contado ou esquecido. */}
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={!unitId}
            onClick={() => onAdd(unitId, 0)}
            className="h-12 shrink-0 text-base"
          >
            Zerado
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={!valid || !unitId}
            className="h-12 min-w-0 flex-1 text-base"
          >
            <Check aria-hidden />
            <span className="truncate">
              {valid
                ? `Lançar ${formatCountQuantity(quantity)} ${unit}${location.trim() ? ` em ${location.trim()}` : ""}`
                : "Lançar"}
            </span>
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/**
 * O aviso do produto marcado. Com lançamentos, oferece zerar antes de contar
 * de novo — somar a recontagem ao número antigo dobraria o produto.
 */
function RecountPanel({
  item,
  onRestart,
  onUnmark,
}: {
  item: CountItem;
  onRestart: () => void;
  onUnmark: () => void;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const entries = item.entries.length;

  return (
    <div className="border-warning/40 bg-warning-soft flex flex-col gap-3 rounded-xl border p-3.5">
      <p className="text-fg flex items-start gap-2 text-sm">
        <Flag className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {entries > 0
            ? "Marcado para recontar. Zere os lançamentos antigos e conte de novo."
            : "Lançamentos zerados. O próximo número tira a marcação."}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {entries > 0 ? (
          confirming ? (
            <Button
              type="button"
              variant="destructive"
              className="h-11 flex-1 sm:h-9"
              onClick={onRestart}
            >
              <RotateCcw aria-hidden /> Apagar{" "}
              {entries === 1 ? "1 lançamento" : `${entries} lançamentos`}
            </Button>
          ) : (
            <Button
              type="button"
              className="h-11 flex-1 sm:h-9"
              onClick={() => setConfirming(true)}
            >
              <RotateCcw aria-hidden /> Recontar do zero
            </Button>
          )
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="h-11 sm:h-9"
          onClick={onUnmark}
        >
          Desmarcar
        </Button>
      </div>
    </div>
  );
}

/** Abre o WhatsApp com o texto pronto; o contato a pessoa escolhe lá. */
function whatsappHref(message: string) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

async function copy(message: string, done = "Texto da contagem copiado") {
  try {
    await navigator.clipboard.writeText(message);
    avisar(done);
  } catch {
    avisar("Não foi possível copiar neste navegador");
  }
}

function ShareBlock({
  count,
  canManage,
  message,
  totalLabel,
}: {
  count: CountInfo;
  canManage: boolean;
  message: string;
  totalLabel: string;
}) {
  const [pending, startTransition] = React.useTransition();

  return (
    <section
      aria-label="Fechamento"
      className="border-border bg-surface mt-4 flex flex-col gap-3 rounded-xl border p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-fg-muted text-sm">
        {totalLabel}. Cada produto leva o próprio total.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {canManage && count.status === "open" ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            className="h-11 sm:h-9"
            onClick={() =>
              startTransition(async () => {
                const result = await setStockCountStatus(count.id, "closed");
                if (result.error) avisar(result.error);
              })
            }
          >
            <Lock aria-hidden /> {pending ? "Finalizando…" : "Finalizar"}
          </Button>
        ) : null}
        <Button asChild className="h-11 sm:h-9">
          <a href={whatsappHref(message)} target="_blank" rel="noreferrer">
            <Send aria-hidden /> Compartilhar no WhatsApp
          </a>
        </Button>
      </div>
    </section>
  );
}

function CountMenu({
  count,
  canManage,
  message,
}: {
  count: CountInfo;
  canManage: boolean;
  message: string;
}) {
  const [pending, startTransition] = React.useTransition();
  const [renaming, setRenaming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [rotating, setRotating] = React.useState(false);

  return (
    <>
      <Button asChild variant="outline" size="sm" className="h-10 sm:h-8">
        <a href={whatsappHref(message)} target="_blank" rel="noreferrer">
          <Send aria-hidden /> WhatsApp
        </a>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            aria-label="Mais ações da contagem"
            className="size-10 sm:size-8"
          >
            <MoreVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onSelect={() => void copy(message)}>
            <Copy aria-hidden /> Copiar texto
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void copy(count.publicUrl, "Link da lista copiado")}
          >
            <Link2 aria-hidden /> Copiar link da lista
          </DropdownMenuItem>
          {canManage ? (
            <>
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                <Pencil aria-hidden /> Renomear
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setRotating(true)}>
                <RefreshCw aria-hidden /> Trocar link da lista
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  startTransition(async () => {
                    const result = await setStockCountStatus(
                      count.id,
                      count.status === "open" ? "closed" : "open",
                    );
                    if (result.error) avisar(result.error);
                  })
                }
              >
                {count.status === "open" ? (
                  <>
                    <Lock aria-hidden /> Finalizar contagem
                  </>
                ) : (
                  <>
                    <LockOpen aria-hidden /> Reabrir para lançar
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeleting(true)}
              >
                <Trash2 aria-hidden /> Excluir contagem
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {canManage ? (
        <>
          <RenameDialog
            count={count}
            open={renaming}
            onOpenChange={setRenaming}
          />
          <DeleteDialog
            count={count}
            open={deleting}
            onOpenChange={setDeleting}
          />
          <RotateLinkDialog
            count={count}
            open={rotating}
            onOpenChange={setRotating}
          />
        </>
      ) : null}
    </>
  );
}

function RenameDialog({
  count,
  open,
  onOpenChange,
}: {
  count: CountInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = React.useState(count.name ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(count.name ?? "");
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Renomear contagem</DialogTitle>
          <DialogDescription>
            Em branco, ela volta a se chamar pela data.
          </DialogDescription>
        </DialogHeader>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await renameStockCount(count.id, name);
              if (result.error) setError(result.error);
              else onOpenChange(false);
            });
          }}
        >
          <DialogBody className="flex flex-col gap-1.5">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              aria-label="Nome da contagem"
              placeholder="Ex.: Bebidas — geladeiras do fundo"
              className="h-11 text-base sm:h-9 sm:text-sm"
            />
            {error ? (
              <p role="alert" className="text-destructive text-xs">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              type="submit"
              disabled={pending}
              className="h-11 w-full sm:h-9 sm:w-auto"
            >
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  count,
  open,
  onOpenChange,
}: {
  count: CountInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Excluir contagem?</DialogTitle>
          <DialogDescription>
            “{count.title}” e todos os lançamentos dela somem de vez. Não dá
            para desfazer.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <DialogBody>
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          </DialogBody>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            className="h-11 w-full sm:h-9 sm:w-auto"
            onClick={() =>
              startTransition(async () => {
                const result = await deleteStockCount(count.id);
                if (result?.error) setError(result.error);
              })
            }
          >
            <Trash2 aria-hidden /> {pending ? "Excluindo…" : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Trocar o link é para quando ele foi parar onde não devia. */
function RotateLinkDialog({
  count,
  open,
  onOpenChange,
}: {
  count: CountInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = React.useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Trocar link da lista?</DialogTitle>
          <DialogDescription>
            O link que já foi enviado para de abrir na hora. As próximas
            mensagens saem com o novo.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            disabled={pending}
            className="h-11 w-full sm:h-9 sm:w-auto"
            onClick={() =>
              startTransition(async () => {
                const result = await rotateStockCountLink(count.id);
                if (result.error) {
                  avisar(result.error);
                  return;
                }
                avisar("Link trocado. O anterior não abre mais.");
                onOpenChange(false);
              })
            }
          >
            <RefreshCw aria-hidden /> {pending ? "Trocando…" : "Trocar link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
