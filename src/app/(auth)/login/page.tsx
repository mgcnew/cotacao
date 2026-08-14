import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signIn } from "@/lib/auth/actions";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Entrar</CardTitle>
        <CardDescription>Acesse sua conta para continuar.</CardDescription>
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
