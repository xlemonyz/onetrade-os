export default function ChallengeRulesPanel({ challenge, rules, theme: G }) {
  const status = challenge.complete
    ? { label: "Challenge Complete", color: G.win, bg: G.winBg }
    : { label: "Challenge Active", color: G.goldLight, bg: G.goldGlow2 };

  return (
    <div
      style={{
        background: `linear-gradient(135deg, #ffffff 0%, ${G.goldGlow} 50%, #ffffff 100%)`,
        border: `1px solid ${G.border}`,
        borderRadius: 18,
        padding: 22,
        overflow: "hidden",
        position: "relative",
        animation: "challengeFadeUp 0.55s ease both",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: G.goldGlow2,
          right: -70,
          top: -80,
          filter: "blur(2px)",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 18,
          alignItems: "stretch",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: G.goldLight, fontWeight: 700 }}>
                20 Trade Discipline Challenge
              </div>
              <div style={{ fontSize: 13, color: G.textMuted, marginTop: 4 }}>
                One clean entry. No overtrading. No emotional exits.
              </div>
            </div>
            <span
              style={{
                background: status.bg,
                color: status.color,
                border: `1px solid ${status.color}33`,
                borderRadius: 999,
                padding: "8px 13px",
                fontSize: 12,
                fontWeight: 900,
                whiteSpace: "nowrap",
                animation: "challengePulse 1.9s ease-in-out infinite",
              }}
            >
              {status.label}
            </span>
          </div>

          <div
            style={{
              background: G.bgCard,
              border: `1px solid ${G.border}`,
              borderRadius: 14,
              padding: "16px 18px",
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: G.textMuted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Trade Progress
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 900, color: G.goldLight }}>
                {challenge.completed}/{challenge.total}
              </div>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: G.bgCard2, overflow: "hidden" }}>
              <div
                style={{
                  width: `${challenge.progress}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${G.gold}, ${G.win})`,
                  transformOrigin: "left",
                  animation: "challengeBarGrow 0.8s ease both",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <span style={{ fontSize: 12, color: G.textSub, background: G.bgCard2, borderRadius: 8, padding: "5px 9px" }}>
                {challenge.remaining} trades remaining
              </span>
              <span style={{ fontSize: 12, color: G.textSub, background: G.bgCard2, borderRadius: 8, padding: "5px 9px" }}>
                Today entries: {challenge.todayEntries}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: challenge.daysWithMultipleEntries ? G.loss : G.win,
                  background: challenge.daysWithMultipleEntries ? G.lossBg : G.winBg,
                  borderRadius: 8,
                  padding: "5px 9px",
                }}
              >
                Multi-entry days: {challenge.daysWithMultipleEntries}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {rules.map((rule, index) => (
            <div
              key={rule.tag}
              style={{
                display: "grid",
                gridTemplateColumns: "44px 1fr",
                gap: 12,
                alignItems: "center",
                background: "rgba(255,255,255,0.86)",
                border: `1px solid ${G.border}`,
                borderRadius: 14,
                padding: "11px 13px",
                animation: "challengeFadeUp 0.45s ease both",
                animationDelay: `${index * 0.08}s`,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: index % 2 === 0 ? G.goldGlow2 : G.winBg,
                  color: index % 2 === 0 ? G.goldLight : G.win,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "monospace",
                  fontWeight: 900,
                  fontSize: 13,
                }}
              >
                {rule.tag}
              </div>
              <div>
                <div style={{ fontSize: 13, color: G.text, fontWeight: 900, marginBottom: 3 }}>{rule.title}</div>
                <div style={{ fontSize: 12, color: G.textMuted, lineHeight: 1.45 }}>{rule.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
