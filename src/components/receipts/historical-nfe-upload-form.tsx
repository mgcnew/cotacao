"use client";

import {
  AlertCircle,
  CheckCircle2,
  FileText,
  FileUp,
  LoaderCircle,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { uploadHistoricalNfe } from "@/features/receipts/historical-actions";

type QueuedXml = {
  id: string;
  file: File;
  status: "ready" | "uploading" | "success" | "error";
  error: string | null;
  importId: string | null;
};

function fileId(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function HistoricalNfeUploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<QueuedXml[]>([]);
  const [isPending, startTransition] = useTransition();
  const importableCount = files.filter(
    (item) => item.status === "ready" || item.status === "error",
  ).length;

  function addFiles(selectedFiles: FileList | null) {
    if (!selectedFiles?.length) return;
    setFiles((current) => {
      const known = new Set(current.map((item) => item.id));
      const additions = Array.from(selectedFiles)
        .filter((file) => !known.has(fileId(file)))
        .map((file) => ({
          id: fileId(file),
          file,
          status: "ready" as const,
          error: null,
          importId: null,
        }));
      return [...current, ...additions];
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  function updateFile(id: string, changes: Partial<QueuedXml>) {
    setFiles((current) =>
      current.map((item) =>
        item.id === id ? { ...item, ...changes } : item,
      ),
    );
  }

  function importFiles() {
    const queue = files.filter(
      (item) => item.status === "ready" || item.status === "error",
    );
    if (!queue.length) return;

    startTransition(async () => {
      for (const item of queue) {
        updateFile(item.id, {
          status: "uploading",
          error: null,
          importId: null,
        });
        try {
          const formData = new FormData();
          formData.set("file", item.file);
          const result = await uploadHistoricalNfe(formData);
          updateFile(item.id, {
            status: result.error ? "error" : "success",
            error: result.error,
            importId: result.importId,
          });
        } catch {
          updateFile(item.id, {
            status: "error",
            error: "A conexão falhou durante o envio. Tente novamente.",
            importId: null,
          });
        }
      }
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        importFiles();
      }}
      className="border-border bg-surface rounded-xl border p-4 sm:p-5"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="bg-primary-soft text-primary grid size-9 shrink-0 place-items-center rounded-lg">
          <FileUp className="size-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-fg font-semibold">Adicionar NF-e antiga</h2>
          <p className="text-fg-muted mt-1 text-sm">
            Selecione uma ou várias notas. A data de emissão será preservada e
            cada XML ficará disponível para conciliação.
          </p>
        </div>
      </div>
      <label className="text-fg-muted flex flex-col gap-1.5 text-sm">
        Arquivo XML autorizado
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept=".xml,application/xml,text/xml"
          multiple
          disabled={isPending}
          onChange={(event) => addFiles(event.currentTarget.files)}
          className="border-input bg-background text-fg file:bg-primary-solid file:text-primary-solid-fg h-10 w-full min-w-0 rounded-lg border px-2 py-1 text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-xs file:font-medium"
        />
      </label>

      {files.length ? (
        <ul className="border-border mt-4 divide-y rounded-lg border">
          {files.map((item) => (
            <li
              key={item.id}
              className="flex min-w-0 items-start gap-2.5 px-3 py-2.5 sm:gap-3"
            >
              {item.status === "uploading" ? (
                <LoaderCircle
                  className="text-primary mt-0.5 size-4 shrink-0 animate-spin"
                  aria-hidden
                />
              ) : item.status === "success" ? (
                <CheckCircle2
                  className="text-success mt-0.5 size-4 shrink-0"
                  aria-hidden
                />
              ) : item.status === "error" ? (
                <AlertCircle
                  className="text-destructive mt-0.5 size-4 shrink-0"
                  aria-hidden
                />
              ) : (
                <FileText
                  className="text-fg-muted mt-0.5 size-4 shrink-0"
                  aria-hidden
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-fg truncate text-sm font-medium">
                  {item.file.name}
                </p>
                {item.status === "uploading" ? (
                  <p className="text-fg-muted text-xs">Importando…</p>
                ) : item.status === "success" && item.importId ? (
                  <Link
                    href={`/recebimentos/historico/${item.importId}`}
                    className="text-success text-xs font-medium hover:underline"
                  >
                    Importado — conciliar agora
                  </Link>
                ) : item.error ? (
                  <p className="text-destructive text-xs" role="alert">
                    {item.error}
                  </p>
                ) : (
                  <p className="text-fg-subtle text-xs">Pronto para importar</p>
                )}
              </div>
              {item.status !== "uploading" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remover ${item.file.name} da lista`}
                  onClick={() =>
                    setFiles((current) =>
                      current.filter((candidate) => candidate.id !== item.id),
                    )
                  }
                >
                  <X aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending || importableCount === 0}>
          {isPending ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <FileUp aria-hidden />
          )}
          {isPending
            ? "Importando notas…"
            : `Importar ${importableCount || ""} ${importableCount === 1 ? "XML" : "XMLs"}`}
        </Button>
        {files.some((item) => item.status === "success") && !isPending ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setFiles((current) =>
                current.filter((item) => item.status !== "success"),
              )
            }
          >
            Limpar concluídos
          </Button>
        ) : null}
        <span className="sr-only" role="status" aria-live="polite">
          {isPending
            ? "Importação em andamento"
            : `${files.filter((item) => item.status === "success").length} arquivos importados`}
        </span>
      </div>
    </form>
  );
}
