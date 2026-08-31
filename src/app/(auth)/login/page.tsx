import Link from "next/link";
import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signIn } from "@/lib/auth/actions";

export const metadata: Metadata = {
  title: "Entrar | CotaPro",
  description: "Acesse sua operação de compras.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;

  return (
    <Card className="border-border bg-surface gap-5 border py-5 shadow-sm ring-0">
      <CardHeader>
        <CardTitle className="text-xl font-semibold tracking-tight">
          Bem-vindo de volta
        </CardTitle>
        <CardDescription>
          Entre para continuar sua operação de compras.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AuthForm action={signIn} mode="signin" next={next} />
        <p className="text-fg-muted text-center text-sm">
          Não tem conta?{" "}
          <Link href="/signup" className="text-primary font-medium">
            Criar agora
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
