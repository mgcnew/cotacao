import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Protótipo e runtime gerado do Claude Design: referência visual, não
    // entra no build nem segue as regras do projeto.
    "design/**",
    // Tipos gerados a partir do schema Supabase.
    "src/types/database.ts",
  ]),
]);

export default eslintConfig;
