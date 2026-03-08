import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ReferenceLine } from "recharts";

const MODELS = {
  ECMWF: { color: "#00d4ff", label: "ECMWF" },
  GFS: { color: "#ff6b35", label: "GFS" },
  ICON: { color: "#a8ff3e", label: "ICON" }
};

function generateForecast(baseWind, divergenceLevel, seed) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return hours.map(h => {
    const base = baseWind + Math.sin(h * 0.4 + seed) * 8 + Math.cos(h * 0.2) * 4;
    const noise = (Math.sin(h * 13.7 + seed * 7.3) * divergenceLevel);
    return Math.max(0, base + noise);
  });
}

function calcDivergence(forecasts) {
  const hours = 24;
  let totalDiv = 0;
  for (let h = 0; h < hours; h++) {
    const vals = forecasts.map(f => f[h]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / vals.length;
    totalDiv += Math.sqrt(variance);
  }
  return totalDiv / hours;
}

function buildChartData(forecasts) {
  return Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, "0")}:00`,
    ECMWF: +forecasts[0][h].toFixed(1),
    GFS: +forecasts[1][h].toFixed(1),
    ICON: +forecasts[2][h].toFixed(1),
  }));
}

function buildVolatilityData(divergence) {
  return Array.from({ length: 24 }, (_, h) => {
    const base = 40 + divergence * 8;
    const spike = divergence > 4 && (h > 7 && h < 10 || h > 17 && h < 21)
      ? divergence * 25 * Math.abs(Math.sin(h * 0.9))
      : divergence * 5 * Math.abs(Math.sin(h * 1.2));
    return {
      hour: `${String(h).padStart(2, "0")}:00`,
      price: +(base + spike + (Math.sin(h * 3.1 + divergence) * 10)).toFixed(0),
      upper: +(base + spike * 1.4 + 15).toFixed(0),
      lower: Math.max(0, +(base + spike * 0.6 - 15).toFixed(0)),
    };
  });
}

const NervousnessGauge = ({ score }) => {
  const pct = Math.min(100, (score / 8) * 100);
  const color = pct < 33 ? "#a8ff3e" : pct < 66 ? "#ffd700" : "#ff3e3e";
  const label = pct < 33 ? "CALM" : pct < 66 ? "TENSE" : "VOLATILE";

  return (
    <div style={{ textAlign: "center", padding: "8px 0" }}>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#555", letterSpacing: 3, marginBottom: 8 }}>MODEL DIVERGENCE INDEX</div>
      <div style={{ position: "relative", width: 180, height: 90, margin: "0 auto" }}>
        <svg width="180" height="90" viewBox="0 0 180 90">
          <path d="M 10 80 A 80 80 0 0 1 170 80" fill="none" stroke="#1a1a1a" strokeWidth="12" strokeLinecap="round" />
          <path
            d="M 10 80 A 80 80 0 0 1 170 80"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 251} 251`}
            style={{ transition: "stroke-dasharray 0.8s ease, stroke 0.8s ease" }}
          />
          <circle cx={10 + (160 * pct) / 100 * Math.cos(Math.PI - (pct / 100) * Math.PI) * -1 + 80} cy={80 - Math.sin((pct / 100) * Math.PI) * 80} r="5" fill={color} style={{ transition: "all 0.8s ease" }} />
        </svg>
        <div style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", textAlign: "center" }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 28, fontWeight: 700, color, lineHeight: 1, transition: "color 0.8s ease" }}>{score.toFixed(1)}</div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color, letterSpacing: 4, marginTop: 2, transition: "color 0.8s ease" }}>{label}</div>
        </div>
      </div>
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0d0d0d", border: "1px solid #222", padding: "8px 12px", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
      <div style={{ color: "#555", marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color }}>{p.dataKey}: {p.value} {p.dataKey === "price" || p.dataKey === "upper" || p.dataKey === "lower" ? "€/MWh" : "MW"}</div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [baseWind, setBaseWind] = useState(45);
  const [divergenceLevel, setDivergenceLevel] = useState(3);
  const [seed, setSeed] = useState(1.2);
  const [tick, setTick] = useState(0);
  const [live, setLive] = useState(true);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (live) {
      intervalRef.current = setInterval(() => {
        setSeed(s => s + 0.04);
        setTick(t => t + 1);
      }, 1200);
    }
    return () => clearInterval(intervalRef.current);
  }, [live]);

  const forecasts = [
    generateForecast(baseWind, divergenceLevel * 0.8, seed),
    generateForecast(baseWind, divergenceLevel * 1.3, seed + 2.1),
    generateForecast(baseWind, divergenceLevel * 1.0, seed + 4.7),
  ];

  const divergence = calcDivergence(forecasts);
  const chartData = buildChartData(forecasts);
  const volData = buildVolatilityData(divergence);
  const avgImbalance = (volData.reduce((a, d) => a + d.price, 0) / 24).toFixed(0);
  const maxImbalance = Math.max(...volData.map(d => d.upper));

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080808",
      color: "#e0e0e0",
      fontFamily: "'Space Mono', monospace",
      padding: "24px",
      boxSizing: "border-box"
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, borderBottom: "1px solid #1a1a1a", paddingBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "#444", letterSpacing: 4, marginBottom: 4 }}>AUSTRIAN ELECTRICITY MARKET</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1, color: "#fff" }}>NERVOUSNESS INDICATOR</div>
          <div style={{ fontSize: 10, color: "#333", marginTop: 4 }}>D-1 FORECAST · WIND · ECMWF · GFS · ICON</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#333", marginBottom: 6 }}>
            {live ? <span style={{ color: "#a8ff3e" }}>● LIVE SIM</span> : <span style={{ color: "#555" }}>● PAUSED</span>}
          </div>
          <button
            onClick={() => setLive(l => !l)}
            style={{
              background: "none", border: "1px solid #222", color: "#888",
              padding: "4px 12px", cursor: "pointer", fontSize: 10,
              letterSpacing: 2, fontFamily: "'Space Mono', monospace"
            }}
          >
            {live ? "PAUSE" : "RESUME"}
          </button>
        </div>
      </div>

      {/* Top Row */}
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 4, padding: 16 }}>
          <NervousnessGauge score={divergence} />
        </div>

        {[
          { label: "AVG IMBALANCE PRICE", value: `${avgImbalance} €/MWh`, sub: "next 24h estimate" },
          { label: "PEAK EXPOSURE", value: `${maxImbalance} €/MWh`, sub: "upper confidence band" },
          { label: "BASE WIND FORECAST", value: `${baseWind} MW`, sub: "ECMWF reference" },
        ].map(card => (
          <div key={card.label} style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 4, padding: 16 }}>
            <div style={{ fontSize: 9, color: "#444", letterSpacing: 3, marginBottom: 8 }}>{card.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{card.value}</div>
            <div style={{ fontSize: 9, color: "#333", marginTop: 6 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 4, padding: 16 }}>
          <div style={{ fontSize: 9, color: "#444", letterSpacing: 3, marginBottom: 16 }}>WIND FORECAST — MODEL SPREAD (MW)</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#111" />
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#333", fontFamily: "Space Mono" }} interval={3} />
              <YAxis tick={{ fontSize: 9, fill: "#333", fontFamily: "Space Mono" }} />
              <Tooltip content={<CustomTooltip />} />
              {Object.entries(MODELS).map(([key, { color }]) => (
                <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={1.5} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            {Object.entries(MODELS).map(([key, { color, label }]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "#555" }}>
                <div style={{ width: 12, height: 1.5, background: color }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 4, padding: 16 }}>
          <div style={{ fontSize: 9, color: "#444", letterSpacing: 3, marginBottom: 16 }}>PROJECTED IMBALANCE PRICE (€/MWh)</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={volData}>
              <defs>
                <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff6b35" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ff6b35" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#111" />
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#333", fontFamily: "Space Mono" }} interval={3} />
              <YAxis tick={{ fontSize: 9, fill: "#333", fontFamily: "Space Mono" }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="upper" stroke="none" fill="#ff3e3e" fillOpacity={0.08} />
              <Area type="monotone" dataKey="lower" stroke="none" fill="#080808" fillOpacity={1} />
              <Line type="monotone" dataKey="price" stroke="#ff6b35" strokeWidth={2} dot={false} />
              <ReferenceLine y={100} stroke="#333" strokeDasharray="3 3" />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 9, color: "#333", marginTop: 8 }}>Shaded band = uncertainty range driven by model divergence</div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 4, padding: 16 }}>
        <div style={{ fontSize: 9, color: "#444", letterSpacing: 3, marginBottom: 16 }}>SCENARIO CONTROLS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {[
            { label: "BASE WIND (MW)", min: 10, max: 120, val: baseWind, set: setBaseWind },
            { label: "MODEL DIVERGENCE LEVEL", min: 0, max: 8, val: divergenceLevel, set: setDivergenceLevel, step: 0.1 },
          ].map(({ label, min, max, val, set, step = 1 }) => (
            <div key={label}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 9, color: "#555", letterSpacing: 2 }}>{label}</span>
                <span style={{ fontSize: 11, color: "#fff" }}>{typeof val === "number" ? val.toFixed(step < 1 ? 1 : 0) : val}</span>
              </div>
              <input
                type="range" min={min} max={max} step={step} value={val}
                onChange={e => set(parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "#00d4ff", cursor: "pointer" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#333", marginTop: 4 }}>
                <span>{min}</span><span>{max}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}