"use client";

import { AlertCircle } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuthFormState } from "@/lib/auth/actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Aguarde…" : label}
    </Button>
  );
}

type Props = {
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  mode: "signin" | "signup";
  next?: string;
};

export function AuthForm({ action, mode, next }: Props) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(action, {
    error: null,
  });

  const isSignUp = mode === "signup";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {isSignUp ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fullName" className="text-fg text-sm font-medium">
            Nome
          </label>
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            required
            placeholder="Como você se chama"
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-fg text-sm font-medium">
          E-mail
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@empresa.com.br"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-fg text-sm font-medium">
          Senha
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          required
          minLength={isSignUp ? 8 : undefined}
          placeholder={isSignUp ? "Ao menos 8 caracteres" : "••••••••"}
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="bg-destructive-soft text-destructive flex items-start gap-2 rounded-md px-3 py-2 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <SubmitButton label={isSignUp ? "Criar conta" : "Entrar"} />
    </form>
  );
}
