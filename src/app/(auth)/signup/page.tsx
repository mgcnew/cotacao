import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signUp } from "@/lib/auth/actions";

export default function SignUpPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Criar conta</CardTitle>
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
