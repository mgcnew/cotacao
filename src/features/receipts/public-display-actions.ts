"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { getPermissions, requireActiveCompany, requireUser } from "@/lib/auth/dal";
import { publicEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export type ReceivingDisplayLinkActionState = {
  error: string | null;
  message?: string;
  url?: string;
  savedAt?: number;
};

async function requireManager() {
  const [company, user] = await Promise.all([
    requireActiveCompany(),
    requireUser(),
  ]);
  const permissions = await getPermissions(company.companyId);
  if (!permissions.has("role.manage")) return null;
  return { company, user };
}

export async function generateReceivingDisplayLink(
  _previous: ReceivingDisplayLinkActionState,
  _formData: FormData,
): Promise<ReceivingDisplayLinkActionState> {
  void _previous;
  void _formData;
  const context = await requireManager();
  if (!context) {
    return {
      error: "Somente um administrador pode gerar este link.",
      savedAt: Date.now(),
    };
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  let service: ReturnType<typeof createServiceRoleClient>;
  try {
    service = createServiceRoleClient();
  } catch (cause) {
    console.error("[generateReceivingDisplayLink] service role indisponível:", cause);
    return {
      error: "O servidor está sem a chave administrativa do Supabase.",
      savedAt: Date.now(),
    };
  }

  const { error } = await service.rpc(
    "rpc_service_rotate_receiving_display_link",
    {
      p_company_id: context.company.companyId,
      p_created_by: context.user.id,
      p_token_hash: tokenHash,
    },
  );

  if (error) {
    return {
      error: `Não foi possível gerar o link: ${error.message}`,
      savedAt: Date.now(),
    };
  }

  revalidatePath("/configuracoes");
  return {
    error: null,
    message: "Link gerado. O anterior, se existia, foi revogado.",
    url: `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/r/${rawToken}`,
    savedAt: Date.now(),
  };
}

export async function revokeReceivingDisplayLink(
  _previous: ReceivingDisplayLinkActionState,
  _formData: FormData,
): Promise<ReceivingDisplayLinkActionState> {
  void _previous;
  void _formData;
  const context = await requireManager();
  if (!context) {
    return {
      error: "Somente um administrador pode revogar este link.",
      savedAt: Date.now(),
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "rpc_revoke_receiving_display_link",
    { p_company_id: context.company.companyId },
  );

  if (error) {
    return {
      error: `Não foi possível revogar o link: ${error.message}`,
      savedAt: Date.now(),
    };
  }

  revalidatePath("/configuracoes");
  return {
    error: null,
    message: data ? "Acesso revogado imediatamente." : "Não havia um link ativo.",
    savedAt: Date.now(),
  };
}
