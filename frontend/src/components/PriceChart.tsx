import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchHistory, HistoryPoint } from "../api";

interface Props {
  ticker: string;
  period: string;
  interval: string;
}

export function PriceChart({ ticker, period, interval }: Props) {
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchHistory(ticker, period, interval, 250)
      .then((res) => {
        if (!cancelled) setPoints(res.points);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, period, interval]);

  if (loading) return <div className="summary">Loading chart…</div>;
  if (error) return <div className="error">{error}</div>;
  if (!points.length) return null;

  return (
    <div style={{ width: "100%", height: 360 }}>
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="#232b4a" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            stroke="#8d96b2"
            minTickGap={40}
            tick={{ fontSize: 11 }}
          />
          <YAxis stroke="#8d96b2" tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{
              background: "#131a30",
              border: "1px solid #232b4a",
              borderRadius: 8,
            }}
            labelStyle={{ color: "#e6e9f2" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#4f8cff"
            dot={false}
            name="Close"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="sma_50"
            stroke="#22c55e"
            dot={false}
            name="SMA 50"
            strokeWidth={1.2}
          />
          <Line
            type="monotone"
            dataKey="sma_200"
            stroke="#eab308"
            dot={false}
            name="SMA 200"
            strokeWidth={1.2}
          />
          <Line
            type="monotone"
            dataKey="bb_upper"
            stroke="#a855f7"
            dot={false}
            name="BB Upper"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
          <Line
            type="monotone"
            dataKey="bb_lower"
            stroke="#a855f7"
            dot={false}
            name="BB Lower"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
