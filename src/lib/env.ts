import { z } from "zod";

/**
 * Em arquivo .env, `VAR=` é a forma usual de dizer "não configurado".
 * Sem isto, uma linha vazia falha a validação como se tivesse valor inválido.
 */
function unset(value: string | undefined): string | undefined {
  return value && value.trim() !== "" ? value : undefined;
}

/**
 * Variáveis públicas — disponíveis no browser.
 * Precisam ser referenciadas literalmente como process.env.X para o Next inlinar.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    error: "NEXT_PUBLIC_SUPABASE_URL deve ser uma URL válida",
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY é obrigatória"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

/**
 * O endereço público da aplicação — o que vai no link do fornecedor.
 *
 * Errar aqui não quebra nada visivelmente: a tela abre, o link é gerado, e só
 * quem recebe descobre que ele aponta para `localhost`. Por isso a Vercel entra
 * como rede de segurança. `VERCEL_PROJECT_PRODUCTION_URL` é o domínio estável
 * do projeto; `VERCEL_URL` é o desta implantação, usado nas prévias.
 *
 * Nenhuma das duas chega ao browser (falta o prefixo NEXT_PUBLIC_), e não
 * precisa: o link só é montado no servidor.
 */
function enderecoPublico(): string | undefined {
  const explicito = unset(process.env.NEXT_PUBLIC_APP_URL);
  if (explicito) return explicito;

  const daVercel =
    unset(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    unset(process.env.VERCEL_URL);
  return daVercel ? `https://${daVercel}` : undefined;
}

export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: enderecoPublico(),
});

/**
 * Segredos — somente servidor.
 *
 * SUPABASE_SECRET_KEY ignora RLS por completo. Só pode ser lido dentro de
 * route handlers / server actions, nunca em componente que vá para o cliente.
 * A checagem abaixo falha ruidosamente se alguém importar isto no browser.
 */
const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z
    .string()
    .min(1, "SUPABASE_SECRET_KEY é obrigatória no servidor"),
  EVOLUTION_API_URL: z.url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_INSTANCE: z.string().optional(),
  EVOLUTION_WEBHOOK_SECRET: z.string().min(24).optional(),
  CRON_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error(
      "getServerEnv() foi chamado no browser. Segredos do servidor não podem vazar para o cliente.",
    );
  }
  cachedServerEnv ??= serverEnvSchema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    EVOLUTION_API_URL: unset(process.env.EVOLUTION_API_URL),
    EVOLUTION_API_KEY: unset(process.env.EVOLUTION_API_KEY),
    EVOLUTION_INSTANCE: unset(process.env.EVOLUTION_INSTANCE),
    EVOLUTION_WEBHOOK_SECRET: unset(process.env.EVOLUTION_WEBHOOK_SECRET),
    CRON_SECRET: unset(process.env.CRON_SECRET),
  });
  return cachedServerEnv;
}
