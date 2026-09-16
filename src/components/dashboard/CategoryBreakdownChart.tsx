"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORIES } from "@/lib/data/categories";
import { useMapFocus } from "@/hooks/useMapFocus";
import type { Category } from "@/lib/types";

export function CategoryBreakdownChart({
  data,
}: {
  data: { category: Category; count: number }[];
}) {
  const focus = useMapFocus();
  const chartData = data.map((d) => ({
    name: CATEGORIES[d.category].shortLabel,
    count: d.count,
    color: CATEGORIES[d.category].color,
    category: d.category,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
        <CartesianGrid stroke="#1c2330" horizontal={false} />
        <XAxis type="number" stroke="#8993a4" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          stroke="#8993a4"
          fontSize={11}
          width={70}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{
            background: "#10141d",
            border: "1px solid #1c2330",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar
          dataKey="count"
          radius={[0, 6, 6, 0]}
          cursor="pointer"
          onClick={(bar) => {
            const { category } = (bar.payload ?? {}) as { category?: Category };
            if (category) focus({ kind: "category", value: category });
          }}
        >
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
