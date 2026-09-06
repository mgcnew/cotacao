"use client";

import { Building2, Camera, Info } from "lucide-react";
import * as React from "react";

import { CompanyAvatar } from "@/components/company/company-avatar";
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
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  updateCompanyProfile,
  type UpdateCompanyProfileState,
} from "@/features/company/actions";
import { companyAssetUrl } from "@/features/company/assets";
import { formatCnpj, onlyDigits } from "@/features/company/cnpj";
import type { CompanyMembership } from "@/lib/auth/dal";

const INITIAL_STATE: UpdateCompanyProfileState = { ok: false, error: null };

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (São Paulo)" },
  { value: "America/Manaus", label: "Manaus" },
  { value: "America/Cuiaba", label: "Cuiabá" },
  { value: "America/Rio_Branco", label: "Rio Branco" },
  { value: "America/Noronha", label: "Fernando de Noronha" },
];

export function CompanyProfileDialog({
  company,
  open,
  onOpenChange,
}: {
  company: CompanyMembership;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, pending] = React.useActionState(
    updateCompanyProfile,
    INITIAL_STATE,
  );
  const storedLogo = companyAssetUrl(company.companyLogoPath);
  const [preview, setPreview] = React.useState<string | null>(storedLogo);
  const [removeLogo, setRemoveLogo] = React.useState(false);
  const [documentNumber, setDocumentNumber] = React.useState(
    company.companyDocumentNumber
      ? formatCnpj(company.companyDocumentNumber)
      : "",
  );
  const temporaryPreview = React.useRef<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(
    () => () => {
      if (temporaryPreview.current)
        URL.revokeObjectURL(temporaryPreview.current);
    },
    [],
  );

  function previewFile(file: File | undefined) {
    if (temporaryPreview.current) URL.revokeObjectURL(temporaryPreview.current);
    temporaryPreview.current = file ? URL.createObjectURL(file) : null;
    if (file) setRemoveLogo(false);
    setPreview(temporaryPreview.current ?? storedLogo);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      if (temporaryPreview.current)
        URL.revokeObjectURL(temporaryPreview.current);
      temporaryPreview.current = null;
      setPreview(storedLogo);
      setRemoveLogo(false);
      setDocumentNumber(
        company.companyDocumentNumber
          ? formatCnpj(company.companyDocumentNumber)
          : "",
      );
    }
    onOpenChange(nextOpen);
  }

  const documentChanged =
    onlyDigits(documentNumber) !==
    onlyDigits(company.companyDocumentNumber ?? "");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Perfil da empresa</DialogTitle>
          <DialogDescription>
            Identificação usada no sistema, nos pedidos e nos links enviados.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="contents">
          <DialogBody className="flex flex-col gap-5">
            <section className="flex items-center gap-4">
              <CompanyAvatar
                name={company.companyName}
                logoPath={null}
                className="border-border bg-surface-sunken size-16 rounded-xl border text-lg"
                previewUrl={preview}
              />
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="company-logo"
                  className="text-fg flex items-center gap-1.5 text-sm font-medium"
                >
                  <Camera className="size-4" aria-hidden />
                  Logotipo ou foto
                </label>
                <Input
                  ref={fileInput}
                  id="company-logo"
                  name="logo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="mt-1.5 h-9 py-1"
                  onChange={(event) => previewFile(event.target.files?.[0])}
                />
                <p className="text-fg-subtle mt-1 text-xs">
                  JPG, PNG ou WebP, com no máximo 2 MB.
                </p>
                {company.companyLogoPath ? (
                  <label className="text-fg-muted mt-2 flex w-fit items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      name="removeLogo"
                      checked={removeLogo}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setRemoveLogo(checked);
                        if (checked) {
                          if (fileInput.current) fileInput.current.value = "";
                          previewFile(undefined);
                          setPreview(null);
                        } else {
                          setPreview(storedLogo);
                        }
                      }}
                    />
                    Remover imagem atual
                  </label>
                ) : null}
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label
                  htmlFor="company-name"
                  className="text-fg text-sm font-medium"
                >
                  Nome exibido
                </label>
                <Input
                  id="company-name"
                  name="name"
                  defaultValue={company.companyName}
                  required
                  maxLength={120}
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label
                  htmlFor="company-legal-name"
                  className="text-fg text-sm font-medium"
                >
                  Razão social{" "}
                  <span className="text-fg-subtle">(opcional)</span>
                </label>
                <Input
                  id="company-legal-name"
                  name="legalName"
                  defaultValue={company.companyLegalName ?? ""}
                  maxLength={160}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="company-document"
                  className="text-fg text-sm font-medium"
                >
                  CNPJ <span className="text-fg-subtle">(opcional)</span>
                </label>
                <Input
                  id="company-document"
                  name="documentNumber"
                  value={documentNumber}
                  onChange={(event) => setDocumentNumber(event.target.value)}
                  inputMode="numeric"
                  maxLength={18}
                  placeholder="00.000.000/0000-00"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="company-timezone"
                  className="text-fg text-sm font-medium"
                >
                  Fuso horário
                </label>
                <ThemedSelect
                  id="company-timezone"
                  name="timezone"
                  defaultValue={company.companyTimezone}
                  options={TIMEZONES}
                  required
                />
              </div>
            </div>

            {documentChanged ? (
              <label className="border-warning/30 bg-warning-soft text-fg-muted flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs">
                <input
                  type="checkbox"
                  name="confirmDocumentChange"
                  aria-required="true"
                  className="mt-0.5"
                />
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Confirmo a alteração do CNPJ. Esta confirmação é obrigatória,
                  pois as próximas importações de XML serão validadas com o novo
                  documento.
                </span>
              </label>
            ) : null}

            {state.error ? (
              <p
                role="alert"
                className="bg-destructive-soft text-destructive rounded-lg px-3 py-2 text-sm"
              >
                {state.error}
              </p>
            ) : null}
            {state.ok ? (
              <p
                role="status"
                className="bg-success-soft text-success rounded-lg px-3 py-2 text-sm"
              >
                Perfil atualizado. A identificação do sistema já foi renovada.
              </p>
            ) : null}
          </DialogBody>

          <DialogFooter className="justify-between">
            <span className="text-fg-subtle hidden items-center gap-1.5 text-xs sm:flex">
              <Building2 className="size-3.5" aria-hidden />
              {company.roleName}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                disabled={pending}
              >
                Fechar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando…" : "Salvar perfil"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
