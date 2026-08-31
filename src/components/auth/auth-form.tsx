"use client";

import { AlertCircle } from "lucide-react";
import { useActionState, useEffect, useRef, type FormEvent } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuthFormState } from "@/lib/auth/actions";

const REMEMBERED_EMAIL_KEY = "cotapro.auth.remembered-email";

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
  const emailRef = useRef<HTMLInputElement>(null);
  const rememberEmailRef = useRef<HTMLInputElement>(null);
  const [state, formAction] = useActionState<AuthFormState, FormData>(action, {
    error: null,
  });

  const isSignUp = mode === "signup";

  useEffect(() => {
    if (isSignUp) return;

    try {
      const rememberedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (!rememberedEmail) return;

      if (emailRef.current) emailRef.current.value = rememberedEmail;
      if (rememberEmailRef.current) rememberEmailRef.current.checked = true;
    } catch {
      // Alguns navegadores bloqueiam o armazenamento local no modo privado.
      // Nesse caso, o login continua funcionando normalmente, só sem memória.
    }
  }, [isSignUp]);

  function rememberEmail(event: FormEvent<HTMLFormElement>) {
    if (isSignUp) return;

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email");
    const shouldRemember = formData.get("rememberEmail") === "on";

    try {
      if (shouldRemember && typeof email === "string" && email.trim()) {
        window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
      } else {
        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
    } catch {
      // A autenticação não depende da disponibilidade do localStorage.
    }
  }

  return (
    <form
      action={formAction}
      onSubmit={rememberEmail}
      className="flex flex-col gap-4"
    >
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
          ref={emailRef}
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

      {!isSignUp ? (
        <label className="text-fg-muted -mt-1 flex w-fit cursor-pointer items-center gap-2 text-xs">
          <input
            ref={rememberEmailRef}
            type="checkbox"
            name="rememberEmail"
            className="border-border bg-input-bg accent-primary size-3.5 rounded border"
            onChange={(event) => {
              if (event.currentTarget.checked) return;
              try {
                window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
              } catch {
                // O campo continua utilizável mesmo sem armazenamento local.
              }
            }}
          />
          Lembrar meu e-mail neste dispositivo
        </label>
      ) : null}

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
