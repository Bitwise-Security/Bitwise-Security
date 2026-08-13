"use client";

import { useEffect, useState } from "react";
import homepageData from "@/data/homepage.json";
import homepageDataNl from "@/data/homepage.nl.json";
import { useLocale } from "@/lib/use-locale";

export default function ThreatStream() {
  const locale = useLocale();
  const [threatData, setThreatData] = useState([]);

  useEffect(() => {
    const nextPageData = locale === "nl" ? homepageDataNl : homepageData;
    const ts = nextPageData.threatTypes;
    const sv = nextPageData.severityLevels;
    const iv = setInterval(() => {
      setThreatData(
        (p) =>
          [
            ...p,
            {
              type: ts[Math.floor(Math.random() * ts.length)],
              ip: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
              port: Math.floor(Math.random() * 65535),
              severity: sv[Math.floor(Math.random() * sv.length)],
              timestamp: new Date().toLocaleTimeString(locale === "nl" ? "nl-NL" : "en-US", {
                hour12: true,
              }),
              id: Date.now(),
            },
          ].slice(-5) as any,
      );
    }, 2800);
    return () => clearInterval(iv);
  }, [locale]);

  return (
    <div style={{ paddingRight: 10 }}>
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#ff4422",
              boxShadow: "0 0 8px #ff2200",
              animation: "dotBlink 1s ease-in-out infinite",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "'Orbitron',monospace",
              fontSize: 9,
              color: "#ff6644",
              letterSpacing: 3,
              textShadow: "0 0 10px rgba(255,60,30,.6)",
            }}
          >
            {locale === "nl" ? "GESIMULEERDE AANVALSFEED" : "SIMULATED ATTACK FEED"}
          </span>
        </div>
        <div
          style={{
            height: 1,
            background: "linear-gradient(to right,#ff4422,transparent)",
            width: 145,
          }}
        />
      </div>

      <div
        style={{
          background: "rgba(4,14,34,0.87)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(0,150,255,0.18)",
          borderRadius: 10,
          padding: "13px 11px",
          boxShadow: "0 0 18px rgba(0,150,255,0.10)",
          display: "flex",
          flexDirection: "column-reverse",
          gap: 6,
          minHeight: 240,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: "rgba(0,200,255,0.38)",
            animation: "scanLine 3s linear infinite",
            pointerEvents: "none",
          }}
        />
        {threatData.map((t: any) => (
          <div
            key={t.id}
            className="threat-item"
            style={{
              padding: "8px 10px",
              background: "rgba(3,10,24,.6)",
              borderRadius: 6,
              borderLeft: `3px solid ${t.severity === "CRITICAL" || t.severity === "KRITIEK" ? "#ff2222" : t.severity === "HIGH" || t.severity === "HOOG" ? "#ff6622" : "#ffaa22"}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 3,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background:
                    t.severity === "CRITICAL" || t.severity === "KRITIEK"
                      ? "#ff2222"
                      : t.severity === "HIGH" || t.severity === "HOOG"
                        ? "#ff6622"
                        : "#ffaa22",
                  flexShrink: 0,
                  animation: "dotBlink 1s ease-in-out infinite",
                }}
              />
              <span
                style={{
                  fontSize: 9,
                  color: "#ff8855",
                  fontFamily: "'Orbitron',monospace",
                  letterSpacing: 0.5,
                }}
              >
                {t.type}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span
                style={{
                  fontSize: 9,
                  color: "#6688aa",
                  fontFamily: "monospace",
                }}
              >
                {t.ip}:{t.port} · {t.timestamp}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#00ccff" }}>
                {t.severity}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
