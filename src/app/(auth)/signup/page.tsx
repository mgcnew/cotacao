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
import { signUp } from "@/lib/auth/actions";

export const metadata: Metadata = {
  title: "Criar conta | CotaPro",
  description: "Crie sua conta e configure sua operação de compras.",
};

export default function SignUpPage() {
  return (
    <Card className="border-border bg-surface gap-5 border py-5 shadow-sm ring-0">
      <CardHeader>
        <CardTitle className="text-xl font-semibold tracking-tight">
          Comece sua operação
        </CardTitle>
        <CardDescription>
          No passo seguinte você cria sua empresa e já começa a usar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AuthForm action={signUp} mode="signup" />
        <p className="text-fg-muted text-center text-sm">
          Já tem conta?{" "}
          <Link href="/login" className="text-primary font-medium">
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
