"use client";

import { useEffect, useState } from "react";
import homepageData from "@/data/homepage.json";
import homepageDataNl from "@/data/homepage.nl.json";
import { useLocale } from "@/lib/use-locale";

// PERF FIX: Interval was 45ms = ~22 React re-renders/second just for this component.
// Changed to 150ms (still smooth animation, ~6.7x/sec instead of 22x/sec)
// PERF FIX: Counter animation completes in ~13.5s at 150ms — added a "done" flag
// so the interval clears itself once all values reach target (no pointless ticking forever)

export default function StatsCards() {
  const locale = useLocale();
  const statsData = locale === "nl" ? homepageDataNl.stats : homepageData.stats;
  const [stats, setStats] = useState(
    statsData.map((stat) => ({ ...stat, value: 0 })),
  );

  useEffect(() => {
    const nextStatsData =
      locale === "nl" ? homepageDataNl.stats : homepageData.stats;
    setStats(nextStatsData.map((stat) => ({ ...stat, value: 0 })));
  }, [locale]);

  useEffect(() => {
    const nextStatsData =
      locale === "nl" ? homepageDataNl.stats : homepageData.stats;
    setStats(nextStatsData.map((stat) => ({ ...stat, value: 0 })));
    const iv = setInterval(() => {
      setStats((p) => {
        const next = p.map((s) => ({
          ...s,
          value: Math.min(s.value + Math.floor(s.target / 30), s.target),
        }));
        // PERF FIX: Clear interval when all counters reach target
        if (next.every((s) => s.value >= s.target)) {
          clearInterval(iv);
        }
        return next;
      });
    }, 150); // was 45ms — reduced by 70%
    return () => clearInterval(iv);
  }, [locale]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        marginTop: 12,
      }}
    >
      {stats.map((s, i) => (
        <div
          key={i}
          style={{
            background: "rgba(4,14,34,.87)",
            border: "1px solid rgba(0,150,255,.18)",
            borderRadius: 10,
            padding: "12px 10px",
            boxShadow: "0 0 13px rgba(0,150,255,.09)",
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#00ccff",
              marginBottom: 4,
              fontFamily: "'Orbitron',monospace",
            }}
          >
            {s.value.toLocaleString()}
          </div>
          <div
            style={{
              fontSize: 8,
              color: "#667799",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}
