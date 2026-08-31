import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";

import { CotaProLogo } from "@/components/brand/cotapro-logo";
import { CreateCompanyForm } from "@/components/company/create-company-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signOut } from "@/lib/auth/actions";
import { getMemberships, requireUser } from "@/lib/auth/dal";

/**
 * Último passo do cadastro: quem já tem conta mas ainda não tem empresa cria a
 * sua aqui. Quem já pertence a alguma empresa não tem o que fazer nesta tela.
 */
export default async function OnboardingPage() {
  const user = await requireUser();
  const memberships = await getMemberships();

  if (memberships.length > 0) {
    redirect("/dashboard");
  }

  return (
    <div className="bg-surface-sunken flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <CotaProLogo compact />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crie sua empresa</CardTitle>
            <CardDescription>
              Falta só este passo para começar a comprar. Entrando como{" "}
              {user.email}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CreateCompanyForm />
            <form action={signOut}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-fg-muted w-full gap-1.5 font-normal"
              >
                <LogOut className="size-3.5" aria-hidden />
                Sair
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
