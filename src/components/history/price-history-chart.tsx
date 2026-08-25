"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MONEY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export type PriceHistoryPoint = {
  date: string;
  supplier: string;
  price: number;
};

export function PriceHistoryChart({ points }: { points: PriceHistoryPoint[] }) {
  if (points.length < 2) return null;

  const data = points.map((point) => ({
    ...point,
    label: new Date(point.date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }),
  }));

  return (
    <section className="border-border bg-surface mb-5 rounded-xl border p-4">
      <h3 className="text-fg text-sm font-semibold">Evolução do preço</h3>
      <p className="text-fg-muted mb-4 text-xs">
        Último preço negociado de cada proposta no período selecionado.
      </p>
      <div className="h-64 w-full" role="img" aria-label="Evolução dos preços cotados">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--fg-subtle)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: "var(--fg-subtle)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={72}
              tickFormatter={(value: number) => MONEY.format(value)}
            />
            <Tooltip
              formatter={(value) => MONEY.format(Number(value))}
              labelFormatter={(_, payload) => {
                const point = payload[0]?.payload as
                  | (PriceHistoryPoint & { label: string })
                  | undefined;
                return point ? `${point.label} · ${point.supplier}` : "";
              }}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "0.75rem",
                color: "var(--fg)",
                fontSize: "0.75rem",
              }}
            />
            <Line
              type="monotone"
              dataKey="price"
              name="Preço"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--primary)" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
