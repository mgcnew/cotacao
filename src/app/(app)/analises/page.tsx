import { BarChart3 } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireActiveCompany } from "@/lib/auth/dal";

const PERSPECTIVAS = [
  {
    titulo: "Preços",
    texto:
      "Preço cotado, negociado e realizado por produto e fornecedor, com média, variação e tendência.",
  },
  {
    titulo: "Economia",
    texto:
      "Economia negociada, economia realizada e taxa de captura — quanto do desconto negociado chegou de fato à nota.",
  },
  {
    titulo: "Fornecedores",
    texto:
      "Competitividade, taxa de resposta, cumprimento de preço, entregas no prazo e divergências.",
  },
];

export default async function AnalisesPage() {
  await requireActiveCompany();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Análises"
        description="O Dashboard mostra a situação; aqui explicamos o comportamento."
      />

      <EmptyState
        icon={BarChart3}
        title="Sem dados para analisar ainda"
        description="As análises são derivadas de dados transacionais reais: respostas, negociações, pedidos e recebimentos. Elas ganham sentido depois que o primeiro ciclo de compra fechar."
        phase="Fase 14 · Análises"
      />

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {PERSPECTIVAS.map((p) => (
          <Card key={p.titulo}>
            <CardHeader>
              <CardTitle className="text-sm">{p.titulo}</CardTitle>
              <CardDescription>{p.texto}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>
    </div>
  );
}
