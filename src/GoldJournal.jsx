/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  Ban,
  Calendar,
  CheckCircle2,
  ChartNoAxesColumnIncreasing,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Flame,
  Hourglass,
  LayoutGrid,
  ListChecks,
  Monitor,
  Moon,
  RefreshCw,
  Settings,
  Shield,
  ShieldCheck,
  Smile,
  Target,
  TriangleAlert,
} from "lucide-react";
import ChallengeRulesPanel from "./components/ChallengeRulesPanel";
import AccountPage from "./AccountPage";
import {
  CHALLENGE_MIN_RR,
  CHALLENGE_RULES,
  CHALLENGE_TRADE_LIMIT,
  G,
  MINDSETS,
  PAIRS,
  PHASES,
  PROP_FIRM_PRESETS,
  SESSIONS,
  SETUPS,
  STORAGE_KEY,
} from "./journalConfig";
import {
  applyPresetToProject,
  buildProjectsFromCloud,
  calculateRiskReward,
  calculateTradePnl,
  emptyProject,
  emptyTrade,
  fmtMoney,
  formatDateLabel,
  formatNumberInput,
  formatRiskReward,
  getChallengeStats,
  getOutcomePrice,
  getProjectStats,
  getRiskGuardMessages,
  localDateValue,
  migrateStorage,
  normalizeProject,
  normalizeTrade,
  projectDataForCloud,
  ratioText,
  snapshotProjects,
} from "./journalUtils";
import {
  badgeTextFromReadiness,
  emptyReadinessForm,
  evaluateReadiness,
  getReadinessVisual,
  readinessFromRow,
  readinessRowPayload,
  READINESS_STATUS,
} from "./readinessUtils";
import {
  closeOneTradeRuleDay,
  DISCIPLINE_CHALLENGE_STATUS,
  DISCIPLINE_DAY_STATUS,
  evaluateDisciplineState,
  exitDisciplineChallenge,
  getActiveDisciplineChallenge,
  getCountdownToGoldClose,
  getChallengeChecklist,
  getTradeTradingDayKey,
  normalizeDisciplineMarketSettings,
  startDisciplineChallenge,
} from "./disciplineUtils";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const APP_PAGE_WIDTH = 1472;
const SIDEBAR_COLLAPSE_STORAGE_KEY = "oneTradeSidebarCollapsed";
const ONE_TRADE_UI_FONT_STACK =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const ONE_TRADE_READINESS_STATE = {
  NOT_CHECKED: "NOT_CHECKED",
  READY: "READY",
  CAUTION: "CAUTION",
  DO_NOT_TRADE: "DO_NOT_TRADE",
};
const ONE_TRADE_READINESS_STATE_SET = new Set(Object.values(ONE_TRADE_READINESS_STATE));

function mapReadinessStatusToOneTradeState(readinessStatus, readinessScore, hardBlock = false) {
  if (hardBlock) return ONE_TRADE_READINESS_STATE.DO_NOT_TRADE;
  const normalizedStatus = String(readinessStatus || "").toUpperCase();
  if (normalizedStatus === READINESS_STATUS.DO_NOT_TRADE) {
    return ONE_TRADE_READINESS_STATE.DO_NOT_TRADE;
  }
  if (normalizedStatus === READINESS_STATUS.CAUTION) {
    return ONE_TRADE_READINESS_STATE.CAUTION;
  }
  if (normalizedStatus === READINESS_STATUS.READY_TO_TRADE) {
    return ONE_TRADE_READINESS_STATE.READY;
  }
  if (normalizedStatus === READINESS_STATUS.NOT_CHECKED) {
    return ONE_TRADE_READINESS_STATE.NOT_CHECKED;
  }
  const numericScore = Number(readinessScore);
  if (!Number.isFinite(numericScore)) return ONE_TRADE_READINESS_STATE.NOT_CHECKED;
  if (numericScore >= 80) return ONE_TRADE_READINESS_STATE.READY;
  if (numericScore >= 65) return ONE_TRADE_READINESS_STATE.CAUTION;
  return ONE_TRADE_READINESS_STATE.DO_NOT_TRADE;
}

function getOneTradeReadinessState(readiness) {
  if (!readiness) return ONE_TRADE_READINESS_STATE.NOT_CHECKED;
  return mapReadinessStatusToOneTradeState(
    readiness?.status,
    readiness?.score,
    Boolean(readiness?.hardBlock)
  );
}

function resolveTradeReadinessStateAtTrade(trade = {}) {
  const explicitState = String(
    trade?.readinessStateAtTrade || trade?.readiness_state_at_trade || ""
  )
    .trim()
    .toUpperCase();
  if (ONE_TRADE_READINESS_STATE_SET.has(explicitState)) {
    return explicitState;
  }
  return mapReadinessStatusToOneTradeState(
    trade?.readinessStatusAtEntry,
    trade?.readinessScoreAtEntry
  );
}

function isReadinessBreachTrade(trade = {}) {
  if (trade?.readinessBreach ?? trade?.readiness_breach) return true;
  const readinessState = resolveTradeReadinessStateAtTrade(trade);
  if (readinessState === ONE_TRADE_READINESS_STATE.DO_NOT_TRADE) return true;
  return String(trade?.readinessStatusAtEntry || "").toUpperCase() === READINESS_STATUS.DO_NOT_TRADE;
}

function Label({ children, required }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: G.textMuted,
        marginBottom: 7,
        fontWeight: 600,
      }}
    >
      {children}
      {required && <span style={{ color: G.goldDim, marginLeft: 3 }}>*</span>}
    </div>
  );
}

function DisciplineShieldIcon() {
  return (
    <div
      className="relative flex h-10 w-10 items-center justify-center text-blue-600"
      style={{
        position: "relative",
        display: "flex",
        width: 40,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
        color: "#2563EB",
        flex: "0 0 auto",
      }}
      aria-hidden="true"
    >
      <Shield className="h-8 w-8 stroke-[1.8]" style={{ width: 32, height: 32, strokeWidth: 1.8 }} />
      <Hourglass
        className="absolute h-3.5 w-3.5 stroke-[2]"
        style={{ position: "absolute", width: 14, height: 14, strokeWidth: 2 }}
      />
    </div>
  );
}

function ProgressTargetIcon({ className = "", style }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}

function IconCircle({ children, tone }) {
  const tones = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    orange: "bg-amber-100 text-amber-600",
  };
  const toneStyles = {
    blue: { background: "#DBEAFE", color: "#2563EB" },
    green: { background: "#DCFCE7", color: "#16A34A" },
    orange: { background: "#FEF3C7", color: "#D97706" },
  };
  const resolvedTone = toneStyles[tone] ? tone : "blue";
  return (
    <div
      className={`flex h-11 w-11 items-center justify-center rounded-full ${tones[resolvedTone]}`}
      style={{
        width: 44,
        height: 44,
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
        ...toneStyles[resolvedTone],
      }}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

function ReadinessFieldCard({
  icon,
  label,
  children,
  tone = "neutral",
  showChevron = false,
  onClick,
  expandedContent,
  chevronIcon,
}) {
  const isExpanded = Boolean(expandedContent);
  const toneVisual =
    tone === "good"
      ? { iconColor: "#16A34A", iconBg: "#ECFDF3", accent: "rgba(22, 163, 74, 0.28)" }
      : tone === "caution"
        ? { iconColor: "#B45309", iconBg: "#FFFBEB", accent: "rgba(180, 83, 9, 0.24)" }
        : tone === "risk" || tone === "bad"
          ? { iconColor: "#DC2626", iconBg: "#FEF2F2", accent: "rgba(220, 38, 38, 0.24)" }
          : { iconColor: "#2563EB", iconBg: "#EEF5FF", accent: "transparent" };
  return (
    <div
      className={`mindset-field-card${isExpanded ? " expanded" : ""}${onClick ? " is-interactive" : ""}`}
      style={{
        "--mindset-field-icon-color": toneVisual.iconColor,
        "--mindset-field-icon-bg": toneVisual.iconBg,
        "--mindset-field-accent": toneVisual.accent,
        position: "relative",
        transition: "border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease",
        cursor: onClick ? "pointer" : "default",
      }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="mindset-field-icon" aria-hidden="true">
        {icon}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="mindset-field-main">
          <div className="mindset-field-label">{label}</div>
          <div className="mindset-field-value">{children}</div>
          {showChevron ? (
            chevronIcon || <ChevronRight size={13} strokeWidth={2.1} color="#94A3B8" aria-hidden="true" />
          ) : null}
        </div>
        {expandedContent ? <div className="mindset-field-overlay">{expandedContent}</div> : null}
      </div>
    </div>
  );
}

function ReadinessScoreRing({ theme, ringDegrees, scoreDisplay }) {
  return (
    <div
      className="mindset-score-ring"
      style={{
        background: `conic-gradient(${theme.accent} ${ringDegrees}deg, ${theme.ringTrack} 0deg)`,
      }}
    >
      <div className="mindset-score-ring-inner">
        <div className="mindset-inline-score" style={{ color: theme.accent }}>
          {scoreDisplay}%
        </div>
      </div>
    </div>
  );
}

function ReadinessStatusBlock({ theme, title, description, StatusIcon, children = null }) {
  return (
    <div className="mindset-readiness-main">
      <div className="mindset-readiness-title-row">
        <span
          className="mindset-readiness-status-icon"
          style={{ background: theme.iconBg, color: theme.accent }}
        >
          <StatusIcon size={18} strokeWidth={2.2} />
        </span>
        <div className="mindset-readiness-title">{title}</div>
      </div>
      <div className="mindset-readiness-desc">{description}</div>
      {children}
    </div>
  );
}

function MindsetDateRow({ label }) {
  return (
    <div className="mindset-date-row">
      <Calendar size={14} strokeWidth={2.2} />
      <span className="mindset-date-label">Date:</span>
      <span className="mindset-date-value">{label}</span>
    </div>
  );
}

function MindsetActionRow({ readinessBusy, onSave, onReset }) {
  return (
    <div className="mindset-action-row">
      <button
        type="button"
        onClick={onSave}
        disabled={readinessBusy}
        className="mindset-btn-primary"
        style={{ opacity: readinessBusy ? 0.6 : 1, cursor: readinessBusy ? "not-allowed" : "pointer" }}
      >
        <CheckCircle2 size={15} strokeWidth={2.2} />
        {readinessBusy ? "Saving..." : "Save Today Check"}
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={readinessBusy}
        className="mindset-btn-secondary"
        style={{ opacity: readinessBusy ? 0.6 : 1, cursor: readinessBusy ? "not-allowed" : "pointer" }}
      >
        <RefreshCw size={14} strokeWidth={2.2} />
        Reset Today
      </button>
    </div>
  );
}

function MindsetSummaryCard({
  theme,
  ringDegrees,
  scoreDisplay,
  StatusIcon,
  readinessBusy,
  onSave,
  onReset,
  dateLabel,
  title,
  description,
  showActions = true,
}) {
  if (!showActions) {
    return (
      <div
        className="mindset-summary-panel summary-only"
        style={{
          borderColor: theme.softBorder,
          background: theme.softBg,
        }}
      >
        <div className="readiness-summary-card">
          <ReadinessScoreRing theme={theme} ringDegrees={ringDegrees} scoreDisplay={scoreDisplay} />
          <ReadinessStatusBlock
            theme={theme}
            title={title}
            description={description}
            StatusIcon={StatusIcon}
          >
            <div style={{ marginTop: 8 }}>
              <MindsetDateRow label={dateLabel} />
            </div>
          </ReadinessStatusBlock>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mindset-summary-panel"
      style={{
        borderColor: theme.softBorder,
        background: theme.softBg,
      }}
    >
      <div className="mindset-summary-compact">
        <ReadinessScoreRing theme={theme} ringDegrees={ringDegrees} scoreDisplay={scoreDisplay} />
        <div className="mindset-readiness-divider" />
        <ReadinessStatusBlock
          theme={theme}
          title={title}
          description={description}
          StatusIcon={StatusIcon}
        />
        <div className="mindset-summary-actions-wrap">
          <MindsetActionRow readinessBusy={readinessBusy} onSave={onSave} onReset={onReset} />
          <MindsetDateRow label={dateLabel} />
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, summaryText, summaryTone = "neutral" }) {
  const toneColor =
    summaryTone === "good"
      ? "#16A34A"
      : summaryTone === "caution"
        ? "#B45309"
        : summaryTone === "bad"
          ? "#DC2626"
          : "#64748B";
  return (
    <div className="mindset-section-header">
      <span className="mindset-section-icon">{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="mindset-section-title">{title}</div>
      </div>
      {summaryText ? (
        <div className="mindset-section-summary" style={{ color: toneColor }}>
          {summaryText}
        </div>
      ) : null}
    </div>
  );
}

function MindsetFieldGrid({ children }) {
  return <div className="mindset-fields-grid">{children}</div>;
}

function MindsetSectionCard({
  icon,
  title,
  summaryText,
  summaryTone = "neutral",
  children,
}) {
  return (
    <div className="mindset-section-card">
      <SectionHeader
        icon={icon}
        title={title}
        summaryText={summaryText}
        summaryTone={summaryTone}
      />
      <MindsetFieldGrid>{children}</MindsetFieldGrid>
    </div>
  );
}

function MindsetFieldItem({
  id,
  label,
  tone,
  children,
  onClick,
  expandedContent,
  chevronIcon,
  showChevron = true,
}) {
  const resolvedTone = tone === "risk" ? "bad" : tone;
  const statusIcon =
    resolvedTone === "good" ? (
      <CheckCircle2 size={16} strokeWidth={2.2} />
    ) : resolvedTone === "caution" ? (
      <TriangleAlert size={16} strokeWidth={2.2} />
    ) : resolvedTone === "bad" ? (
      <Ban size={16} strokeWidth={2.2} />
    ) : (
      <ListChecks size={16} strokeWidth={2.2} />
    );
  return (
    <ReadinessFieldCard
      icon={statusIcon}
      label={label}
      tone={resolvedTone}
      showChevron={showChevron}
      chevronIcon={chevronIcon}
      expandedContent={expandedContent}
      onClick={onClick ? () => onClick(id) : undefined}
    >
      {children}
    </ReadinessFieldCard>
  );
}

function InlineChoiceChipGroup({ options, value, onSelect }) {
  return (
    <div className="mindset-choice-chips" role="group" aria-label="Inline options">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`mindset-choice-chip${selected ? " selected" : ""}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function InlineChoiceRow({ options, value, onSelect }) {
  return (
    <div className="mindset-inline-options" role="group" aria-label="Inline row options">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`mindset-inline-option${selected ? " selected" : ""}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function MindsetReadinessPage({
  isMindsetCheckPage,
  headerTitle = "Mindset Readiness",
  headerSubtitle = "EARN YOUR PERMISSION BEFORE YOU TRADE",
  showSummaryCard = true,
  showSummaryActions = true,
  homeReadinessTheme,
  homeReadinessRingDegrees,
  readinessScoreDisplay,
  homeReadinessStatusIcon,
  readinessBusy,
  saveTodayReadiness,
  resetTodayReadinessForm,
  todayLocalDate,
  todayReadiness,
  mindsetFooterEvent,
  readinessForm,
  setReadinessField,
}) {
  const bodyGoodCount = [
    ["Excellent", "Good"].includes(readinessForm.sleepQuality),
    String(readinessForm.meditationDone || "").startsWith("Yes"),
    readinessForm.showered === "Yes",
    readinessForm.foodAndWater === "Yes",
    Number(readinessForm.energyLevel) >= 7,
    Number(readinessForm.focusLevel) >= 7,
  ].filter(Boolean).length;
  const environmentGoodCount = [
    readinessForm.deskClean === "Yes",
    readinessForm.roomClean === "Yes",
    readinessForm.phoneDistractionOff === "Yes",
    readinessForm.externalInfluence === "No",
  ].filter(Boolean).length;
  const emotionalStableCount = [
    ["Calm", "Focused", "Confident", "Neutral"].includes(readinessForm.currentEmotion),
    ["No", "Slightly"].includes(readinessForm.previousResultBothering),
    readinessForm.revengeRisk === "No",
    ["No", "Slightly"].includes(readinessForm.financialPressure),
    Number(readinessForm.stressLevel) <= 4,
    Number(readinessForm.confidenceLevel) >= 7,
  ].filter(Boolean).length;

  const toneByCondition = (ok, caution = false) => (ok ? "good" : caution ? "caution" : "bad");
  const [expandedChoiceFieldId, setExpandedChoiceFieldId] = useState("");
  const sleepLabelByValue = useMemo(
    () =>
      Object.fromEntries(
        SLEEP_QUALITY_DISPLAY_OPTIONS.map((option) => [option.value, option.label])
      ),
    []
  );
  const formatOptionLabel = (field, item) => {
    if (field === "meditationDone" && item === "Yes, 5 minutes") return "Yes, short session";
    if (field === "previousResultBothering" && item === "Yes, a lot") return "Yes";
    if (field === "revengeRisk" && item === "Maybe") return "Slightly";
    return item;
  };
  const readinessCompareFields = [
    "sleepQuality",
    "meditationDone",
    "showered",
    "foodAndWater",
    "energyLevel",
    "focusLevel",
    "deskClean",
    "roomClean",
    "phoneDistractionOff",
    "externalInfluence",
    "currentEmotion",
    "previousResultBothering",
    "revengeRisk",
    "financialPressure",
    "stressLevel",
    "confidenceLevel",
  ];
  const hasUnsavedChanges =
    Boolean(todayReadiness) &&
    readinessCompareFields.some((key) => String(todayReadiness?.[key] ?? "") !== String(readinessForm?.[key] ?? ""));
  const formatTimeLabel = (raw) => {
    if (!raw) return "";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(parsed);
  };
  const savedTodayTimeLabel = (() => {
    const raw = todayReadiness?.updatedAt || todayReadiness?.createdAt || "";
    if (!raw) return "";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return "";
    const sameDay = parsed.toISOString().slice(0, 10) === todayLocalDate;
    if (!sameDay) return "";
    return formatTimeLabel(raw);
  })();
  const footerEventLabel = (() => {
    if (!mindsetFooterEvent?.type || !mindsetFooterEvent?.at) return "";
    const eventTime = formatTimeLabel(mindsetFooterEvent.at);
    if (!eventTime) return "";
    if (mindsetFooterEvent.type === "reset") return `Reset today at ${eventTime}`;
    if (mindsetFooterEvent.type === "saved") return `Saved today at ${eventTime}`;
    return "";
  })();
  const checklistFooterStatus = footerEventLabel || (hasUnsavedChanges
    ? "Unsaved changes"
    : savedTodayTimeLabel
      ? `Saved today at ${savedTodayTimeLabel}`
      : "Not saved today");

  return (
    <div className="mindset-shell-card one-trade-main-card">
      <div className="mindset-header-row">
        <div className="mindset-main-title">{headerTitle}</div>
        <div className="mindset-main-subtitle">{headerSubtitle}</div>
      </div>

      {showSummaryCard ? (
        <MindsetSummaryCard
          theme={homeReadinessTheme}
          ringDegrees={homeReadinessRingDegrees}
          scoreDisplay={readinessScoreDisplay}
          StatusIcon={homeReadinessStatusIcon}
          readinessBusy={readinessBusy}
          onSave={saveTodayReadiness}
          onReset={resetTodayReadinessForm}
          dateLabel={todayLocalDate}
          title={homeReadinessTheme.headline}
          description={homeReadinessTheme.decisionBody}
          showActions={showSummaryActions}
        />
      ) : null}

      {isMindsetCheckPage ? (
        <>
          <MindsetSectionCard
            icon={<Moon size={18} strokeWidth={2.2} />}
            title="Body & Energy"
            summaryText={`${bodyGoodCount}/6 good`}
            summaryTone={bodyGoodCount >= 4 ? "good" : bodyGoodCount >= 3 ? "caution" : "bad"}
          >
            <MindsetFieldItem
              id="sleepQuality"
              label="Sleep & Recovery"
              tone={toneByCondition(["Excellent", "Good"].includes(readinessForm.sleepQuality), readinessForm.sleepQuality === "Average")}
              onClick={() =>
                setExpandedChoiceFieldId((prev) => (prev === "sleepQuality" ? "" : "sleepQuality"))
              }
              showChevron
              chevronIcon={
                expandedChoiceFieldId === "sleepQuality" ? (
                  <ChevronUp size={13} strokeWidth={2.1} color="#94A3B8" aria-hidden="true" />
                ) : (
                  <ChevronDown size={13} strokeWidth={2.1} color="#94A3B8" aria-hidden="true" />
                )
              }
              expandedContent={
                expandedChoiceFieldId === "sleepQuality" ? (
                  <InlineChoiceChipGroup
                    value={readinessForm.sleepQuality}
                    onSelect={(nextValue) => {
                      setReadinessField("sleepQuality", nextValue);
                      setExpandedChoiceFieldId("");
                    }}
                    options={SLEEP_QUALITY_DISPLAY_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                  />
                ) : null
              }
            >
              <span>{sleepLabelByValue[readinessForm.sleepQuality] || readinessForm.sleepQuality || "Not set"}</span>
            </MindsetFieldItem>
            <MindsetFieldItem
              id="meditationDone"
              label="Meditation"
              tone={toneByCondition(String(readinessForm.meditationDone || "").startsWith("Yes"))}
              showChevron={false}
            >
              <InlineChoiceRow
                value={readinessForm.meditationDone}
                onSelect={(nextValue) => setReadinessField("meditationDone", nextValue)}
                options={READINESS_OPTIONS.meditationDone.map((item) => ({
                  value: item,
                  label: formatOptionLabel("meditationDone", item),
                }))}
              />
            </MindsetFieldItem>
            <MindsetFieldItem id="showered" label="Showered" tone={toneByCondition(readinessForm.showered === "Yes")} showChevron={false}>
              <InlineChoiceRow
                value={readinessForm.showered}
                onSelect={(nextValue) => setReadinessField("showered", nextValue)}
                options={READINESS_OPTIONS.yesNo.map((item) => ({ value: item, label: item }))}
              />
            </MindsetFieldItem>
            <MindsetFieldItem id="foodAndWater" label="Food & Water" tone={toneByCondition(readinessForm.foodAndWater === "Yes", readinessForm.foodAndWater === "Partially")} showChevron={false}>
              <InlineChoiceRow
                value={readinessForm.foodAndWater}
                onSelect={(nextValue) => setReadinessField("foodAndWater", nextValue)}
                options={READINESS_OPTIONS.yesNoPartial.map((item) => ({ value: item, label: item }))}
              />
            </MindsetFieldItem>
            <MindsetFieldItem id="energyLevel" label="Energy (1-10)" tone={toneByCondition(Number(readinessForm.energyLevel) >= 7, Number(readinessForm.energyLevel) >= 5)} showChevron={false}>
              <div className="mindset-range-wrap">
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={readinessForm.energyLevel}
                  onChange={(e) => setReadinessField("energyLevel", e.target.value)}
                  className="mindset-range-slider"
                />
                <span className="mindset-range-value">{Number(readinessForm.energyLevel) || 0} / 10</span>
              </div>
            </MindsetFieldItem>
            <MindsetFieldItem id="focusLevel" label="Focus (1-10)" tone={toneByCondition(Number(readinessForm.focusLevel) >= 7, Number(readinessForm.focusLevel) >= 5)} showChevron={false}>
              <div className="mindset-range-wrap">
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={readinessForm.focusLevel}
                  onChange={(e) => setReadinessField("focusLevel", e.target.value)}
                  className="mindset-range-slider"
                />
                <span className="mindset-range-value">{Number(readinessForm.focusLevel) || 0} / 10</span>
              </div>
            </MindsetFieldItem>
          </MindsetSectionCard>

          <MindsetSectionCard
            icon={<Monitor size={18} strokeWidth={2.2} />}
            title="Environment Check"
            summaryText={`${environmentGoodCount}/4 good`}
            summaryTone={environmentGoodCount >= 3 ? "good" : environmentGoodCount >= 2 ? "caution" : "bad"}
          >
            <MindsetFieldItem id="deskClean" label="Desk Clean" tone={toneByCondition(readinessForm.deskClean === "Yes", readinessForm.deskClean === "Partially")} showChevron={false}>
              <InlineChoiceRow
                value={readinessForm.deskClean}
                onSelect={(nextValue) => setReadinessField("deskClean", nextValue)}
                options={READINESS_OPTIONS.yesNoPartial.map((item) => ({ value: item, label: item }))}
              />
            </MindsetFieldItem>
            <MindsetFieldItem id="roomClean" label="Room Clean" tone={toneByCondition(readinessForm.roomClean === "Yes", readinessForm.roomClean === "Partially")} showChevron={false}>
              <InlineChoiceRow
                value={readinessForm.roomClean}
                onSelect={(nextValue) => setReadinessField("roomClean", nextValue)}
                options={READINESS_OPTIONS.yesNoPartial.map((item) => ({ value: item, label: item }))}
              />
            </MindsetFieldItem>
            <MindsetFieldItem id="phoneDistractionOff" label="Phone Distraction Off" tone={toneByCondition(readinessForm.phoneDistractionOff === "Yes")} showChevron={false}>
              <InlineChoiceRow
                value={readinessForm.phoneDistractionOff}
                onSelect={(nextValue) => setReadinessField("phoneDistractionOff", nextValue)}
                options={READINESS_OPTIONS.yesNo.map((item) => ({ value: item, label: item }))}
              />
            </MindsetFieldItem>
            <MindsetFieldItem id="externalInfluence" label="Outside Bias" tone={toneByCondition(readinessForm.externalInfluence === "No", readinessForm.externalInfluence === "Slightly")} showChevron={false}>
              <InlineChoiceRow
                value={readinessForm.externalInfluence}
                onSelect={(nextValue) => setReadinessField("externalInfluence", nextValue)}
                options={READINESS_OPTIONS.externalInfluence.map((item) => ({ value: item, label: item }))}
              />
            </MindsetFieldItem>
          </MindsetSectionCard>

          <MindsetSectionCard
            icon={<Smile size={18} strokeWidth={2.2} />}
            title="Emotional State"
            summaryText={`${emotionalStableCount}/6 stable`}
            summaryTone={emotionalStableCount >= 4 ? "good" : emotionalStableCount >= 3 ? "caution" : "bad"}
          >
            <MindsetFieldItem
              id="currentEmotion"
              label="Current Emotion"
              tone={toneByCondition(["Calm", "Focused", "Confident", "Neutral"].includes(readinessForm.currentEmotion), readinessForm.currentEmotion === "Anxious" || readinessForm.currentEmotion === "Tired")}
              onClick={() =>
                setExpandedChoiceFieldId((prev) => (prev === "currentEmotion" ? "" : "currentEmotion"))
              }
              showChevron
              chevronIcon={
                expandedChoiceFieldId === "currentEmotion" ? (
                  <ChevronUp size={13} strokeWidth={2.1} color="#94A3B8" aria-hidden="true" />
                ) : (
                  <ChevronDown size={13} strokeWidth={2.1} color="#94A3B8" aria-hidden="true" />
                )
              }
              expandedContent={
                expandedChoiceFieldId === "currentEmotion" ? (
                  <InlineChoiceChipGroup
                    value={readinessForm.currentEmotion}
                    onSelect={(nextValue) => {
                      setReadinessField("currentEmotion", nextValue);
                      setExpandedChoiceFieldId("");
                    }}
                    options={READINESS_OPTIONS.currentEmotion.map((item) => ({
                      value: item,
                      label: item,
                    }))}
                  />
                ) : null
              }
            >
              <span>{readinessForm.currentEmotion || "Not set"}</span>
            </MindsetFieldItem>
            <MindsetFieldItem id="previousResultBothering" label="Previous Result Bothering" tone={toneByCondition(readinessForm.previousResultBothering === "No", readinessForm.previousResultBothering === "Slightly")} showChevron={false}>
              <InlineChoiceRow
                value={readinessForm.previousResultBothering}
                onSelect={(nextValue) => setReadinessField("previousResultBothering", nextValue)}
                options={READINESS_OPTIONS.previousResultBothering.map((item) => ({
                  value: item,
                  label: formatOptionLabel("previousResultBothering", item),
                }))}
              />
            </MindsetFieldItem>
            <MindsetFieldItem id="revengeRisk" label="Revenge Risk" tone={toneByCondition(readinessForm.revengeRisk === "No", readinessForm.revengeRisk === "Maybe")} showChevron={false}>
              <InlineChoiceRow
                value={readinessForm.revengeRisk}
                onSelect={(nextValue) => setReadinessField("revengeRisk", nextValue)}
                options={READINESS_OPTIONS.revengeRisk.map((item) => ({
                  value: item,
                  label: formatOptionLabel("revengeRisk", item),
                }))}
              />
            </MindsetFieldItem>
            <MindsetFieldItem id="financialPressure" label="Financial Pressure" tone={toneByCondition(readinessForm.financialPressure === "No", readinessForm.financialPressure === "Slightly")} showChevron={false}>
              <InlineChoiceRow
                value={readinessForm.financialPressure}
                onSelect={(nextValue) => setReadinessField("financialPressure", nextValue)}
                options={READINESS_OPTIONS.financialPressure.map((item) => ({ value: item, label: item }))}
              />
            </MindsetFieldItem>
            <MindsetFieldItem id="stressLevel" label="Stress (1-10)" tone={toneByCondition(Number(readinessForm.stressLevel) <= 4, Number(readinessForm.stressLevel) <= 6)} showChevron={false}>
              <div className="mindset-range-wrap">
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={readinessForm.stressLevel}
                  onChange={(e) => setReadinessField("stressLevel", e.target.value)}
                  className="mindset-range-slider"
                />
                <span className="mindset-range-value">{Number(readinessForm.stressLevel) || 0} / 10</span>
              </div>
            </MindsetFieldItem>
            <MindsetFieldItem id="confidenceLevel" label="Confidence (1-10)" tone={toneByCondition(Number(readinessForm.confidenceLevel) >= 7, Number(readinessForm.confidenceLevel) >= 5)} showChevron={false}>
              <div className="mindset-range-wrap">
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={readinessForm.confidenceLevel}
                  onChange={(e) => setReadinessField("confidenceLevel", e.target.value)}
                  className="mindset-range-slider"
                />
                <span className="mindset-range-value">{Number(readinessForm.confidenceLevel) || 0} / 10</span>
              </div>
            </MindsetFieldItem>
          </MindsetSectionCard>

          <div className="mindset-footer-row">
            <div className="mindset-footer-status">{checklistFooterStatus}</div>
            <div className="mindset-footer-actions">
              <button
                type="button"
                onClick={resetTodayReadinessForm}
                disabled={readinessBusy}
                className="mindset-btn-secondary"
                style={{ opacity: readinessBusy ? 0.6 : 1, cursor: readinessBusy ? "not-allowed" : "pointer" }}
              >
                <RefreshCw size={14} strokeWidth={2.2} />
                Reset Today
              </button>
              <button
                type="button"
                onClick={saveTodayReadiness}
                disabled={readinessBusy}
                className="mindset-btn-primary"
                style={{ opacity: readinessBusy ? 0.6 : 1, cursor: readinessBusy ? "not-allowed" : "pointer" }}
              >
                <CheckCircle2 size={15} strokeWidth={2.2} />
                {readinessBusy ? "Saving..." : "Save Today Check"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function CleanDayPage({
  todayLocalDate,
  nowMs,
  cleanDayForm,
  cleanDayActiveChallenge,
  cleanDayTargetDays,
  cleanDayActiveDayNumber,
  cleanDayChallengeProgress,
  cleanDayChallengeDays,
  cleanDayChallengeHistory,
  cleanDayChallengeBusy,
  cleanDayBusy,
  cleanDayFooterStatus,
  setCleanDayField,
  setCleanDayAdaptiveResponse,
  markCleanDayHourlyCheckin,
  startCleanDayChallenge,
  saveCleanDayEntry,
}) {
  const inferredRiskLevel = inferCleanDayRiskLevel(cleanDayForm);
  const resolvedNowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const now = new Date(resolvedNowMs);
  const currentMinuteOfDay = now.getHours() * 60 + now.getMinutes();
  const isAfter6pm = currentMinuteOfDay >= 18 * 60;
  const isAfter9pm = currentMinuteOfDay >= 21 * 60;
  const isAfter10pm = currentMinuteOfDay >= 22 * 60;
  const isWithinEveningWindow = isAfter6pm && !isAfter10pm;
  const currentHourSlotKey =
    currentMinuteOfDay >= 18 * 60 && currentMinuteOfDay < 19 * 60
      ? "hourlyCheckin6pm"
      : currentMinuteOfDay >= 19 * 60 && currentMinuteOfDay < 20 * 60
        ? "hourlyCheckin7pm"
        : currentMinuteOfDay >= 20 * 60 && currentMinuteOfDay < 21 * 60
          ? "hourlyCheckin8pm"
          : currentMinuteOfDay >= 21 * 60 && currentMinuteOfDay < 22 * 60
            ? "hourlyCheckin9pm"
            : currentMinuteOfDay >= 22 * 60
              ? "hourlyCheckin10pm"
          : "";
  const eveningWindowStageLabel = isAfter10pm
    ? "10 PM • Final Evening Check-in"
    : isAfter9pm
      ? "9 PM • Night Check-in"
      : isAfter6pm
        ? "6–8 PM • Hourly Check-in"
        : "Starts at 6 PM";
  const completedHourlyCheckins = CLEAN_DAY_HOURLY_CHECKIN_SLOTS.reduce(
    (count, slot) => count + (cleanDayForm[slot.key] ? 1 : 0),
    0
  );
  const slotMinuteByKey = {
    hourlyCheckin6pm: 18 * 60,
    hourlyCheckin7pm: 19 * 60,
    hourlyCheckin8pm: 20 * 60,
    hourlyCheckin9pm: 21 * 60,
    hourlyCheckin10pm: 22 * 60,
  };
  const resetStartMs = cleanDayForm.eveningResetStartedAt
    ? new Date(cleanDayForm.eveningResetStartedAt).getTime()
    : NaN;
  const resetRemainingMs = Number.isFinite(resetStartMs)
    ? Math.max(0, resetStartMs + 10 * 60 * 1000 - now.getTime())
    : 0;
  const resetCountdownLabel =
    resetRemainingMs > 0
      ? `${Math.floor(resetRemainingMs / 60000)}m ${String(Math.floor((resetRemainingMs % 60000) / 1000)).padStart(2, "0")}s`
      : "0m 00s";
  const hasActiveChallenge =
    cleanDayActiveChallenge?.status === CLEAN_DAY_CHALLENGE_STATUS.ACTIVE;
  const challengeHeaderLabel = hasActiveChallenge
    ? `${cleanDayTargetDays} Day Challenge`
    : cleanDayActiveChallenge?.status === CLEAN_DAY_CHALLENGE_STATUS.COMPLETED
      ? "Challenge Completed"
      : "No Active Challenge";
  const nextPendingSlot = CLEAN_DAY_HOURLY_CHECKIN_SLOTS.find((slot) => !cleanDayForm[slot.key]);
  const dayHistoryRows = Array.isArray(cleanDayChallengeDays) ? cleanDayChallengeDays : [];
  const [dailyHistoryOpen, setDailyHistoryOpen] = useState(true);
  const [challengeArchiveOpen, setChallengeArchiveOpen] = useState(true);
  const sortedDayHistoryRows = [...dayHistoryRows].sort((a, b) => {
    const dateCompare = String(b?.local_date || "").localeCompare(String(a?.local_date || ""));
    if (dateCompare !== 0) return dateCompare;
    return Number(b?.day_number || 0) - Number(a?.day_number || 0);
  });
  const challengeHistoryRows = Array.isArray(cleanDayChallengeHistory) ? cleanDayChallengeHistory : [];
  const sortedChallengeHistoryRows = [...challengeHistoryRows].sort((a, b) => {
    const startCompare = String(b?.start_local_date || "").localeCompare(String(a?.start_local_date || ""));
    if (startCompare !== 0) return startCompare;
    return String(b?.created_at || "").localeCompare(String(a?.created_at || ""));
  });
  const dailyStatusLabel = (rawStatus) => {
    const normalized = String(rawStatus || "").toLowerCase();
    if (normalized === CLEAN_DAY_DAILY_STATUS.CLEAN_DAY) return "Clean Day";
    if (normalized === CLEAN_DAY_DAILY_STATUS.RECOVERED_DAY) return "Recovered Day";
    if (normalized === CLEAN_DAY_DAILY_STATUS.NOT_CLEAN) return "Not Clean";
    if (normalized === CLEAN_DAY_DAILY_STATUS.MISSED) return "Missed";
    return "Pending";
  };
  const nextCheckinLabel = (() => {
    if (!hasActiveChallenge) return "Start a challenge to begin hourly check-ins.";
    if (!nextPendingSlot) return "All checkpoints completed for today.";
    const slotMinute = slotMinuteByKey[nextPendingSlot.key] ?? Number.MAX_SAFE_INTEGER;
    if (currentMinuteOfDay >= slotMinute) return `Today's next check-in: ${nextPendingSlot.label} (now)`;
    return `Today's next check-in: ${nextPendingSlot.label}`;
  })();
  const hourlySnapshots =
    cleanDayForm.hourlySnapshots && typeof cleanDayForm.hourlySnapshots === "object"
      ? cleanDayForm.hourlySnapshots
      : {};
  const adaptiveResponsesBySlot =
    cleanDayForm.adaptiveResponses && typeof cleanDayForm.adaptiveResponses === "object"
      ? cleanDayForm.adaptiveResponses
      : {};
  const adaptiveSlotKey =
    currentHourSlotKey === "hourlyCheckin7pm" || currentHourSlotKey === "hourlyCheckin8pm"
      ? currentHourSlotKey
      : "";
  const adaptivePreviousSnapshot = (() => {
    if (!adaptiveSlotKey) return null;
    const currentIndex = CLEAN_DAY_HOURLY_CHECKIN_SLOTS.findIndex((slot) => slot.key === adaptiveSlotKey);
    if (currentIndex <= 0) return null;
    let fallbackCheckedSlotKey = "";
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const slotKey = CLEAN_DAY_HOURLY_CHECKIN_SLOTS[index]?.key;
      if (!slotKey) continue;
      if (!cleanDayForm[slotKey]) continue;
      if (!fallbackCheckedSlotKey) fallbackCheckedSlotKey = slotKey;
      const snapshot = hourlySnapshots[slotKey];
      if (snapshot && typeof snapshot === "object") return snapshot;
    }
    if (!fallbackCheckedSlotKey) return null;
    return {
      slotKey: fallbackCheckedSlotKey,
      location: String(cleanDayForm.eveningLocation || "").toLowerCase(),
      wentCarromPlace: String(cleanDayForm.eveningWentCarromPlace || "").toLowerCase(),
      playedCarrom: String(cleanDayForm.eveningPlayedCarrom || "").toLowerCase(),
      smokingDone: String(cleanDayForm.smokingDone || "").toLowerCase(),
      cigaretteCount:
        String(cleanDayForm.smokingDone || "").toLowerCase() === "yes"
          ? Math.max(0, Number(cleanDayForm.cigaretteCount) || 0)
          : 0,
      riskLevel: inferCleanDayRiskLevel(cleanDayForm),
      sleepProtectionLocked: Boolean(cleanDayForm.sleepProtectionLocked),
      fallbackGenerated: true,
    };
  })();
  const adaptiveFallbackFromCurrentAnswers = (() => {
    if (!adaptiveSlotKey) return null;
    const hasAnyBaseAnswer =
      Boolean(String(cleanDayForm.eveningLocation || "").trim()) ||
      Boolean(String(cleanDayForm.eveningWentCarromPlace || "").trim()) ||
      Boolean(String(cleanDayForm.eveningPlayedCarrom || "").trim()) ||
      Boolean(String(cleanDayForm.smokingDone || "").trim()) ||
      String(cleanDayForm.cigaretteCount || "").trim() !== "";
    if (!hasAnyBaseAnswer) return null;
    return {
      slotKey: "base-form",
      location: String(cleanDayForm.eveningLocation || "").toLowerCase(),
      wentCarromPlace: String(cleanDayForm.eveningWentCarromPlace || "").toLowerCase(),
      playedCarrom: String(cleanDayForm.eveningPlayedCarrom || "").toLowerCase(),
      smokingDone: String(cleanDayForm.smokingDone || "").toLowerCase(),
      cigaretteCount:
        String(cleanDayForm.smokingDone || "").toLowerCase() === "yes"
          ? Math.max(0, Number(cleanDayForm.cigaretteCount) || 0)
          : 0,
      riskLevel: inferCleanDayRiskLevel(cleanDayForm),
      sleepProtectionLocked: Boolean(cleanDayForm.sleepProtectionLocked),
      fallbackGenerated: true,
    };
  })();
  const adaptiveContextSnapshot = adaptivePreviousSnapshot || adaptiveFallbackFromCurrentAnswers;
  const adaptiveResponse =
    adaptiveSlotKey && adaptiveResponsesBySlot[adaptiveSlotKey] && typeof adaptiveResponsesBySlot[adaptiveSlotKey] === "object"
      ? adaptiveResponsesBySlot[adaptiveSlotKey]
      : {};
  const adaptivePrevCount = Math.max(0, Number(adaptiveContextSnapshot?.cigaretteCount) || 0);
  const showAdaptiveCheckin = Boolean(adaptiveSlotKey && adaptiveContextSnapshot);
  const adaptiveFollowupNote = (() => {
    if (!showAdaptiveCheckin) return "";
    if (adaptiveContextSnapshot.riskLevel === "high_risk") {
      return "গত check-in high risk ছিল। এখনই trigger zone থেকে দূরে গিয়ে emergency reset ধরো।";
    }
    if (adaptiveContextSnapshot.riskLevel === "risk") {
      return "গত check-in এ risk signal ছিল। 10-minute reset mindset ধরে রাখো।";
    }
    return "গত check-in protected ছিল। একই discipline calm ভাবে ধরে রাখো।";
  })();
  const setEveningLocationWithFlow = (nextLocation) => {
    const normalized = String(nextLocation || "").toLowerCase();
    setCleanDayField("eveningLocation", normalized);
    if (normalized !== "market") {
      setCleanDayField("eveningWentCarromPlace", "");
      setCleanDayField("eveningPlayedCarrom", "");
      setCleanDayField("smokingDone", "");
      setCleanDayField("cigaretteCount", "");
    }
  };
  const shouldAskMarketQuestions = String(cleanDayForm.eveningLocation || "").toLowerCase() === "market";
  const sleepDurationPreviewMinutes = computeCleanDaySleepDurationMinutes(
    cleanDayForm.localDate || todayLocalDate,
    cleanDayForm.sleepSleptAt,
    cleanDayForm.sleepWokeAt
  );
  const sleepDurationPreviewLabel =
    sleepDurationPreviewMinutes > 0 ? formatCleanDayDurationLabel(sleepDurationPreviewMinutes) : "";
  const canSaveMorningSleep = Boolean(cleanDayForm.sleepSleptAt && cleanDayForm.sleepWokeAt && sleepDurationPreviewMinutes > 0);
  const handleMorningSleepSave = async () => {
    if (!hasActiveChallenge || cleanDayBusy || !canSaveMorningSleep) return;
    const nowIso = new Date().toISOString();
    const inferredResult = resolveCleanDayCloseResult(cleanDayForm) || CLEAN_DAY_DAILY_STATUS.NOT_CLEAN;
    const nextForm = {
      ...cleanDayForm,
      sleepDurationMinutes: sleepDurationPreviewMinutes,
      sleepDurationLabel: sleepDurationPreviewLabel,
      morningSleepSavedAt: nowIso,
      closeDayResult: inferredResult,
      closedAt: cleanDayForm.closedAt || nowIso,
    };
    await saveCleanDayEntry(nextForm);
  };

  return (
    <div className="mindset-shell-card one-trade-main-card clean-day-page-card">
      <div className="mindset-header-row">
        <div className="mindset-main-title">Clean Day</div>
        <div className="mindset-main-subtitle">Protect sleep. Protect discipline. Protect tomorrow&apos;s trader.</div>
      </div>

      <section className="clean-day-section">
        <div className="clean-day-section-head">
          <div className="clean-day-section-title">{challengeHeaderLabel}</div>
          {hasActiveChallenge ? (
            <div className="clean-day-streak">
              Day {cleanDayActiveDayNumber} of {cleanDayTargetDays}
            </div>
          ) : null}
        </div>
        {hasActiveChallenge ? (
          <div className="clean-day-progress-row">
            <div className="clean-day-progress-item">Clean: {cleanDayChallengeProgress.cleanDays}</div>
            <div className="clean-day-progress-item">Recovered: {cleanDayChallengeProgress.recoveredDays}</div>
            <div className="clean-day-progress-item">Not Clean: {cleanDayChallengeProgress.notCleanDays}</div>
          </div>
        ) : (
          <div className="clean-day-chip-row" style={{ marginTop: 10 }}>
            {CLEAN_DAY_CHALLENGE_TARGET_OPTIONS.map((target) => (
              <button
                key={target}
                type="button"
                className="clean-day-chip"
                disabled={cleanDayChallengeBusy}
                onClick={() => startCleanDayChallenge(target)}
                style={
                  cleanDayChallengeBusy
                    ? { opacity: 0.6, cursor: "not-allowed" }
                    : undefined
                }
              >
                Start {target} Day Challenge
              </button>
            ))}
          </div>
        )}
        <div className="clean-day-inline-note" style={{ marginTop: 8 }}>
          {nextCheckinLabel}
        </div>
      </section>

      <section className="clean-day-section">
        <div className="clean-day-section-head">
          <div className="clean-day-section-title">Evening Protection Window: 6 PM – 10 PM</div>
          <div className="clean-day-streak">{eveningWindowStageLabel}</div>
        </div>
        <div className="clean-day-inline-note" style={{ marginTop: 8 }}>
          Hourly check-ins: {completedHourlyCheckins}/5 completed
        </div>
        <div className="clean-day-chip-row">
          {CLEAN_DAY_HOURLY_CHECKIN_SLOTS.map((slot) => {
            const slotMinute = slotMinuteByKey[slot.key] ?? Number.MAX_SAFE_INTEGER;
            const canMarkThisSlot = currentMinuteOfDay >= slotMinute || cleanDayForm[slot.key];
            return (
            <button
              key={slot.key}
              type="button"
              className={`clean-day-chip${cleanDayForm[slot.key] ? " selected" : ""}${currentHourSlotKey === slot.key ? " current" : ""}`}
              onClick={() => markCleanDayHourlyCheckin(slot.key)}
              disabled={!hasActiveChallenge || !canMarkThisSlot}
              style={
                !hasActiveChallenge || !canMarkThisSlot
                  ? { opacity: 0.55, cursor: "not-allowed" }
                  : undefined
              }
            >
              {slot.label} {cleanDayForm[slot.key] ? "✓" : ""}
            </button>
            );
          })}
        </div>
        {isWithinEveningWindow && currentHourSlotKey ? (
          <div className="clean-day-time-prompt">
            এই ঘণ্টার check-in দাও, তারপর evening protection ধরে রাখো।
          </div>
        ) : null}
        {adaptiveFollowupNote ? (
          <div className="clean-day-inline-note" style={{ marginTop: 8 }}>
            {adaptiveFollowupNote}
          </div>
        ) : null}
        {showAdaptiveCheckin ? (
          <>
            {adaptiveContextSnapshot?.location === "market" ? (
              <>
                <div className="clean-day-label" style={{ marginTop: 10 }}>
                  তুমি তো বাজারে ছিলে। এখনো বাজারে আছো, নাকি বাসায় আসছো?
                </div>
                <div className="clean-day-chip-row">
                  {[
                    { value: "still_market", label: "এখনো বাজারে", nextLocation: "market" },
                    { value: "coming_home", label: "বাসায় আসছি", nextLocation: "outside" },
                    { value: "home_arrived", label: "বাসায় চলে এসেছি", nextLocation: "home" },
                    { value: "other_place", label: "অন্য কোথাও", nextLocation: "other" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`clean-day-chip${adaptiveResponse.marketLocationFollowup === option.value ? " selected" : ""}`}
                      onClick={() => {
                        setCleanDayAdaptiveResponse(adaptiveSlotKey, "marketLocationFollowup", option.value);
                        setEveningLocationWithFlow(option.nextLocation);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="clean-day-label" style={{ marginTop: 8 }}>এখন তুমি কোথায়?</div>
                <div className="clean-day-chip-row">
                  {CLEAN_DAY_EVENING_LOCATION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`clean-day-chip${cleanDayForm.eveningLocation === option.value ? " selected" : ""}`}
                      onClick={() => setEveningLocationWithFlow(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {shouldAskMarketQuestions && adaptiveContextSnapshot?.wentCarromPlace === "yes" ? (
              <>
                <div className="clean-day-label" style={{ marginTop: 12 }}>ক্যারামের জায়গা থেকে বের হয়েছো?</div>
                <div className="clean-day-chip-row">
                  {[
                    { value: "still_there", label: "এখনো ওখানে আছি", nextLocation: "market" },
                    { value: "left_place", label: "বের হয়েছি", nextLocation: "outside" },
                    { value: "coming_home", label: "বাসায় আসছি", nextLocation: "outside" },
                    { value: "home_arrived", label: "বাসায় চলে এসেছি", nextLocation: "home" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`clean-day-chip${adaptiveResponse.carromExitStatus === option.value ? " selected" : ""}`}
                      onClick={() => {
                        setCleanDayAdaptiveResponse(adaptiveSlotKey, "carromExitStatus", option.value);
                        setEveningLocationWithFlow(option.nextLocation);
                        setCleanDayField("eveningWentCarromPlace", "yes");
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            ) : shouldAskMarketQuestions ? (
              <>
                <div className="clean-day-label" style={{ marginTop: 12 }}>আজ কি ক্যারামের ওইখানে গিয়েছিলে?</div>
                <div className="clean-day-chip-row">
                  {CLEAN_DAY_YES_NO_BN_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`clean-day-chip${cleanDayForm.eveningWentCarromPlace === option.value ? " selected" : ""}`}
                      onClick={() => {
                        setCleanDayField("eveningWentCarromPlace", option.value);
                        if (option.value === "no") setCleanDayField("eveningPlayedCarrom", "");
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {shouldAskMarketQuestions && adaptiveContextSnapshot?.playedCarrom === "yes" ? (
              <>
                <div className="clean-day-label" style={{ marginTop: 12 }}>খেলা শেষ করেছো?</div>
                <div className="clean-day-chip-row">
                  {[
                    { value: "finished_yes", label: "হ্যাঁ, শেষ" },
                    { value: "still_playing", label: "না, এখনো খেলছি" },
                    { value: "finished_outside", label: "শেষ, কিন্তু এখনো বাইরে" },
                    { value: "finished_coming_home", label: "শেষ, বাসায় আসছি" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`clean-day-chip${adaptiveResponse.playedCarromFollowup === option.value ? " selected" : ""}`}
                      onClick={() => {
                        setCleanDayAdaptiveResponse(adaptiveSlotKey, "playedCarromFollowup", option.value);
                        setCleanDayField("eveningPlayedCarrom", option.value === "still_playing" ? "yes" : "no");
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            ) : shouldAskMarketQuestions && cleanDayForm.eveningWentCarromPlace === "yes" ? (
              <>
                <div className="clean-day-label" style={{ marginTop: 12 }}>খেলেছো কি?</div>
                <div className="clean-day-chip-row">
                  {CLEAN_DAY_YES_NO_BN_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`clean-day-chip${cleanDayForm.eveningPlayedCarrom === option.value ? " selected" : ""}`}
                      onClick={() => setCleanDayField("eveningPlayedCarrom", option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {shouldAskMarketQuestions && adaptiveContextSnapshot?.smokingDone === "yes" && adaptivePrevCount > 0 ? (
              <>
                <div className="clean-day-label" style={{ marginTop: 12 }}>
                  আগের count ছিল {adaptivePrevCount}। এখন count একই আছে, নাকি বেড়েছে?
                </div>
                <div className="clean-day-chip-row">
                  <button
                    type="button"
                    className={`clean-day-chip${adaptiveResponse.smokingCountTrend === "same" ? " selected" : ""}`}
                    onClick={() => {
                      setCleanDayAdaptiveResponse(adaptiveSlotKey, "smokingCountTrend", "same");
                      setCleanDayField("smokingDone", "yes");
                      setCleanDayField("cigaretteCount", String(adaptivePrevCount));
                    }}
                  >
                    একই আছে
                  </button>
                  <button
                    type="button"
                    className={`clean-day-chip${adaptiveResponse.smokingCountTrend === "increased" ? " selected" : ""}`}
                    onClick={() => {
                      setCleanDayAdaptiveResponse(adaptiveSlotKey, "smokingCountTrend", "increased");
                      setCleanDayField("smokingDone", "yes");
                    }}
                  >
                    বেড়েছে
                  </button>
                </div>
                {adaptiveResponse.smokingCountTrend === "increased" ? (
                  <div style={{ marginTop: 10, maxWidth: 210 }}>
                    <div className="clean-day-label">নতুন total cigarette count</div>
                    <input
                      type="number"
                      min={adaptivePrevCount}
                      step="1"
                      value={cleanDayForm.cigaretteCount}
                      onChange={(event) =>
                        setCleanDayField("cigaretteCount", event.target.value.replace(/[^\d]/g, ""))
                      }
                      className="clean-day-time-input"
                      inputMode="numeric"
                      placeholder={String(adaptivePrevCount)}
                    />
                  </div>
                ) : null}
              </>
            ) : shouldAskMarketQuestions ? (
              <>
                <div className="clean-day-label" style={{ marginTop: 12 }}>আজ smoking হয়েছে?</div>
                <div className="clean-day-chip-row">
                  {CLEAN_DAY_YES_NO_BN_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`clean-day-chip${cleanDayForm.smokingDone === option.value ? " selected" : ""}`}
                      onClick={() => {
                        setCleanDayField("smokingDone", option.value);
                        if (option.value === "no") setCleanDayField("cigaretteCount", "");
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {cleanDayForm.smokingDone === "yes" ? (
                  <div style={{ marginTop: 10, maxWidth: 180 }}>
                    <div className="clean-day-label">কয়টা cigarette হয়েছে আজ?</div>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={cleanDayForm.cigaretteCount}
                      onChange={(event) =>
                        setCleanDayField("cigaretteCount", event.target.value.replace(/[^\d]/g, ""))
                      }
                      className="clean-day-time-input"
                      inputMode="numeric"
                      placeholder="0"
                    />
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <>
            <div className="clean-day-label" style={{ marginTop: 8 }}>এখন তুমি কোথায়?</div>
            <div className="clean-day-chip-row">
              {CLEAN_DAY_EVENING_LOCATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`clean-day-chip${cleanDayForm.eveningLocation === option.value ? " selected" : ""}`}
                  onClick={() => setEveningLocationWithFlow(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {shouldAskMarketQuestions ? (
              <>
                <div className="clean-day-label" style={{ marginTop: 12 }}>আজ কি ক্যারামের ওইখানে গিয়েছিলে?</div>
                <div className="clean-day-chip-row">
                  {CLEAN_DAY_YES_NO_BN_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`clean-day-chip${cleanDayForm.eveningWentCarromPlace === option.value ? " selected" : ""}`}
                      onClick={() => {
                        setCleanDayField("eveningWentCarromPlace", option.value);
                        if (option.value === "no") setCleanDayField("eveningPlayedCarrom", "");
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {shouldAskMarketQuestions && cleanDayForm.eveningWentCarromPlace === "yes" ? (
              <>
                <div className="clean-day-label" style={{ marginTop: 12 }}>খেলেছো কি?</div>
                <div className="clean-day-chip-row">
                  {CLEAN_DAY_YES_NO_BN_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`clean-day-chip${cleanDayForm.eveningPlayedCarrom === option.value ? " selected" : ""}`}
                      onClick={() => setCleanDayField("eveningPlayedCarrom", option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {shouldAskMarketQuestions && cleanDayForm.eveningWentCarromPlace === "no" ? (
              <div className="clean-day-time-prompt" style={{ marginTop: 10 }}>
                ক্লিন ডে রাখতে তুমি বেশি দূরে নাই। তোমার জন্য শান্তির ঘুম wait করতেছে।
              </div>
            ) : null}

            {shouldAskMarketQuestions ? (
              <>
                <div className="clean-day-label" style={{ marginTop: 12 }}>আজ smoking হয়েছে?</div>
                <div className="clean-day-chip-row">
                  {CLEAN_DAY_YES_NO_BN_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`clean-day-chip${cleanDayForm.smokingDone === option.value ? " selected" : ""}`}
                      onClick={() => {
                        setCleanDayField("smokingDone", option.value);
                        if (option.value === "no") setCleanDayField("cigaretteCount", "");
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {cleanDayForm.smokingDone === "yes" ? (
                  <div style={{ marginTop: 10, maxWidth: 180 }}>
                    <div className="clean-day-label">কয়টা cigarette হয়েছে আজ?</div>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={cleanDayForm.cigaretteCount}
                      onChange={(event) => setCleanDayField("cigaretteCount", event.target.value.replace(/[^\d]/g, ""))}
                      className="clean-day-time-input"
                      inputMode="numeric"
                      placeholder="0"
                    />
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        )}

        {inferredRiskLevel === "protected" ? (
          <div className="clean-day-time-prompt" style={{ marginTop: 10 }}>
            Protected. Calm থাকো, Clean Day continue করো।
          </div>
        ) : null}
        {inferredRiskLevel === "risk" ? (
          <div className="clean-day-inline-actions">
            <button
              type="button"
              className="mindset-btn-secondary"
              onClick={() => {
                setCleanDayField("eveningResetStartedAt", new Date().toISOString());
                setCleanDayField("sleepProtectionLocked", false);
              }}
            >
              Start 10-Min Reset
            </button>
            {Number.isFinite(resetStartMs) ? (
              <span className="clean-day-inline-note">
                {resetRemainingMs > 0
                  ? `Reset running: ${resetCountdownLabel}`
                  : cleanDayForm.sleepProtectionLocked
                    ? "Reset completed."
                    : "Reset window ended. Mark complete if you held the line."}
              </span>
            ) : (
              <span className="clean-day-inline-note">Short reset before the loop grows.</span>
            )}
            {Number.isFinite(resetStartMs) && resetRemainingMs <= 0 && !cleanDayForm.sleepProtectionLocked ? (
              <button
                type="button"
                className="mindset-btn-secondary"
                onClick={() => setCleanDayField("sleepProtectionLocked", true)}
              >
                Mark Reset Complete
              </button>
            ) : null}
          </div>
        ) : null}
        {inferredRiskLevel === "high_risk" ? (
          <div className="clean-day-inline-actions">
            <button
              type="button"
              className="mindset-btn-secondary"
              onClick={() => setCleanDayField("emergencyLockActivated", true)}
            >
              Emergency Reset
            </button>
            <span className="clean-day-inline-note">
              {cleanDayForm.emergencyLockActivated
                ? "Emergency Reset active. Exit triggers now and protect the night."
                : "High Risk detected. Emergency Reset now."}
            </span>
          </div>
        ) : null}
        {isAfter9pm && !isAfter10pm ? (
          <div className="clean-day-time-prompt">9 PM checkpoint: calm night check-in complete করো।</div>
        ) : null}
        {isAfter10pm ? (
          <div className="clean-day-time-prompt">10 PM checkpoint: final evening check-in দিয়ে দিনটা protect করো।</div>
        ) : null}
      </section>

      <section className="clean-day-section">
        <div className="clean-day-section-head">
          <div className="clean-day-section-title">Morning Sleep Log</div>
          <div className="clean-day-streak">Close previous day</div>
        </div>
        <div className="clean-day-inline-note" style={{ marginTop: 8 }}>
          ঘুম থেকে উঠে slept/woke time দাও। Save করলে previous day close হয়ে next day start হবে।
        </div>
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            <div>
              <div className="clean-day-label">Slept At</div>
              <input
                type="time"
                value={cleanDayForm.sleepSleptAt || ""}
                onChange={(event) => setCleanDayField("sleepSleptAt", event.target.value)}
                className="clean-day-time-input"
              />
            </div>
            <div>
              <div className="clean-day-label">Woke At</div>
              <input
                type="time"
                value={cleanDayForm.sleepWokeAt || ""}
                onChange={(event) => setCleanDayField("sleepWokeAt", event.target.value)}
                className="clean-day-time-input"
              />
            </div>
          </div>
          <div className="clean-day-inline-note">
            {sleepDurationPreviewLabel
              ? `Auto sleep duration: ${sleepDurationPreviewLabel}`
              : "Sleep duration auto-calculate হবে (midnight crossover supported)."}
          </div>
          {cleanDayForm.sleepDurationLabel ? (
            <div className="clean-day-inline-note">
              Last saved sleep: {cleanDayForm.sleepDurationLabel}
            </div>
          ) : null}
          <div className="clean-day-inline-actions">
            <button
              type="button"
              className="mindset-btn-primary"
              onClick={handleMorningSleepSave}
              disabled={!hasActiveChallenge || cleanDayBusy || !canSaveMorningSleep}
              style={
                !hasActiveChallenge || cleanDayBusy || !canSaveMorningSleep
                  ? { opacity: 0.6, cursor: "not-allowed" }
                  : undefined
              }
            >
              Save Morning Sleep Log
            </button>
          </div>
        </div>
      </section>

      <section className="clean-day-section">
        <div className="clean-day-section-head">
          <div className="clean-day-section-title">Daily History</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="clean-day-streak">{dayHistoryRows.length} saved</div>
            <button
              type="button"
              className="clean-day-chip"
              onClick={() => setDailyHistoryOpen((prev) => !prev)}
            >
              {dailyHistoryOpen ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        {!dailyHistoryOpen ? (
          <div className="clean-day-inline-note" style={{ marginTop: 8 }}>
            Daily history hidden.
          </div>
        ) : dayHistoryRows.length === 0 ? (
          <div className="clean-day-inline-note" style={{ marginTop: 8 }}>
            আজকের entry save করলে history/archive এখানে দেখা যাবে।
          </div>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {sortedDayHistoryRows.map((row) => (
              (() => {
                const storyLines = buildCleanDayDailyStory(row);
                const sleepMeta =
                  row?.hourly_checkins && typeof row.hourly_checkins === "object" && row.hourly_checkins.__sleep
                    ? row.hourly_checkins.__sleep
                    : null;
                return (
                  <div
                    key={row.id || `${row.day_number}-${row.local_date}`}
                    style={{
                      border: "1px solid #DDE7F2",
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: "#FFFFFF",
                      display: "grid",
                      gap: 7,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ color: "#0F172A" }}>
                        Day {row.day_number} • {row.local_date || "—"}
                      </strong>
                      <span style={{ color: "#334155", fontWeight: 600 }}>{dailyStatusLabel(row.daily_status)}</span>
                    </div>
                    <div className="clean-day-inline-note">
                      Check-ins: {Number(row.checkins_completed || 0)}/5 • Cigarette: {Number(row.final_cigarette_count || 0)}
                    </div>
                    {sleepMeta?.durationLabel ? (
                      <div className="clean-day-inline-note">
                        Sleep: {sleepMeta.durationLabel}
                      </div>
                    ) : null}
                    <div
                      style={{
                        marginTop: 2,
                        borderTop: "1px solid #EEF2F7",
                        paddingTop: 8,
                        display: "grid",
                        gap: 4,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Daily Story</div>
                      {storyLines.map((line, idx) => (
                        <div key={`${row.id || row.local_date}-story-${idx}`} className="clean-day-inline-note">
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()
            ))}
          </div>
        )}
      </section>

      <section className="clean-day-section">
        <div className="clean-day-section-head">
          <div className="clean-day-section-title">Challenge Archive</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="clean-day-streak">{challengeHistoryRows.length} total</div>
            <button
              type="button"
              className="clean-day-chip"
              onClick={() => setChallengeArchiveOpen((prev) => !prev)}
            >
              {challengeArchiveOpen ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        {!challengeArchiveOpen ? (
          <div className="clean-day-inline-note" style={{ marginTop: 8 }}>
            Challenge archive hidden.
          </div>
        ) : challengeHistoryRows.length === 0 ? (
          <div className="clean-day-inline-note" style={{ marginTop: 8 }}>
            এখনো archive data নেই।
          </div>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {sortedChallengeHistoryRows.map((challenge) => (
              <div
                key={challenge.id}
                style={{
                  border: "1px solid #DDE7F2",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "#FFFFFF",
                  display: "grid",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ color: "#0F172A" }}>{challenge.challenge_name || `${challenge.target_days} Day Challenge`}</strong>
                  <span style={{ color: "#334155", fontWeight: 600 }}>{String(challenge.status || "").toUpperCase() || "UNKNOWN"}</span>
                </div>
                <div className="clean-day-inline-note">
                  Start: {challenge.start_local_date || "—"} • Day {Number(challenge.current_day_number || 1)}/{Number(challenge.target_days || 0)}
                </div>
                <div className="clean-day-inline-note">
                  Clean {Number(challenge.clean_days_count || 0)} • Recovered {Number(challenge.recovered_days_count || 0)} • Not Clean {Number(challenge.not_clean_days_count || 0)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mindset-footer-row clean-day-footer-row">
        <div className="mindset-footer-status">{cleanDayFooterStatus || "Not saved today"}</div>
        <div className="mindset-footer-actions">
          <button
            type="button"
            onClick={saveCleanDayEntry}
            disabled={cleanDayBusy || !hasActiveChallenge}
            className="mindset-btn-primary"
            style={{
              opacity: cleanDayBusy || !hasActiveChallenge ? 0.6 : 1,
              cursor: cleanDayBusy || !hasActiveChallenge ? "not-allowed" : "pointer",
            }}
          >
            <CheckCircle2 size={15} strokeWidth={2.2} />
            {cleanDayBusy ? "Saving..." : "Save Clean Day"}
          </button>
        </div>
      </div>
      <div className="clean-day-date-hint">Date: {cleanDayForm.localDate || todayLocalDate}</div>
    </div>
  );
}

const baseInp = {
  width: "100%",
  background: "#f8fafc",
  borderRadius: 8,
  padding: "10px 14px",
  color: G.text,
  fontSize: 13,
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color 0.2s",
};

function FInput({ style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      style={{ ...baseInp, border: `1px solid ${focused ? G.goldDim : G.border}`, ...style }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function FTextarea({ style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      {...props}
      style={{
        ...baseInp,
        border: `1px solid ${focused ? G.goldDim : G.border}`,
        resize: "vertical",
        lineHeight: 1.65,
        ...style,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function FSelect({ style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <select
      {...props}
      style={{
        ...baseInp,
        border: `1px solid ${focused ? G.goldDim : G.border}`,
        appearance: "none",
        cursor: "pointer",
        ...style,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

const OUTCOME_LABELS = {
  TP: "TP Hit",
  SL: "SL Hit",
  Manual: "Manual Exit",
  Breakeven: "Breakeven",
};

function formatOutcomeLabel(outcome) {
  if (!outcome) return "";
  return OUTCOME_LABELS[outcome] || outcome;
}

function calculateManualJournalPnl(form = {}) {
  const selectedOutcome = String(form?.outcome || "").trim() || "Manual";
  const tradeForCalc = {
    ...form,
    outcome: selectedOutcome,
  };
  if (selectedOutcome === "TP" && !String(tradeForCalc.tpPrice || "").trim()) {
    tradeForCalc.tpPrice = tradeForCalc.closePrice;
  }
  if (selectedOutcome === "SL" && !String(tradeForCalc.slPrice || "").trim()) {
    tradeForCalc.slPrice = tradeForCalc.closePrice;
  }
  const calculated = calculateTradePnl({
    ...tradeForCalc,
  });
  return calculated === "" ? "" : formatNumberInput(calculated);
}

function getManualEntrySeedTime(closeTime = "17:00") {
  const raw = String(closeTime || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "12:00";
  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2])));
  const closeMinutes = hour * 60 + minute;
  if (closeMinutes <= 1) return "00:00";
  const seedMinutes = Math.max(0, closeMinutes - 60);
  const seedHour = Math.floor(seedMinutes / 60);
  const seedMinute = seedMinutes % 60;
  return `${String(seedHour).padStart(2, "0")}:${String(seedMinute).padStart(2, "0")}`;
}

function isMt5ImportedTrade(trade) {
  const sourceText = String(
    trade?.brokerSource ||
      trade?.broker_source ||
      trade?.source ||
      trade?.importSource ||
      trade?.platform ||
      ""
  ).toUpperCase();
  if (sourceText.includes("MT5")) return true;
  if (trade?.brokerTicket || trade?.broker_ticket) return true;
  const planText = String(trade?.tradePlan || trade?.trade_plan || "").toLowerCase();
  if (planText.includes("imported from mt5 ea")) return true;
  return false;
}

function normalizeOneTradeOutcome(outcome) {
  const raw = String(outcome || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "tp" || lower === "tp hit" || lower === "take profit" || lower === "take-profit") {
    return "TP";
  }
  if (lower === "sl" || lower === "sl hit" || lower === "stop loss" || lower === "stop-loss") {
    return "SL";
  }
  if (
    lower === "breakeven" ||
    lower === "break even" ||
    lower === "break-even" ||
    lower === "be"
  ) {
    return "Breakeven";
  }
  if (
    lower === "manual" ||
    lower === "manual close" ||
    lower === "manual exit" ||
    lower === "close"
  ) {
    return "Manual";
  }
  return raw;
}

function resolveMt5TradeDayKey(trade, marketSettings, currentGoldDayKey = "", fallbackLocalDate = "") {
  const explicitKey = String(trade?.trading_day_key || trade?.tradingDayKey || "").slice(0, 10);
  if (explicitKey) return explicitKey;

  const importedAtRaw = String(trade?.importedAt || trade?.imported_at || "").trim();
  if (importedAtRaw) {
    const importedAtDate = new Date(importedAtRaw);
    if (!Number.isNaN(importedAtDate.getTime())) {
      const importedTradingDayKey = String(
        getCountdownToGoldClose(importedAtDate, marketSettings)?.tradingDayKey || ""
      ).slice(0, 10);
      if (importedTradingDayKey) return importedTradingDayKey;
      const importedDateKey = localDateValue(importedAtDate);
      if (importedDateKey) return importedDateKey;
    }
  }

  const computedKey = String(getTradeTradingDayKey(trade, marketSettings) || "").slice(0, 10);
  if (computedKey) return computedKey;

  const rawDateKey = String(trade?.date || "").slice(0, 10);
  if (rawDateKey) return rawDateKey;

  return currentGoldDayKey || fallbackLocalDate || "";
}

function resolveTradeEventMs(trade) {
  const importedAtRaw = String(trade?.importedAt || trade?.imported_at || "").trim();
  if (importedAtRaw) {
    const importedAt = new Date(importedAtRaw);
    if (!Number.isNaN(importedAt.getTime())) return importedAt.getTime();
  }

  return null;
}

function getOneTradeDuplicateKey(trade) {
  if (!trade || typeof trade !== "object") return "";
  const brokerTicket = String(trade?.brokerTicket || trade?.broker_ticket || "").trim();
  if (brokerTicket) return `ticket:${brokerTicket}`;

  const importedAt = String(trade?.importedAt || trade?.imported_at || "").trim();
  const date = String(trade?.date || "").slice(0, 10);
  const time = String(trade?.time || "");
  const pair = String(trade?.pair || "");
  const direction = String(trade?.direction || "");
  const entryPrice = String(trade?.entryPrice || "");
  const closePrice = String(trade?.closePrice || "");
  const lotSize = String(trade?.lotSize || "");
  const outcome = String(trade?.outcome || "");
  const fallback =
    `${date}|${time}|${pair}|${direction}|${entryPrice}|${closePrice}|${lotSize}|${outcome}|${importedAt}`;
  return fallback.trim() ? `sig:${fallback}` : "";
}

function formatTradeSource(trade) {
  if (!trade) return "Manual";
  if (isMt5ImportedTrade(trade)) return "MT5";
  return "Manual";
}

function formatReadinessStatusLabel(status) {
  if (status === READINESS_STATUS.READY_TO_TRADE) return "Ready To Trade";
  if (status === READINESS_STATUS.CAUTION) return "Caution";
  if (status === READINESS_STATUS.DO_NOT_TRADE) return "Do Not Trade";
  return "Not Checked";
}

function formatAttemptStatusLabel(status) {
  if (status === DISCIPLINE_CHALLENGE_STATUS.ACTIVE) return "Active Run";
  if (status === DISCIPLINE_CHALLENGE_STATUS.BROKEN_FROZEN) return "Run Ended";
  if (status === DISCIPLINE_CHALLENGE_STATUS.SCHEDULED) return "Starts After Gold Close";
  if (status === DISCIPLINE_CHALLENGE_STATUS.COMPLETED) return "Completed";
  if (status === DISCIPLINE_CHALLENGE_STATUS.ARCHIVED) return "Archived";
  return "Active Run";
}

function formatShortDateLabel(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatChallengeTitle(challenge) {
  if (!challenge) return "No Active Challenge";
  const challengeName = String(
    challenge.challenge_name || `${challenge.target_clean_days || 0} Clean Days Challenge`
  ).trim();
  const challengeNumber = Number(challenge.challenge_number);
  if (Number.isFinite(challengeNumber) && challengeNumber > 0) {
    return `#${challengeNumber} - ${challengeName}`;
  }
  return challengeName;
}

function formatEntryOrdinalLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "Entry";
  const mod10 = n % 10;
  const mod100 = n % 100;
  let suffix = "th";
  if (mod10 === 1 && mod100 !== 11) suffix = "st";
  else if (mod10 === 2 && mod100 !== 12) suffix = "nd";
  else if (mod10 === 3 && mod100 !== 13) suffix = "rd";
  return `${n}${suffix} Entry`;
}

function parseTradeIdTimestamp(tradeId) {
  const raw = String(tradeId || "");
  const match = raw.match(/^[^-]+-(\d+)-/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function compareTradesChronoAsc(a, b) {
  const dateTimeCompare = `${a?.date || ""}${a?.time || ""}`.localeCompare(
    `${b?.date || ""}${b?.time || ""}`
  );
  if (dateTimeCompare !== 0) return dateTimeCompare;

  const aTs = parseTradeIdTimestamp(a?.id);
  const bTs = parseTradeIdTimestamp(b?.id);
  if (aTs !== null && bTs !== null && aTs !== bTs) return aTs - bTs;

  return String(a?.id || "").localeCompare(String(b?.id || ""));
}

function compareTradesChronoDesc(a, b) {
  return compareTradesChronoAsc(b, a);
}

function formatDurationLabel(ms, options = {}) {
  const includeSeconds = Boolean(options.includeSeconds);
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const totalMinutes = Math.floor(safeMs / 60000);

  if (includeSeconds) {
    if (totalSeconds <= 0) return "0s";
    if (totalSeconds < 60) return `${totalSeconds}s`;
    if (totalSeconds < 3600) {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }

  if (totalMinutes <= 0) return "less than 1m";
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}

function emptyOneTradeRule(userId = "") {
  return {
    id: userId ? `one-trade-${userId}` : "one-trade-local",
    user_id: userId || "",
    disciplineScope: "USER",
    disciplineMarketSettings: {},
    disciplineChallenges: [],
    disciplineDays: [],
    disciplineTradeEvents: [],
    dailyCommitments: [],
    disciplineManualJournalTrades: [],
    disciplineChallengeCounter: 0,
    disciplineNotices: [],
  };
}

function normalizeOneTradeRule(raw, userId = "") {
  const base = emptyOneTradeRule(userId);
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    id: raw.id || base.id,
    user_id: userId || raw.user_id || "",
    disciplineScope: "USER",
    disciplineMarketSettings:
      raw.disciplineMarketSettings && typeof raw.disciplineMarketSettings === "object"
        ? raw.disciplineMarketSettings
        : {},
    disciplineChallenges: Array.isArray(raw.disciplineChallenges) ? raw.disciplineChallenges : [],
    disciplineDays: Array.isArray(raw.disciplineDays) ? raw.disciplineDays : [],
    disciplineTradeEvents: Array.isArray(raw.disciplineTradeEvents) ? raw.disciplineTradeEvents : [],
    dailyCommitments: Array.isArray(raw.dailyCommitments) ? raw.dailyCommitments : [],
    disciplineManualJournalTrades: Array.isArray(raw.disciplineManualJournalTrades)
      ? raw.disciplineManualJournalTrades.map(normalizeTrade)
      : [],
    disciplineChallengeCounter: Number.isFinite(Number(raw.disciplineChallengeCounter))
      ? Number(raw.disciplineChallengeCounter)
      : 0,
    disciplineNotices: Array.isArray(raw.disciplineNotices) ? raw.disciplineNotices : [],
  };
}

function getImportedTradeNote(planText) {
  const raw = String(planText || "").trim();
  if (!raw) return "Auto imported from MT5 EA.";

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const filtered = lines.filter((line) => line.toLowerCase() !== "imported from mt5 ea");
  const cleaned = filtered
    .map((line) => line.replace(/^comment:\s*/i, ""))
    .join("\n")
    .trim();

  return cleaned || "Auto imported from MT5 EA.";
}

function formatReadinessErrorMessage(error, mode = "load") {
  const raw = String(error?.message || "").trim();
  const lower = raw.toLowerCase();

  if (
    lower.includes("relation") ||
    lower.includes("does not exist") ||
    lower.includes("trade_readiness_checks")
  ) {
    return "Mindset table not found in Supabase. Run readiness SQL setup, then reload.";
  }

  if (lower.includes("permission denied") || lower.includes("rls")) {
    return "Mindset table permission blocked by RLS/policy. Check readiness RLS SQL and try again.";
  }

  if (raw) {
    return mode === "save" ? `Could not save mindset check: ${raw}` : `Could not load mindset check: ${raw}`;
  }

  return mode === "save" ? "Could not save mindset check." : "Could not load mindset check.";
}

const READINESS_OPTIONS = {
  sleepQuality: ["Excellent", "Good", "Average", "Poor", "Very Poor"],
  sleepHours: ["8h+", "6-8h", "4-6h", "Less than 4h"],
  meditationDone: ["Yes, 10+ minutes", "Yes, 5 minutes", "No"],
  yesNoPartial: ["Yes", "Partially", "No"],
  yesNo: ["Yes", "No"],
  externalInfluence: ["No", "Slightly", "Yes"],
  currentEmotion: ["Calm", "Focused", "Neutral", "Confident", "Anxious", "Angry", "Greedy", "FOMO", "Revenge Mood", "Tired", "Distracted"],
  previousResultBothering: ["No", "Slightly", "Yes, a lot"],
  revengeRisk: ["No", "Maybe", "Yes"],
  financialPressure: ["No", "Slightly", "Yes"],
  marketBias: ["Bullish", "Bearish", "Range", "No clear bias"],
  maxTradesToday: [0, 1, 2, 3],
};

const SLEEP_QUALITY_DISPLAY_OPTIONS = [
  { value: "Excellent", label: "Fresh 8h+" },
  { value: "Good", label: "Okay 6–8h" },
  { value: "Average", label: "Disturbed 5–6h" },
  { value: "Poor", label: "Tired 4–5h" },
  { value: "Very Poor", label: "No Sleep <4h" },
];

const CLEAN_DAY_EVENING_LOCATION_OPTIONS = [
  { value: "home", label: "বাড়িতে" },
  { value: "market", label: "বাজারে" },
  { value: "outside", label: "বাইরে" },
  { value: "other", label: "অন্য কোথাও" },
];

const CLEAN_DAY_YES_NO_BN_OPTIONS = [
  { value: "no", label: "না" },
  { value: "yes", label: "হ্যাঁ" },
];

const CLEAN_DAY_HOURLY_CHECKIN_SLOTS = [
  { key: "hourlyCheckin6pm", label: "6 PM" },
  { key: "hourlyCheckin7pm", label: "7 PM" },
  { key: "hourlyCheckin8pm", label: "8 PM" },
  { key: "hourlyCheckin9pm", label: "9 PM" },
  { key: "hourlyCheckin10pm", label: "10 PM" },
];
const CLEAN_DAY_CHALLENGE_TARGET_OPTIONS = [7, 15, 30];
const CLEAN_DAY_CHALLENGE_STATUS = {
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  ARCHIVED: "ARCHIVED",
};
const CLEAN_DAY_DAILY_STATUS = {
  CLEAN_DAY: "clean_day",
  RECOVERED_DAY: "recovered_day",
  NOT_CLEAN: "not_clean",
  MISSED: "missed",
};
const CLEAN_DAY_NOTIFICATION_CHANNEL_ID = "clean-day-evening";
const CLEAN_DAY_REMINDER_SCHEDULE = [
  {
    id: 61001,
    hour: 18,
    minute: 0,
    title: "Clean Day • 6 PM Check-in",
    body: "এখন তুমি কোথায়? Evening check-in দাও এবং রাত protect শুরু করো।",
  },
  {
    id: 61002,
    hour: 19,
    minute: 0,
    title: "Clean Day • 7 PM Check-in",
    body: "Carrom trigger + smoking update দাও। Loop grow হওয়ার আগেই stop করো।",
  },
  {
    id: 61003,
    hour: 20,
    minute: 0,
    title: "Clean Day • 8 PM Check-in",
    body: "আজকের অবস্থা confirm করো। Calm থেকে evening protection ধরে রাখো।",
  },
  {
    id: 61004,
    hour: 21,
    minute: 0,
    title: "Clean Day • 9 PM Check-in",
    body: "Night protection check-in দাও। Trigger zone থেকে calm ভাবে দূরে থাকো।",
  },
  {
    id: 61005,
    hour: 22,
    minute: 0,
    title: "Clean Day • 10 PM Final Check-in",
    body: "Final evening check-in দাও। আজকের evening protection steady রাখো।",
  },
  {
    id: 61006,
    hour: 22,
    minute: 30,
    title: "Clean Day • Bed Window",
    body: "10:30–11:00 PM bed window open. এখন wind down করো।",
  },
  {
    id: 61007,
    hour: 23,
    minute: 0,
    title: "Clean Day • Wind-Down",
    body: "Final wind-down reminder. Calm হয়ে go to bed করো।",
  },
];

async function scheduleCleanDayLocalReminders() {
  if (!Capacitor?.isNativePlatform?.()) return false;
  const { LocalNotifications } = await import("@capacitor/local-notifications");

  const hasGrantedPermission = (status) =>
    status?.display === "granted" || status?.receive === "granted";

  let permission = await LocalNotifications.checkPermissions();
  if (!hasGrantedPermission(permission)) {
    permission = await LocalNotifications.requestPermissions();
  }
  if (!hasGrantedPermission(permission)) return false;

  if (Capacitor.getPlatform() === "android") {
    try {
      await LocalNotifications.createChannel({
        id: CLEAN_DAY_NOTIFICATION_CHANNEL_ID,
        name: "Clean Day Reminders",
        description: "OneTrade OS evening reminders (6 PM - 11 PM)",
        importance: 3,
        visibility: 1,
      });
    } catch {
      // channel may already exist
    }
  }

  const idPayload = CLEAN_DAY_REMINDER_SCHEDULE.map((item) => ({ id: item.id }));
  await LocalNotifications.cancel({ notifications: idPayload });
  await LocalNotifications.schedule({
    notifications: CLEAN_DAY_REMINDER_SCHEDULE.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      channelId: CLEAN_DAY_NOTIFICATION_CHANNEL_ID,
      schedule: {
        on: {
          hour: item.hour,
          minute: item.minute,
        },
        repeats: true,
        allowWhileIdle: true,
      },
      extra: {
        targetView: "clean-day-page",
        checkpoint: `${item.hour}:${String(item.minute).padStart(2, "0")}`,
      },
    })),
  });
  return true;
}

function parseCleanDayEveningState(rawState) {
  const raw = String(rawState || "").trim();
  if (!raw) return {};
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return { legacyState: raw.toLowerCase() };
}

function parseLocalDateKey(raw) {
  const text = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split("-").map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function addDaysToLocalDateKey(localDateKey, daysToAdd) {
  const baseDate = parseLocalDateKey(localDateKey);
  if (!baseDate) return localDateValue(new Date());
  const next = new Date(baseDate);
  next.setDate(next.getDate() + Number(daysToAdd || 0));
  return localDateValue(next);
}

function getLocalDateDiffInDays(startLocalDate, endLocalDate) {
  const start = parseLocalDateKey(startLocalDate);
  const end = parseLocalDateKey(endLocalDate);
  if (!start || !end) return 0;
  const millisPerDay = 24 * 60 * 60 * 1000;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((endUtc - startUtc) / millisPerDay);
}

function computeCleanDayChallengeCursor(challenge, referenceLocalDate) {
  if (!challenge?.start_local_date) {
    return {
      dayNumber: 1,
      targetDays: Math.max(1, Number(challenge?.target_days || 7) || 7),
      dayLocalDate: referenceLocalDate,
      outOfRange: false,
    };
  }
  const targetDays = Math.max(1, Number(challenge.target_days || 7) || 7);
  const dayOffset = getLocalDateDiffInDays(challenge.start_local_date, referenceLocalDate);
  const rawDay = dayOffset + 1;
  const pointer = Number(challenge.current_day_number || 0);
  const pointerDay = Number.isFinite(pointer) && pointer > 0 ? pointer : rawDay;
  const safeDayNumber = Math.max(1, Math.min(targetDays, pointerDay));
  return {
    dayNumber: safeDayNumber,
    targetDays,
    dayLocalDate: addDaysToLocalDateKey(challenge.start_local_date, safeDayNumber - 1),
    outOfRange: rawDay > targetDays || rawDay < 1,
  };
}

function emptyCleanDayForm(localDate = localDateValue(new Date())) {
  return {
    localDate,
    eveningLocation: "",
    eveningWentCarromPlace: "",
    eveningPlayedCarrom: "",
    smokingDone: "",
    cigaretteCount: "",
    hourlyCheckin6pm: false,
    hourlyCheckin7pm: false,
    hourlyCheckin8pm: false,
    hourlyCheckin9pm: false,
    hourlyCheckin10pm: false,
    hourlySnapshots: {},
    adaptiveResponses: {},
    eveningResetStartedAt: "",
    sleepProtectionLocked: false,
    shutdownNoOutside: false,
    shutdownNoMoreCigarette: false,
    shutdownNoCarromTrigger: false,
    shutdownReducePhone: false,
    shutdownMoveToBed: false,
    closeDayResult: "",
    emergencyLockActivated: false,
    sleepSleptAt: "",
    sleepWokeAt: "",
    sleepDurationMinutes: 0,
    sleepDurationLabel: "",
    morningSleepSavedAt: "",
    closedAt: "",
    savedAt: "",
    createdAt: "",
    updatedAt: "",
  };
}

function cleanDayFromRow(row = {}) {
  const eveningStateMeta = parseCleanDayEveningState(row.evening_state);
  const hourlyCheckins = eveningStateMeta.hourlyCheckins || {};
  const hourlySnapshots =
    eveningStateMeta.hourlySnapshots && typeof eveningStateMeta.hourlySnapshots === "object"
      ? eveningStateMeta.hourlySnapshots
      : {};
  const adaptiveResponses =
    eveningStateMeta.adaptiveResponses && typeof eveningStateMeta.adaptiveResponses === "object"
      ? eveningStateMeta.adaptiveResponses
      : {};
  const sleepMeta =
    eveningStateMeta.sleepLog && typeof eveningStateMeta.sleepLog === "object"
      ? eveningStateMeta.sleepLog
      : {};
  return {
    localDate: row.local_date || "",
    eveningLocation: String(row.evening_location || "").toLowerCase(),
    eveningWentCarromPlace: String(row.evening_went_carrom_place || "").toLowerCase(),
    eveningPlayedCarrom: String(row.evening_played_carrom || "").toLowerCase(),
    smokingDone: String(row.smoking_done || "").toLowerCase(),
    cigaretteCount: row.cigarette_count === null || row.cigarette_count === undefined ? "" : String(row.cigarette_count),
    hourlyCheckin6pm: Boolean(hourlyCheckins.hourlyCheckin6pm),
    hourlyCheckin7pm: Boolean(hourlyCheckins.hourlyCheckin7pm),
    hourlyCheckin8pm: Boolean(hourlyCheckins.hourlyCheckin8pm),
    hourlyCheckin9pm: Boolean(hourlyCheckins.hourlyCheckin9pm),
    hourlyCheckin10pm: Boolean(hourlyCheckins.hourlyCheckin10pm),
    hourlySnapshots,
    adaptiveResponses,
    eveningResetStartedAt: row.evening_reset_started_at || "",
    sleepProtectionLocked: Boolean(
      row.evening_reset_completed || eveningStateMeta.sleepProtectionLocked
    ),
    shutdownNoOutside: Boolean(eveningStateMeta.shutdownNoOutside),
    shutdownNoMoreCigarette: Boolean(eveningStateMeta.shutdownNoMoreCigarette),
    shutdownNoCarromTrigger: Boolean(eveningStateMeta.shutdownNoCarromTrigger),
    shutdownReducePhone: Boolean(eveningStateMeta.shutdownReducePhone),
    shutdownMoveToBed: Boolean(eveningStateMeta.shutdownMoveToBed),
    closeDayResult: String(eveningStateMeta.closeDayResult || "").toLowerCase(),
    emergencyLockActivated: Boolean(row.emergency_lock_activated),
    sleepSleptAt: String(sleepMeta.sleptAt || ""),
    sleepWokeAt: String(sleepMeta.wokeAt || ""),
    sleepDurationMinutes: Math.max(0, Number(sleepMeta.durationMinutes) || 0),
    sleepDurationLabel: String(sleepMeta.durationLabel || ""),
    morningSleepSavedAt: String(sleepMeta.savedAt || ""),
    closedAt: row.closed_at || "",
    savedAt: row.saved_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function cleanDayRowPayload(form, userId, localDate) {
  const inferredRiskLevel = inferCleanDayRiskLevel(form);
  const resolvedCloseDayResult = resolveCleanDayCloseResult(form);
  const sleepDurationMinutes = Math.max(0, Number(form.sleepDurationMinutes) || 0);
  const sleepDurationLabel =
    String(form.sleepDurationLabel || "").trim() || (sleepDurationMinutes > 0 ? formatCleanDayDurationLabel(sleepDurationMinutes) : "");
  const eveningStatePayload = {
    riskLevel: inferredRiskLevel || "",
    closeDayResult: resolvedCloseDayResult || "",
    sleepProtectionLocked: Boolean(form.sleepProtectionLocked),
    hourlyCheckins: {
      hourlyCheckin6pm: Boolean(form.hourlyCheckin6pm),
      hourlyCheckin7pm: Boolean(form.hourlyCheckin7pm),
      hourlyCheckin8pm: Boolean(form.hourlyCheckin8pm),
      hourlyCheckin9pm: Boolean(form.hourlyCheckin9pm),
      hourlyCheckin10pm: Boolean(form.hourlyCheckin10pm),
    },
    hourlySnapshots:
      form.hourlySnapshots && typeof form.hourlySnapshots === "object"
        ? form.hourlySnapshots
        : {},
    adaptiveResponses:
      form.adaptiveResponses && typeof form.adaptiveResponses === "object"
        ? form.adaptiveResponses
        : {},
    shutdownNoOutside: Boolean(form.shutdownNoOutside),
    shutdownNoMoreCigarette: Boolean(form.shutdownNoMoreCigarette),
    shutdownNoCarromTrigger: Boolean(form.shutdownNoCarromTrigger),
    shutdownReducePhone: Boolean(form.shutdownReducePhone),
    shutdownMoveToBed: Boolean(form.shutdownMoveToBed),
    sleepLog: {
      sleptAt: String(form.sleepSleptAt || "").trim(),
      wokeAt: String(form.sleepWokeAt || "").trim(),
      durationMinutes: sleepDurationMinutes,
      durationLabel: sleepDurationLabel,
      savedAt: String(form.morningSleepSavedAt || "").trim(),
    },
  };
  return {
    user_id: userId,
    local_date: localDate,
    evening_location: form.eveningLocation || null,
    evening_went_carrom_place: form.eveningWentCarromPlace || null,
    evening_played_carrom: form.eveningPlayedCarrom || null,
    smoking_done: form.smokingDone || null,
    cigarette_count:
      form.smokingDone === "yes" && String(form.cigaretteCount || "").trim() !== ""
        ? Math.max(0, Number(form.cigaretteCount) || 0)
        : null,
    evening_state: JSON.stringify(eveningStatePayload),
    evening_reset_started_at: form.eveningResetStartedAt || null,
    evening_reset_completed: Boolean(form.sleepProtectionLocked),
    emergency_lock_activated: Boolean(form.emergencyLockActivated),
    closed_at: form.closedAt || null,
    saved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function inferCleanDayRiskLevel(form = {}) {
  const location = String(form.eveningLocation || "").toLowerCase();
  const wentCarrom = String(form.eveningWentCarromPlace || "").toLowerCase() === "yes";
  const playedCarrom = String(form.eveningPlayedCarrom || "").toLowerCase() === "yes";
  const smokingDone = String(form.smokingDone || "").toLowerCase() === "yes";

  if (playedCarrom || smokingDone) return "high_risk";
  if (location === "market" || location === "outside" || location === "other" || wentCarrom) {
    return "risk";
  }
  if (location === "home" && !wentCarrom && !smokingDone) return "protected";
  return "";
}

function resolveCleanDayCloseResult(form = {}, selectedResult = "") {
  const requested = String(selectedResult || form.closeDayResult || "").toLowerCase();
  const riskLevel = inferCleanDayRiskLevel(form);
  if (!requested) {
    if (riskLevel === "protected") return "clean_day";
    if (riskLevel === "risk") return "recovered_day";
    if (riskLevel === "high_risk") return "not_clean";
    return "";
  }
  if (requested === "not_clean") return "not_clean";
  if (requested === "clean_day" && riskLevel !== "protected") return "recovered_day";
  return requested;
}

function formatCleanDayDurationLabel(durationMinutes) {
  const minutes = Math.max(0, Number(durationMinutes) || 0);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours <= 0) return `${remaining}m`;
  return `${hours}h ${remaining}m`;
}

function computeCleanDaySleepDurationMinutes(localDateKey, sleptAt, wokeAt) {
  const sleepRaw = String(sleptAt || "").trim();
  const wakeRaw = String(wokeAt || "").trim();
  if (!sleepRaw || !wakeRaw) return 0;
  const [sleepH, sleepM] = sleepRaw.split(":").map((v) => Number(v));
  const [wakeH, wakeM] = wakeRaw.split(":").map((v) => Number(v));
  if (![sleepH, sleepM, wakeH, wakeM].every(Number.isFinite)) return 0;
  const baseDate = parseLocalDateKey(localDateKey) || new Date();
  const sleepAt = new Date(baseDate);
  sleepAt.setHours(sleepH, sleepM, 0, 0);
  if (sleepH < 12) sleepAt.setDate(sleepAt.getDate() + 1);
  const wakeAt = new Date(baseDate);
  wakeAt.setHours(wakeH, wakeM, 0, 0);
  if (wakeH < 12) wakeAt.setDate(wakeAt.getDate() + 1);
  if (wakeAt.getTime() <= sleepAt.getTime()) wakeAt.setDate(wakeAt.getDate() + 1);
  const diffMinutes = Math.floor((wakeAt.getTime() - sleepAt.getTime()) / 60000);
  return Math.max(0, diffMinutes);
}

function getCleanDayNarrativeTimeLabel(slotKey) {
  if (slotKey === "hourlyCheckin6pm") return "সন্ধ্যা ৬টার দিকে";
  if (slotKey === "hourlyCheckin7pm") return "সন্ধ্যা ৭টার দিকে";
  if (slotKey === "hourlyCheckin8pm") return "রাত ৮টার দিকে";
  if (slotKey === "hourlyCheckin9pm") return "রাত ৯টার দিকে";
  if (slotKey === "hourlyCheckin10pm") return "রাত ১০টার দিকে";
  return "সন্ধ্যায়";
}

function buildCleanDayDailyStory(dayRow = {}) {
  const historyPayload =
    dayRow?.hourly_checkins && typeof dayRow.hourly_checkins === "object"
      ? dayRow.hourly_checkins
      : {};
  const snapshots = Object.entries(historyPayload)
    .filter(([key, value]) => key !== "__sleep" && value && typeof value === "object")
    .map(([key, value]) => ({ slotKey: key, ...value }));
  const order = ["hourlyCheckin6pm", "hourlyCheckin7pm", "hourlyCheckin8pm", "hourlyCheckin9pm", "hourlyCheckin10pm"];
  snapshots.sort((a, b) => order.indexOf(String(a.slotKey || "")) - order.indexOf(String(b.slotKey || "")));
  const lines = [];
  const firstMarket = snapshots.find((item) => String(item?.location || "").toLowerCase() === "market");
  const hasOutside = snapshots.some((item) => {
    const location = String(item?.location || "").toLowerCase();
    return location === "outside" || location === "other";
  });
  if (firstMarket?.slotKey) {
    lines.push(`তুমি ${getCleanDayNarrativeTimeLabel(firstMarket.slotKey)} বাজারে গেছো।`);
  } else if (hasOutside) {
    lines.push("তুমি সন্ধ্যার দিকে বাইরে ছিলে।");
  } else if (snapshots.length > 0) {
    lines.push("তুমি বেশিরভাগ সময় বাসায় ছিলে।");
  }

  const wentCarrom = snapshots.some((item) => String(item?.wentCarromPlace || "").toLowerCase() === "yes");
  const playedCarrom = snapshots.some((item) => String(item?.playedCarrom || "").toLowerCase() === "yes");
  if (wentCarrom && !playedCarrom) {
    lines.push("তুমি খেলা দেখেছো, কিন্তু খেলোনি।");
  } else if (playedCarrom) {
    lines.push("তুমি ক্যারাম খেলেছো।");
  }

  const marketCigarettes = snapshots
    .filter((item) => String(item?.location || "").toLowerCase() === "market")
    .map((item) => Math.max(0, Number(item?.cigaretteCount) || 0));
  const marketCigaretteCount = marketCigarettes.length > 0 ? Math.max(...marketCigarettes) : 0;
  const totalCigaretteCount = Math.max(0, Number(dayRow?.final_cigarette_count) || 0);
  if (marketCigaretteCount > 0) {
    lines.push(`আজ বাজারে থাকা অবস্থায় ${marketCigaretteCount}টা সিগারেট খেয়েছো।`);
  } else if (totalCigaretteCount > 0) {
    lines.push(`আজ মোট ${totalCigaretteCount}টা সিগারেট খেয়েছো।`);
  } else {
    lines.push("আজ সিগারেট খাওয়া হয়নি।");
  }

  let returnedHomeLine = "ফেরার সময় লগ হয়নি।";
  let wasOutsideBefore = false;
  for (const snapshot of snapshots) {
    const location = String(snapshot?.location || "").toLowerCase();
    if (location === "market" || location === "outside" || location === "other") {
      wasOutsideBefore = true;
      continue;
    }
    if (wasOutsideBefore && location === "home") {
      returnedHomeLine = `তুমি বাসায় ফিরেছো ${getCleanDayNarrativeTimeLabel(snapshot.slotKey)}।`;
      break;
    }
  }
  lines.push(returnedHomeLine);

  const sleepMeta =
    historyPayload?.__sleep && typeof historyPayload.__sleep === "object"
      ? historyPayload.__sleep
      : null;
  if (sleepMeta?.durationLabel) {
    lines.push(`তুমি মোট ${sleepMeta.durationLabel} ঘুমিয়েছো।`);
  }

  const safeLines = lines.filter((line) => line && !/undefined|null/i.test(line));
  if (safeLines.length === 0) {
    return ["আজকের বিস্তারিত সারাংশ তৈরি করার মতো data পাওয়া যায়নি।"];
  }
  return safeLines.slice(0, 5);
}

function ScreenshotUpload({ value, onChange, label, hint }) {
  const ref = useRef(null);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => onChange(e.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <Label>{label}</Label>
      {value ? (
        <div
          style={{
            position: "relative",
            borderRadius: 10,
            overflow: "hidden",
            border: `1px solid ${G.border}`,
          }}
        >
          <img
            src={value}
            alt="chart"
            style={{
              width: "100%",
              display: "block",
              maxHeight: 340,
              objectFit: "contain",
              background: "#f8fafc",
            }}
          />
          <button
            type="button"
            onClick={() => onChange("")}
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: "rgba(0,0,0,0.8)",
              border: `1px solid ${G.border}`,
              color: "#ffffff",
              borderRadius: 6,
              padding: "4px 11px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Remove
          </button>
        </div>
      ) : (
        <div
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files[0]);
          }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => ref.current?.click()}
          style={{
            border: `2px dashed ${G.border}`,
            borderRadius: 10,
            padding: "40px 20px",
            textAlign: "center",
            cursor: "pointer",
            background: "#f8fafc",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = G.goldDim;
            e.currentTarget.style.background = G.goldGlow2;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = G.border;
            e.currentTarget.style.background = "#f8fafc";
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 10 }}>Chart</div>
          <div style={{ color: G.textSub, fontSize: 13, fontWeight: 500 }}>Click or drag and drop</div>
          <div style={{ color: G.textMuted, fontSize: 11, marginTop: 5 }}>{hint}</div>
        </div>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files[0])}
      />
    </div>
  );
}

function StarRating({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const labels = ["", "Poor", "Below Avg", "Average", "Good", "Excellent"];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n === value ? 0 : n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 26,
            padding: "2px",
            transition: "transform 0.12s",
            transform: (hover || value) >= n ? "scale(1.12)" : "scale(1)",
          }}
        >
          <span style={{ filter: (hover || value) >= n ? "none" : "grayscale(1) opacity(0.3)" }}>*</span>
        </button>
      ))}
      {(hover || value) > 0 && (
        <span style={{ marginLeft: 10, fontSize: 13, color: G.textSub }}>{labels[hover || value]}</span>
      )}
    </div>
  );
}

function ChipGroup({ options, value, onChange, multi = false }) {
  const active = (option) => (multi ? (value || []).includes(option) : value === option);

  const toggle = (option) => {
    if (multi) {
      onChange(active(option) ? (value || []).filter((item) => item !== option) : [...(value || []), option]);
    } else {
      onChange(option);
    }
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => toggle(option)}
          style={{
            background: active(option) ? G.goldGlow2 : "transparent",
            border: `1px solid ${active(option) ? G.gold : G.border}`,
            color: active(option) ? G.goldLight : G.textSub,
            borderRadius: 20,
            padding: "5px 14px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: active(option) ? 600 : 400,
            transition: "all 0.15s",
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function Section({ num, title, color, children }) {
  return (
    <div
      style={{
        background: G.bgCard,
        border: `1px solid ${G.border}`,
        borderRadius: 16,
        overflow: "hidden",
        marginBottom: 20,
      }}
    >
      <div
        style={{
          background: G.bgCard2,
          borderBottom: `1px solid ${G.border}`,
          padding: "15px 24px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            fontWeight: 900,
            color: "#fff",
            flexShrink: 0,
            boxShadow: `0 0 16px ${color}55`,
          }}
        >
          {num}
        </div>
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 20,
            fontWeight: 700,
            color: G.goldLight,
          }}
        >
          {title}
        </div>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  );
}

function OneTradeLogoMark({ size = 40 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, #2563EB, #1D4ED8)",
        boxShadow: "0 10px 20px rgba(37, 99, 235, 0.24)",
      }}
      aria-hidden="true"
    >
      <svg width={Math.round(size * 0.72)} height={Math.round(size * 0.72)} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2.3L20 5.3V11.1C20 15.9 16.9 20.4 12 22.3C7.1 20.4 4 15.9 4 11.1V5.3L12 2.3Z"
          fill="rgba(255,255,255,0.2)"
          stroke="#FFFFFF"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M12 7.1V16.7" stroke="#FFFFFF" strokeWidth="2.3" strokeLinecap="round" />
        <path d="M10.3 8.6H12.9" stroke="#FFFFFF" strokeWidth="2.3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function G2({ children, gap = 16 }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap }}>{children}</div>;
}

function G3({ children, gap = 14 }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap }}>{children}</div>;
}

function MetricCard({ label, value, hint, color = G.text }) {
  return (
    <div
      style={{
        background: G.bgCard,
        border: `1px solid ${G.border}`,
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: G.textMuted,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 7,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "monospace" }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: G.textMuted, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

function ProgressCard({ label, value, hint, progress, color = G.gold }) {
  return (
    <div
      style={{
        background: G.bgCard,
        border: `1px solid ${G.border}`,
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: G.textMuted,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 7,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "monospace" }}>{value}</div>
        <div style={{ fontSize: 12, color: G.textMuted }}>{Math.round(progress)}%</div>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: G.bgCard2,
          overflow: "hidden",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, progress))}%`,
            height: "100%",
            borderRadius: 999,
            background: color,
          }}
        />
      </div>
      {hint && <div style={{ fontSize: 12, color: G.textMuted }}>{hint}</div>}
    </div>
  );
}

function PhaseRulesPanel({ stats, locked = false }) {
  const displayStatus = locked
    ? { label: "Locked", color: G.textSub, bg: G.bgCard2 }
    : stats.status;

  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: G.text, marginBottom: 4 }}>
            Prop Firm Account Setup - {stats.phaseLabel}
          </div>
          <div style={{ fontSize: 13, color: G.textMuted }}>
            {locked
              ? "Phase 2 will unlock automatically after Phase 1 is Passed."
              : "This phase keeps its own balance, drawdown, target, and journal progress."}
          </div>
        </div>
        <div
          style={{
            background: displayStatus.bg,
            color: displayStatus.color,
            border: `1px solid ${displayStatus.color}33`,
            borderRadius: 999,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.04em",
          }}
        >
          {displayStatus.label}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <MetricCard label="Starting Balance" value={stats.balance ? fmtMoney(stats.balance) : "--"} hint="Initial account size" color={G.goldLight} />
        <MetricCard
          label="Current Balance"
          value={stats.balance ? fmtMoney(stats.currentBalance) : "--"}
          hint={`Journal PnL ${fmtMoney(stats.totalPnl, true)}`}
          color={stats.currentBalance >= stats.balance ? G.win : G.loss}
        />
        <MetricCard
          label="Target Balance"
          value={stats.profitTarget ? fmtMoney(stats.targetBalance) : "--"}
          hint={stats.profitTarget ? `${fmtMoney(stats.targetRemaining)} left to target` : "Set a profit target"}
          color={stats.targetHit ? G.win : G.gold}
        />
        <MetricCard
          label="Account Floor"
          value={stats.maxDrawdown ? fmtMoney(stats.accountFloor) : "--"}
          hint={stats.maxDrawdown ? `${fmtMoney(stats.maxDrawdown)} max loss allowed` : "Set max drawdown"}
          color={stats.maxBreached ? G.loss : G.text}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <ProgressCard
          label="Profit Target Progress"
          value={stats.profitTarget ? `${Math.round(stats.targetProgress)}%` : "--"}
          hint={
            stats.profitTarget
              ? stats.targetHit
                ? "Target reached from journal PnL"
                : `${fmtMoney(stats.targetRemaining)} still needed`
              : "Set profit target"
          }
          progress={stats.targetProgress}
          color={stats.targetHit ? G.win : G.gold}
        />
        <ProgressCard
          label="Daily DD Buffer"
          value={stats.dailyDrawdown ? fmtMoney(stats.dailyRemaining) : "--"}
          hint={
            stats.dailyDrawdown
              ? `Today ${fmtMoney(stats.todayPnl, true)} | Worst day ${fmtMoney(stats.worstDayPnl, true)}`
              : "Set daily drawdown"
          }
          progress={stats.dailyUsage}
          color={stats.dailyRemaining <= 0 && stats.dailyDrawdown ? G.loss : G.gold}
        />
        <ProgressCard
          label="Max DD Buffer"
          value={stats.maxDrawdown ? fmtMoney(stats.maxRemaining) : "--"}
          hint={
            stats.maxDrawdown
              ? `Lowest balance ${fmtMoney(stats.lowestBalance)} | Floor ${fmtMoney(stats.accountFloor)}`
              : "Set max drawdown"
          }
          progress={stats.maxUsage}
          color={stats.maxBreached ? G.loss : G.win}
        />
      </div>
    </div>
  );
}

function getPhaseStatusChip(stats, label, locked = false) {
  if (locked) {
    return { label: `${label} Locked`, color: G.textSub, bg: G.bgCard2 };
  }
  if (stats.maxBreached) {
    return { label: `${label} Max DD Breached`, color: G.loss, bg: G.lossBg };
  }
  if (stats.dailyBreached) {
    return { label: `${label} Daily DD Breached`, color: G.loss, bg: G.lossBg };
  }
  if (stats.targetHit) {
    return { label: `${label} Passed`, color: G.win, bg: G.winBg };
  }
  return { label: `${label} In Progress`, color: G.goldLight, bg: G.goldGlow2 };
}

function ProjectCard({ project, stats, onOpen, onEdit }) {
  const phase2Stats = getProjectStats(project, "phase2");
  const totalTrades = stats.trades.length + phase2Stats.trades.length;
  const totalPnl = stats.totalPnl + phase2Stats.totalPnl;
  const phase2Locked = !stats.targetHit && phase2Stats.trades.length === 0;
  const phaseStatusChips = [
    getPhaseStatusChip(stats, "Phase 1"),
    getPhaseStatusChip(phase2Stats, "Phase 2", phase2Locked),
  ];

  return (
    <div
      onClick={onOpen}
      style={{
        background: G.bgCard,
        border: `1px solid ${G.border}`,
        borderRadius: 14,
        padding: "18px 18px 16px",
        cursor: "pointer",
        transition: "all 0.18s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = G.borderHover;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = G.border;
        e.currentTarget.style.transform = "none";
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 24,
              fontWeight: 700,
              color: G.goldLight,
              lineHeight: 1,
              marginBottom: 6,
            }}
          >
            {project.name}
          </div>
          <div style={{ fontSize: 12, color: G.textMuted }}>Started {formatDateLabel(project.createdAt?.slice?.(0, 10) || "")}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {phaseStatusChips.map((chip) => (
            <span
              key={chip.label}
              style={{
                background: chip.bg,
                color: chip.color,
                border: `1px solid ${chip.color}33`,
                borderRadius: 999,
                padding: "7px 12px",
                fontSize: 11,
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              {chip.label}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <MetricCard label="Phase 1 Balance" value={stats.balance ? fmtMoney(stats.balance) : "--"} color={G.goldLight} />
        <MetricCard label="Phase 2 Balance" value={phase2Stats.balance ? fmtMoney(phase2Stats.balance) : "--"} color={G.goldLight} />
        <MetricCard
          label="Total PnL"
          value={fmtMoney(totalPnl, true)}
          color={totalPnl >= 0 ? G.win : G.loss}
        />
        <MetricCard label="Trades" value={totalTrades} color={G.gold} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 11,
              color: G.textMuted,
              background: G.bgCard2,
              borderRadius: 6,
              padding: "4px 8px",
            }}
          >
            P1 Target {stats.profitTarget ? fmtMoney(stats.profitTarget) : "--"}
          </span>
          <span
            style={{
              fontSize: 11,
              color: G.textMuted,
              background: G.bgCard2,
              borderRadius: 6,
              padding: "4px 8px",
            }}
          >
            P2 Target {phase2Stats.profitTarget ? fmtMoney(phase2Stats.profitTarget) : "--"}
          </span>
          <span
            style={{
              fontSize: 11,
              color: G.textMuted,
              background: G.bgCard2,
              borderRadius: 6,
              padding: "4px 8px",
            }}
          >
            Max DD {stats.maxDrawdown ? fmtMoney(stats.maxDrawdown) : "--"}
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          style={{
            background: "transparent",
            border: `1px solid ${G.border}`,
            color: G.textSub,
            borderRadius: 8,
            padding: "7px 12px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Edit
        </button>
      </div>
    </div>
  );
}

function TradeCard({
  trade,
  onClick,
  tradeNo,
  amountMode = "money",
  onAmountToggle,
  onEdit,
  onDelete,
  disciplineMode = false,
  disciplineSequenceTag = null,
  brokenDayHighlight = false,
  uiFontFamily = null,
  compactTypography = false,
  premiumCard = false,
  deEmphasizePnl = false,
}) {
  const pnl = Number(trade.pnl);
  const hasPnlValue =
    trade?.pnl !== null &&
    trade?.pnl !== undefined &&
    String(trade?.pnl).trim() !== "";
  const isWin = trade.outcome === "TP";
  const isLoss = trade.outcome === "SL";
  const isImported = isMt5ImportedTrade(trade);
  const sourceLabel = formatTradeSource(trade);
  const entry = Number(trade.entryPrice);
  const exit = Number(getOutcomePrice(trade));
  const directionMultiplier = trade.direction === "SELL" ? -1 : 1;
  const tradePips =
    Number.isFinite(entry) && Number.isFinite(exit) ? (exit - entry) * directionMultiplier : null;
  const showMoney = amountMode !== "pips";
  const amountColor = showMoney
    ? pnl >= 0
      ? G.win
      : G.loss
    : tradePips !== null && tradePips >= 0
      ? G.win
      : G.loss;
  const canToggleAmount = typeof onAmountToggle === "function";
  const baseBorderColor = brokenDayHighlight ? `${G.loss}66` : premiumCard ? "#DDE7F2" : G.border;
  const hoverBorderColor = brokenDayHighlight ? G.loss : premiumCard ? "#BFCCE2" : G.borderHover;
  const amountToggleTitle = showMoney ? "Click to show Pips" : "Click to show P&L";
  const handleAmountToggle = (event) => {
    if (!canToggleAmount) return;
    event.stopPropagation();
    onAmountToggle();
  };

  return (
    <div
      onClick={onClick}
      style={{
        background: G.bgCard,
        border: `1px solid ${baseBorderColor}`,
        borderRadius: premiumCard ? 18 : 12,
        padding: premiumCard ? "20px" : "16px 20px",
        fontFamily: uiFontFamily || "inherit",
        cursor: "pointer",
        transition: "all 0.18s",
        boxShadow: brokenDayHighlight ? `0 0 0 1px ${G.loss}22` : premiumCard ? "0 8px 20px rgba(15, 23, 42, 0.04)" : "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = hoverBorderColor;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = baseBorderColor;
        e.currentTarget.style.transform = "none";
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 10,
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {tradeNo ? (
            <span
              style={{
                background: G.bgCard2,
                color: G.textSub,
                borderRadius: 5,
                padding: "2px 10px",
                fontSize: 11,
                fontWeight: 700,
                border: `1px solid ${G.border}`,
              }}
            >
              Trade #{tradeNo}
            </span>
          ) : null}
          {disciplineSequenceTag ? (
            <span
              title={disciplineSequenceTag.tooltip || ""}
              style={{
                background: disciplineSequenceTag.overtrade ? G.lossBg : G.bgCard2,
                color: disciplineSequenceTag.overtrade ? G.loss : G.goldLight,
                borderRadius: 5,
                padding: "2px 10px",
                fontSize: 11,
                fontWeight: 800,
                border: `1px solid ${disciplineSequenceTag.overtrade ? `${G.loss}55` : G.border}`,
              }}
            >
              {disciplineSequenceTag.label}
            </span>
          ) : null}
          <span
            style={{
              background: trade.direction === "BUY" ? G.winBg : G.lossBg,
              color: trade.direction === "BUY" ? G.win : G.loss,
              borderRadius: 5,
              padding: "2px 10px",
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            {trade.direction}
          </span>
          <span style={{ fontSize: compactTypography ? 14 : 14, color: G.text, fontWeight: compactTypography ? 500 : 700 }}>
            {trade.pair}
          </span>
          <span style={{ fontSize: compactTypography ? 14 : 11, color: G.textMuted, fontWeight: compactTypography ? 500 : 400 }}>
            {isImported ? "Auto Import" : trade.session}
          </span>
          <span style={{ fontSize: compactTypography ? 14 : 11, color: G.textMuted, fontWeight: compactTypography ? 500 : 400 }}>
            Source: {sourceLabel}
          </span>
          <span style={{ fontSize: compactTypography ? 14 : 11, color: G.textMuted, fontWeight: compactTypography ? 500 : 400 }}>
            {trade.date}
          </span>
        </div>
        <div
          role={canToggleAmount ? "button" : undefined}
          tabIndex={canToggleAmount ? 0 : undefined}
          onClick={canToggleAmount ? handleAmountToggle : undefined}
          onKeyDown={
            canToggleAmount
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleAmountToggle(e);
                  }
                }
              : undefined
          }
          title={canToggleAmount ? amountToggleTitle : undefined}
          aria-label={canToggleAmount ? amountToggleTitle : undefined}
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            cursor: canToggleAmount ? "pointer" : "default",
          }}
        >
          {trade.outcome && (
            <span
              style={{
                background: isWin ? G.winBg : isLoss ? G.lossBg : G.goldGlow,
                color: isWin ? G.win : isLoss ? G.loss : G.gold,
                borderRadius: 5,
                padding: "2px 10px",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {formatOutcomeLabel(trade.outcome)}
            </span>
          )}
          {!disciplineMode && (showMoney ? hasPnlValue : tradePips !== null) && (
            <span
              style={{
                color: amountColor,
                fontFamily: compactTypography ? "inherit" : "monospace",
                fontSize: 14,
                fontWeight: compactTypography ? 500 : 800,
                opacity: deEmphasizePnl ? 0.72 : 1,
              }}
            >
              {showMoney
                ? fmtMoney(pnl, true)
                : `${tradePips >= 0 ? "+" : "-"}${Math.abs(tradePips).toFixed(1)} pips`}
            </span>
          )}
        </div>
      </div>

      {!disciplineMode && (
        <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          {trade.entryPrice && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                border: `1px solid ${G.goldDim}55`,
                background: G.goldGlow,
              }}
            >
              <span style={{ fontSize: 10, color: G.textMuted, letterSpacing: "0.08em" }}>ENTRY</span>
              <span
                style={{
                  fontSize: compactTypography ? 14 : 13,
                  fontFamily: compactTypography ? "inherit" : "monospace",
                  color: G.goldLight,
                  fontWeight: compactTypography ? 500 : 700,
                }}
              >
                {trade.entryPrice}
              </span>
            </span>
          )}
          {trade.lotSize && (
            <div>
              <span style={{ fontSize: 10, color: G.textMuted }}>LOT </span>
              <span style={{ fontSize: compactTypography ? 14 : 13, fontFamily: compactTypography ? "inherit" : "monospace", color: G.text, fontWeight: compactTypography ? 500 : 400 }}>
                {trade.lotSize}
              </span>
            </div>
          )}
          {trade.slPrice && (
            <div>
              <span style={{ fontSize: 10, color: G.loss }}>SL </span>
              <span style={{ fontSize: compactTypography ? 14 : 13, fontFamily: compactTypography ? "inherit" : "monospace", color: G.text, fontWeight: compactTypography ? 500 : 400 }}>
                {trade.slPrice}
              </span>
            </div>
          )}
          {trade.tpPrice && (
            <div>
              <span style={{ fontSize: 10, color: G.win }}>TP </span>
              <span style={{ fontSize: compactTypography ? 14 : 13, fontFamily: compactTypography ? "inherit" : "monospace", color: G.text, fontWeight: compactTypography ? 500 : 400 }}>
                {trade.tpPrice}
              </span>
            </div>
          )}
          {trade.riskReward && (
            <div>
              <span style={{ fontSize: 10, color: G.textMuted }}>R:R </span>
              <span
                style={{
                  fontSize: compactTypography ? 14 : 13,
                  fontFamily: compactTypography ? "inherit" : "monospace",
                  color: G.gold,
                  fontWeight: compactTypography ? 500 : 700,
                }}
              >
                {formatRiskReward(trade.riskReward)}
              </span>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {trade.setup && (
            <span
              style={{
                fontSize: 11,
                color: G.goldDim,
                background: G.goldGlow,
                borderRadius: 4,
                padding: "2px 8px",
              }}
            >
              {trade.setup}
            </span>
          )}
          {trade.preScreenshot && (
            <span
              style={{
                fontSize: 11,
                color: G.textMuted,
                background: G.bgCard2,
                borderRadius: 4,
                padding: "2px 8px",
              }}
            >
              Pre chart
            </span>
          )}
          {trade.postScreenshot && (
            <span
              style={{
                fontSize: 11,
                color: G.textMuted,
                background: G.bgCard2,
                borderRadius: 4,
                padding: "2px 8px",
              }}
            >
              Post chart
            </span>
          )}
          {isImported && (
            <span
              style={{
                fontSize: 11,
                color: G.textSub,
                background: G.bgCard2,
                borderRadius: 4,
                padding: "2px 8px",
                border: `1px solid ${G.border}`,
              }}
            >
              Auto Imported (MT5)
            </span>
          )}
          {trade.readinessOverride && (
            <span
              style={{
                fontSize: 11,
                color: G.loss,
                background: G.lossBg,
                borderRadius: 4,
                padding: "2px 8px",
                border: `1px solid ${G.loss}44`,
              }}
            >
              Red Mindset Override
            </span>
          )}
          {isReadinessBreachTrade(trade) && (
            <span
              style={{
                fontSize: 11,
                color: "#B45309",
                background: "#FFF7E6",
                borderRadius: 4,
                padding: "2px 8px",
                border: "1px solid #FCD34D",
              }}
            >
              Readiness Breach
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {trade.rating > 0 && <div>{"*".repeat(trade.rating)}</div>}
          {(onEdit || onDelete) && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {onEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  style={{
                    background: "transparent",
                    border: `1px solid ${G.border}`,
                    color: G.textSub,
                    borderRadius: 6,
                    padding: "3px 8px",
                    cursor: "pointer",
                    fontSize: compactTypography ? 13 : 11,
                    fontWeight: compactTypography ? 600 : 700,
                  }}
                >
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  style={{
                    background: G.lossBg,
                    border: `1px solid ${G.loss}44`,
                    color: G.loss,
                    borderRadius: 6,
                    padding: "3px 8px",
                    cursor: "pointer",
                    fontSize: compactTypography ? 13 : 11,
                    fontWeight: compactTypography ? 600 : 700,
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TradePermissionModal({
  modal,
  onClose,
  onGoToMindsetCheck,
  onContinueAnyway,
  onOverrideAndContinue,
}) {
  if (!modal?.type) return null;

  const isRed = modal.type === "DO_NOT_TRADE";
  const title = isRed ? "Your Trade Permission Is Red Today" : "Trade Permission Check Needed";
  const description = isRed
    ? "Recommended action: do not live trade today."
    : "Complete today's mindset check before taking a new trade.";
  const reasons = Array.isArray(modal.reasons) ? modal.reasons : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          background: G.bgCard,
          border: `1px solid ${isRed ? `${G.loss}55` : G.border}`,
          borderRadius: 14,
          boxShadow: "0 16px 56px rgba(15, 23, 42, 0.24)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            background: isRed ? G.lossBg : G.bgCard2,
            borderBottom: `1px solid ${isRed ? `${G.loss}44` : G.border}`,
          }}
        >
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 25, color: isRed ? G.loss : G.goldLight, fontWeight: 700 }}>
            {title}
          </div>
          <div style={{ marginTop: 5, fontSize: 13, color: G.textSub, lineHeight: 1.55 }}>{description}</div>
        </div>

        <div style={{ padding: 18 }}>
          {reasons.length > 0 && (
            <div
              style={{
                marginBottom: 14,
                padding: "10px 12px",
                border: `1px solid ${isRed ? `${G.loss}33` : G.border}`,
                borderRadius: 10,
                background: "#f8fafc",
                color: G.textSub,
                fontSize: 13,
                lineHeight: 1.65,
              }}
            >
              {reasons.map((reason) => `- ${reason}`).join("\n")}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            {modal.type === "NOT_CHECKED" ? (
              <>
                <button
                  type="button"
                  onClick={onGoToMindsetCheck}
                  style={{
                    border: `1px solid ${G.border}`,
                    background: "transparent",
                    color: G.textSub,
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Go to Mindset Check
                </button>
                <button
                  type="button"
                  onClick={onContinueAnyway}
                  style={{
                    border: "none",
                    background: `linear-gradient(135deg, ${G.gold}, ${G.goldDim})`,
                    color: "#ffffff",
                    borderRadius: 10,
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Continue Anyway
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    border: `1px solid ${G.border}`,
                    background: "transparent",
                    color: G.textSub,
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onOverrideAndContinue}
                  style={{
                    border: "none",
                    background: G.loss,
                    color: "#ffffff",
                    borderRadius: 10,
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Override and Continue
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionModal({ modal, onResolve }) {
  if (!modal) return null;
  const isDanger = modal.tone === "danger";
  const isWarning = modal.tone === "warning";
  const titleColor = isDanger ? G.loss : isWarning ? G.gold : G.goldLight;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => onResolve(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(15, 23, 42, 0.42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          background: G.bgCard,
          border: `1px solid ${isDanger ? `${G.loss}55` : G.border}`,
          borderRadius: 14,
          boxShadow: "0 16px 56px rgba(15, 23, 42, 0.24)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            background: isDanger ? G.lossBg : G.bgCard2,
            borderBottom: `1px solid ${isDanger ? `${G.loss}44` : G.border}`,
          }}
        >
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: titleColor, fontWeight: 700 }}>
            {modal.title || "Notice"}
          </div>
          {modal.message ? (
            <div style={{ marginTop: 6, fontSize: 13, color: G.textSub, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {modal.message}
            </div>
          ) : null}
        </div>
        <div style={{ padding: 18 }}>
          {Array.isArray(modal.bullets) && modal.bullets.length > 0 ? (
            <div
              style={{
                marginBottom: 14,
                padding: "10px 12px",
                border: `1px solid ${G.border}`,
                borderRadius: 10,
                background: "#f8fafc",
                color: G.textSub,
                fontSize: 13,
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
              }}
            >
              {modal.bullets.map((item) => `- ${item}`).join("\n")}
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            {modal.kind === "confirm" ? (
              <>
                <button
                  type="button"
                  onClick={() => onResolve(false)}
                  style={{
                    border: `1px solid ${G.border}`,
                    background: "transparent",
                    color: G.textSub,
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {modal.cancelText || "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => onResolve(true)}
                  style={{
                    border: "none",
                    background: isDanger ? G.loss : `linear-gradient(135deg, ${G.gold}, ${G.goldDim})`,
                    color: "#ffffff",
                    borderRadius: 10,
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {modal.confirmText || "Continue"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onResolve(true)}
                style={{
                  border: "none",
                  background: `linear-gradient(135deg, ${G.gold}, ${G.goldDim})`,
                  color: "#ffffff",
                  borderRadius: 10,
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {modal.confirmText || "OK"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DisciplineChallengeStartModal({
  open,
  selectedTarget,
  onSelectTarget,
  onClose,
  onStart,
}) {
  if (!open) return null;

  const options = [
    { value: 5, title: "5 Days", description: "Reset" },
    { value: 10, title: "10 Days", description: "Consistency" },
    { value: 15, title: "15 Days", description: "Patience" },
  ];
  const normalizedTarget = [5, 10, 15].includes(Number(selectedTarget))
    ? Number(selectedTarget)
    : 10;
  const startButtonLabel = `Start ${normalizedTarget} Days`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10010,
        background: "rgba(15, 23, 42, 0.42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <style>{`@media (max-width: 560px) { .discipline-start-options { grid-template-columns: 1fr !important; } }`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)",
          background: G.bgCard,
          border: `1px solid ${G.border}`,
          borderRadius: 14,
          boxShadow: "0 16px 56px rgba(15, 23, 42, 0.24)",
          overflow: "hidden",
          fontFamily: ONE_TRADE_UI_FONT_STACK,
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            background: G.bgCard2,
            borderBottom: `1px solid ${G.border}`,
          }}
        >
          <div style={{ fontSize: 20, color: G.goldLight, fontWeight: 700 }}>
            Start Challenge
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: G.textSub, lineHeight: 1.6 }}>
            Choose your clean-day target.
          </div>
        </div>

        <div style={{ padding: 20 }}>
          <div
            className="discipline-start-options"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}
          >
            {options.map((item) => {
              const selected = selectedTarget === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onSelectTarget(item.value)}
                  style={{
                    border: `1px solid ${selected ? "#93C5FD" : G.border}`,
                    background: selected ? "#EEF5FF" : "#F8FAFC",
                    borderRadius: 10,
                    padding: "9px 10px",
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 14, color: selected ? "#1D4ED8" : G.text, fontWeight: selected ? 800 : 700 }}>
                    {item.title}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 12, color: G.textMuted }}>
                    {item.description}
                  </div>
                </button>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 12,
              padding: "8px 10px",
              border: `1px solid ${G.border}77`,
              borderRadius: 8,
              background: "#F8FAFC",
              color: G.textSub,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            Rule: One trade per gold day. SL/TP doesn't matter. No second trade.
          </div>

          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: `1px solid ${G.border}`,
                background: "transparent",
                color: G.textSub,
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onStart}
              style={{
                border: "none",
                background: `linear-gradient(135deg, ${G.gold}, ${G.goldDim})`,
                color: "#ffffff",
                borderRadius: 10,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
              >
              {startButtonLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OneTradeManualJournalModal({
  open,
  form,
  onField,
  onClose,
  onSave,
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10020,
        background: "rgba(15, 23, 42, 0.42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        overflow: "hidden",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(760px, 100%)",
          height: "calc(100vh - 24px)",
          maxHeight: "calc(100dvh - 24px)",
          background: G.bgCard,
          border: `1px solid ${G.border}`,
          borderRadius: 14,
          boxShadow: "0 16px 56px rgba(15, 23, 42, 0.24)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          fontFamily: ONE_TRADE_UI_FONT_STACK,
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            background: G.bgCard2,
            borderBottom: `1px solid ${G.border}`,
          }}
        >
          <div style={{ fontSize: 20, color: G.goldLight, fontWeight: 700 }}>
            Manual Journal Entry
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: G.textSub, lineHeight: 1.6 }}>
            Add one trade rule entry manually.
          </div>
        </div>

        <div
          style={{
            padding: 18,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
            flex: "1 1 auto",
            minHeight: 0,
            paddingBottom: 14,
          }}
        >
          <G3 gap={10}>
            <div><Label>Date</Label><FInput type="date" value={form.date} onChange={(e) => onField("date", e.target.value)} /></div>
            <div><Label>Time</Label><FInput type="time" value={form.time} onChange={(e) => onField("time", e.target.value)} /></div>
            <div><Label>Pair</Label><FSelect value={form.pair} onChange={(e) => onField("pair", e.target.value)}>{PAIRS.map((pair) => <option key={pair}>{pair}</option>)}</FSelect></div>
            <div><Label>Session</Label><FSelect value={form.session} onChange={(e) => onField("session", e.target.value)}>{SESSIONS.map((session) => <option key={session}>{session}</option>)}</FSelect></div>
            <div><Label>Direction</Label><FSelect value={form.direction} onChange={(e) => onField("direction", e.target.value)}>{["BUY", "SELL"].map((direction) => <option key={direction}>{direction}</option>)}</FSelect></div>
            <div><Label>Setup</Label><FSelect value={form.setup} onChange={(e) => onField("setup", e.target.value)}>{SETUPS.map((setup) => <option key={setup}>{setup}</option>)}</FSelect></div>
            <div><Label>Outcome</Label><FSelect value={form.outcome} onChange={(e) => onField("outcome", e.target.value)}>{["", "TP", "SL", "Manual", "Breakeven"].map((o) => <option key={o} value={o}>{o || "Select"}</option>)}</FSelect></div>
          </G3>

          <div style={{ height: 10 }} />
          <G2 gap={10}>
            <div><Label>Entry Price</Label><FInput value={form.entryPrice} onChange={(e) => onField("entryPrice", e.target.value)} placeholder="e.g. 3342.50" /></div>
            <div><Label>Exit Price</Label><FInput value={form.closePrice} onChange={(e) => onField("closePrice", e.target.value)} placeholder="e.g. 3350.20" /></div>
            <div><Label>Stop Loss Price</Label><FInput value={form.slPrice} onChange={(e) => onField("slPrice", e.target.value)} placeholder="Optional" /></div>
            <div><Label>Take Profit Price</Label><FInput value={form.tpPrice} onChange={(e) => onField("tpPrice", e.target.value)} placeholder="Optional" /></div>
          </G2>

          <div style={{ height: 10 }} />
          <G2 gap={10}>
            <div><Label>Lot Size</Label><FInput value={form.lotSize} onChange={(e) => onField("lotSize", e.target.value)} placeholder="e.g. 0.10" /></div>
            <div><Label>P&L (Auto)</Label><FInput value={form.pnl} readOnly placeholder="Auto from entry/exit/direction/lot" /></div>
          </G2>

          <div style={{ height: 10 }} />
          <G2 gap={10}>
            <div><Label>Trade Plan</Label><FTextarea rows={3} value={form.tradePlan} onChange={(e) => onField("tradePlan", e.target.value)} /></div>
            <div><Label>Lesson</Label><FTextarea rows={3} value={form.lesson} onChange={(e) => onField("lesson", e.target.value)} /></div>
          </G2>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            flexWrap: "wrap",
            padding: "12px 18px",
            borderTop: `1px solid ${G.border}`,
            background: G.bgCard2,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              border: `1px solid ${G.border}`,
              background: "transparent",
              color: G.textSub,
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            style={{
              border: "none",
              background: `linear-gradient(135deg, ${G.gold}, ${G.goldDim})`,
              color: "#ffffff",
              borderRadius: 10,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Save Entry
          </button>
        </div>
      </div>
    </div>
  );
}

function OneTradeMindsetWarningModal({
  open,
  onCancel,
  onLogNoTradeDay,
  onContinueAnyway,
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10025,
        background: "rgba(15, 23, 42, 0.42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(620px, 100%)",
          background: G.bgCard,
          border: `1px solid ${G.loss}55`,
          borderRadius: 14,
          boxShadow: "0 16px 56px rgba(15, 23, 42, 0.24)",
          overflow: "hidden",
          fontFamily: ONE_TRADE_UI_FONT_STACK,
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            background: G.lossBg,
            borderBottom: `1px solid ${G.loss}44`,
          }}
        >
          <div style={{ fontSize: 22, color: G.loss, fontWeight: 700 }}>
            Mindset Warning
          </div>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 14, color: G.textSub, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {"Today's readiness check says Do Not Trade.\n\nTrading now may increase revenge, FOMO, or impulse risk.\n\nRecommended action:\nLog a No Trade Day."}
          </div>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                border: `1px solid ${G.border}`,
                background: "transparent",
                color: G.textSub,
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onLogNoTradeDay}
              style={{
                border: `1px solid ${G.win}55`,
                background: G.winBg,
                color: G.win,
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Log No Trade Day
            </button>
            <button
              type="button"
              onClick={onContinueAnyway}
              style={{
                border: "none",
                background: G.loss,
                color: "#ffffff",
                borderRadius: 10,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Continue Anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GoldJournal({ session: supabaseSession = null }) {
  const [projects, setProjects] = useState([]);
  const [view, setView] = useState("projects");
  const [projectForm, setProjectForm] = useState(emptyProject());
  const [tradeForm, setTradeForm] = useState(emptyTrade());
  const [oneTradeRule, setOneTradeRule] = useState(emptyOneTradeRule(""));
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedTradeId, setSelectedTradeId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("pre");
  const [search, setSearch] = useState("");
  const [filterDir, setFilterDir] = useState("ALL");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("");
  const [readinessForm, setReadinessForm] = useState(emptyReadinessForm());
  const [todayReadiness, setTodayReadiness] = useState(null);
  const [readinessBusy, setReadinessBusy] = useState(false);
  const [readinessStatus, setReadinessStatus] = useState("");
  const [mindsetFooterEvent, setMindsetFooterEvent] = useState(null);
  const [cleanDayForm, setCleanDayForm] = useState(emptyCleanDayForm());
  const [todayCleanDayEntry, setTodayCleanDayEntry] = useState(null);
  const [cleanDayActiveChallenge, setCleanDayActiveChallenge] = useState(null);
  const [cleanDayChallengeDays, setCleanDayChallengeDays] = useState([]);
  const [cleanDayChallengeHistory, setCleanDayChallengeHistory] = useState([]);
  const [cleanDayChallengeBusy, setCleanDayChallengeBusy] = useState(false);
  const [cleanDayBusy, setCleanDayBusy] = useState(false);
  const [cleanDayStatus, setCleanDayStatus] = useState("");
  const [cleanDayFooterEvent, setCleanDayFooterEvent] = useState(null);
  const [tradePermissionModal, setTradePermissionModal] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [disciplineStartModalOpen, setDisciplineStartModalOpen] = useState(false);
  const [disciplineStartTarget, setDisciplineStartTarget] = useState(10);
  const [oneTradeJournalOpen, setOneTradeJournalOpen] = useState(false);
  const [oneTradeMindsetWarningOpen, setOneTradeMindsetWarningOpen] = useState(false);
  const [oneTradeJournalForm, setOneTradeJournalForm] = useState(emptyTrade());
  const [archiveSectionOpen, setArchiveSectionOpen] = useState(false);
  const [expandedArchiveChallengeId, setExpandedArchiveChallengeId] = useState("");
  const [showBrokenOnlyTrades, setShowBrokenOnlyTrades] = useState(false);
  const [focusTradeSortMode, setFocusTradeSortMode] = useState("newest");
  const [archiveShowBrokenOnlyTrades, setArchiveShowBrokenOnlyTrades] = useState(false);
  const [archiveTradeSortMode, setArchiveTradeSortMode] = useState("newest");
  const [pendingReadinessEntryMeta, setPendingReadinessEntryMeta] = useState(null);
  const [settingsPageSection, setSettingsPageSection] = useState("account");
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [sidebarActiveItem, setSidebarActiveItem] = useState("dashboard");
  const [sidebarAvatarFailed, setSidebarAvatarFailed] = useState(false);
  const oneTradeSectionRef = useRef(null);
  const mindsetSectionRef = useRef(null);
  const tradeJournalSectionRef = useRef(null);
  const projectsSectionRef = useRef(null);
  const hasRequestedCloudLoadRef = useRef(false);
  const cloudInitialLoadDoneRef = useRef(false);
  const cloudSessionRef = useRef(null);
  const skipNextAutoSaveRef = useRef(false);
  const suppressAutoSaveRef = useRef(false);
  const lastCloudSnapshotRef = useRef("");
  const autoSaveTimerRef = useRef(null);
  const isPushingCloudRef = useRef(false);
  const pendingAutoSaveRef = useRef(false);
  const lastAutoCloseRolloverKeyRef = useRef("");
  const actionModalResolverRef = useRef(null);
  const disciplineTradeCountRef = useRef({});
  const [disciplineNowMs, setDisciplineNowMs] = useState(Date.now());
  const sessionUser = supabaseSession?.user || null;
  const sessionUserMeta =
    sessionUser?.user_metadata && typeof sessionUser.user_metadata === "object"
      ? sessionUser.user_metadata
      : {};
  const signedInUserLabel =
    sessionUserMeta?.username ||
    sessionUserMeta?.full_name ||
    sessionUser?.email ||
    (sessionUser?.id ? `User ${sessionUser.id.slice(0, 8)}` : "");
  const sidebarDisplayName =
    String(
      sessionUser?.displayName ||
        sessionUserMeta?.displayName ||
        sessionUser?.username ||
        sessionUserMeta?.username ||
        sessionUser?.email?.split?.("@")?.[0] ||
        "Trader"
    ).trim() || "Trader";
  const sidebarAvatarUrl = String(
    sessionUser?.avatarUrl ||
      sessionUserMeta?.avatarUrl ||
      sessionUser?.photoURL ||
      sessionUserMeta?.photoURL ||
      sessionUser?.image ||
      sessionUserMeta?.image ||
      sessionUser?.profileImage ||
      sessionUserMeta?.profileImage ||
      sessionUserMeta?.avatar_url ||
      ""
  ).trim();
  const sidebarUserInitials = (() => {
    const clean = String(sidebarDisplayName || "").trim();
    if (!clean) return "TR";
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
    }
    return clean.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "TR";
  })();
  const showSidebarAvatarImage = Boolean(sidebarAvatarUrl) && !sidebarAvatarFailed;
  const nowDate = new Date(disciplineNowMs);
  const todayLocalDate = localDateValue(nowDate);
  const oneTradeUserKey = supabaseSession?.user?.id || "__local_user__";
  const usePremiumOneTradeTheme = true;

  useEffect(() => {
    setSidebarAvatarFailed(false);
  }, [sidebarAvatarUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, sidebarCollapsed ? "true" : "false");
    } catch {
      // ignore storage failures
    }
  }, [sidebarCollapsed]);

  function evaluateProjectDiscipline(project) {
    return evaluateDisciplineState(project, { now: nowDate });
  }

  function applyDisciplineToProject(project) {
    return evaluateProjectDiscipline(project).project;
  }

  function buildOneTradeManualTrades(sourceRule = oneTradeRule) {
    const stored = Array.isArray(sourceRule?.disciplineManualJournalTrades)
      ? sourceRule.disciplineManualJournalTrades
      : [];
    const oneTradeMarketSettings = normalizeDisciplineMarketSettings(
      sourceRule?.disciplineMarketSettings || {},
      sourceRule?.id || ""
    );
    const currentGoldDayKey = getCountdownToGoldClose(nowDate, oneTradeMarketSettings)?.tradingDayKey || "";
    const todayGateState = getOneTradeReadinessState(todayReadiness);
    const normalizedStored = stored.map((trade) => {
      const fallbackState = resolveTradeReadinessStateAtTrade(trade);
      const tradeDayKey =
        String(trade?.trading_day_key || trade?.tradingDayKey || trade?.date || "").slice(0, 10);
      const forceTodayBreach =
        todayGateState === ONE_TRADE_READINESS_STATE.DO_NOT_TRADE &&
        Boolean(currentGoldDayKey) &&
        tradeDayKey === currentGoldDayKey;
      const readinessStateAtTrade = forceTodayBreach
        ? ONE_TRADE_READINESS_STATE.DO_NOT_TRADE
        : fallbackState;
      const readinessBreach =
        Boolean(trade?.readinessBreach ?? trade?.readiness_breach) ||
        forceTodayBreach ||
        readinessStateAtTrade === ONE_TRADE_READINESS_STATE.DO_NOT_TRADE ||
          String(trade?.readinessStatusAtEntry || "").toUpperCase() === READINESS_STATUS.DO_NOT_TRADE;

      return normalizeTrade({
        ...trade,
        one_trade_manual: true,
        outcome: trade?.outcome || "Manual",
        readinessStateAtTrade,
        readinessBreach,
        // Keep original linkage only.
        // Do not auto-attach old unlinked trades to a newly started challenge.
        discipline_challenge_id: trade?.discipline_challenge_id || "",
      });
    });

    const dedupeKeys = new Set(
      normalizedStored.map((trade) => getOneTradeDuplicateKey(trade)).filter(Boolean)
    );
    const activeChallenge = getActiveDisciplineChallenge(sourceRule);
    const allChallenges = Array.isArray(sourceRule?.disciplineChallenges)
      ? sourceRule.disciplineChallenges
      : [];
    const fallbackCurrentChallenge =
      [...allChallenges]
        .filter(
          (challenge) =>
            challenge?.status === DISCIPLINE_CHALLENGE_STATUS.BROKEN_FROZEN ||
            challenge?.status === DISCIPLINE_CHALLENGE_STATUS.SCHEDULED
        )
        .sort((a, b) => String(b?.updated_at || "").localeCompare(String(a?.updated_at || "")))[0] ||
      [...allChallenges]
        .filter((challenge) => challenge?.status !== DISCIPLINE_CHALLENGE_STATUS.ARCHIVED)
        .sort((a, b) => String(b?.updated_at || "").localeCompare(String(a?.updated_at || "")))[0] ||
      null;
    const challengeForBridge = activeChallenge || fallbackCurrentChallenge;
    if (!challengeForBridge) {
      return normalizedStored;
    }

    const bridgedImportedTrades = [];
    const projectTrades = Array.isArray(projects)
      ? projects.flatMap((project) =>
          Array.isArray(project?.trades) ? project.trades : []
        )
      : [];
    projectTrades.forEach((projectTrade) => {
      if (!isMt5ImportedTrade(projectTrade)) return;
      const normalized = normalizeTrade(projectTrade);
      const challengeStartMs = new Date(
        challengeForBridge?.created_at || challengeForBridge?.updated_at || ""
      ).getTime();
      const tradeEventMs = resolveTradeEventMs(normalized);
      if (
        Number.isFinite(challengeStartMs) &&
        challengeStartMs > 0 &&
        Number.isFinite(tradeEventMs) &&
        tradeEventMs > 0 &&
        tradeEventMs < challengeStartMs
      ) {
        return;
      }
      const normalizedOutcome = normalizeOneTradeOutcome(normalized?.outcome) || "Manual";
      const rawTradeDayKey = resolveMt5TradeDayKey(
        normalized,
        oneTradeMarketSettings,
        currentGoldDayKey,
        todayLocalDate
      );
      const tradeDateKey = String(normalized?.date || "").slice(0, 10);
      const tradingDayKey = rawTradeDayKey || tradeDateKey || currentGoldDayKey;
      if (!tradingDayKey) return;
      const challengeStartDate = String(challengeForBridge?.start_date || "").slice(0, 10);
      if (challengeStartDate && tradingDayKey < challengeStartDate) return;

      const readinessStateAtTrade = resolveTradeReadinessStateAtTrade(normalized);
      const bridgedTrade = normalizeTrade({
        ...normalized,
        one_trade_manual: false,
        outcome: normalizedOutcome,
        trading_day_key: tradingDayKey,
        discipline_journal_name: normalized?.discipline_journal_name || "Trades Journal",
        discipline_challenge_id: String(challengeForBridge.id),
        readinessStateAtTrade,
        readinessBreach:
          Boolean(normalized?.readinessBreach ?? normalized?.readiness_breach) ||
          readinessStateAtTrade === ONE_TRADE_READINESS_STATE.DO_NOT_TRADE ||
          String(normalized?.readinessStatusAtEntry || "").toUpperCase() ===
            READINESS_STATUS.DO_NOT_TRADE,
      });
      const key = getOneTradeDuplicateKey(bridgedTrade);
      if (key && dedupeKeys.has(key)) return;
      if (key) dedupeKeys.add(key);
      bridgedImportedTrades.push(bridgedTrade);
    });

    return [...normalizedStored, ...bridgedImportedTrades];
  }

  function evaluateOneTradeRule(ruleState = oneTradeRule, atNow = nowDate) {
    const base = normalizeOneTradeRule(
      ruleState,
      supabaseSession?.user?.id || ruleState?.user_id || ""
    );
    const input = {
      ...base,
      disciplineJournalTrades: buildOneTradeManualTrades(base),
    };
    return evaluateDisciplineState(input, { now: atNow });
  }

  function sanitizeOneTradeRuleForStore(nextState) {
    const normalized = normalizeOneTradeRule(
      nextState,
      supabaseSession?.user?.id || nextState?.user_id || ""
    );
    const cleaned = { ...normalized };
    delete cleaned.disciplineJournalTrades;
    cleaned.disciplineChallenges = Array.isArray(cleaned.disciplineChallenges)
      ? cleaned.disciplineChallenges.map((item) => ({ ...item, project_id: "" }))
      : [];
    cleaned.disciplineDays = Array.isArray(cleaned.disciplineDays)
      ? cleaned.disciplineDays.map((item) => ({ ...item, project_id: "" }))
      : [];
    cleaned.disciplineTradeEvents = Array.isArray(cleaned.disciplineTradeEvents)
      ? cleaned.disciplineTradeEvents.map((item) => ({ ...item, project_id: "" }))
      : [];
    cleaned.dailyCommitments = Array.isArray(cleaned.dailyCommitments)
      ? cleaned.dailyCommitments.map((item) => ({ ...item, project_id: "" }))
      : [];
    return cleaned;
  }

  function applyOneTradeRule(nextState, atNow = nowDate) {
    const evaluated = evaluateOneTradeRule(nextState, atNow);
    return sanitizeOneTradeRuleForStore(evaluated.project);
  }

  function snapshotOneTradeRule(ruleState) {
    try {
      const cleaned = sanitizeOneTradeRuleForStore(ruleState || emptyOneTradeRule(""));
      return JSON.stringify(cleaned);
    } catch {
      return "{}";
    }
  }

  function createCloudSyncSnapshot(projectList = projects, ruleState = oneTradeRule) {
    return JSON.stringify({
      projects: snapshotProjects(projectList || []),
      oneTradeRule: snapshotOneTradeRule(ruleState),
    });
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setProjects(migrateStorage(parsed).map(applyDisciplineToProject));
        const storedByUser =
          parsed?.oneTradeRuleByUser && typeof parsed.oneTradeRuleByUser === "object"
            ? parsed.oneTradeRuleByUser
            : {};
        const selectedRule =
          storedByUser[oneTradeUserKey] ||
          (parsed?.oneTradeRule?.user_id === oneTradeUserKey ? parsed.oneTradeRule : null);
        setOneTradeRule(
          normalizeOneTradeRule(selectedRule, supabaseSession?.user?.id || "")
        );
      } else {
        setOneTradeRule(emptyOneTradeRule(supabaseSession?.user?.id || ""));
      }
    } catch (error) {
      console.warn("Could not load local journal data.", error);
      setOneTradeRule(emptyOneTradeRule(supabaseSession?.user?.id || ""));
    }
    setLoaded(true);
  }, [supabaseSession?.user?.id, oneTradeUserKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const nextMap =
        parsed?.oneTradeRuleByUser && typeof parsed.oneTradeRuleByUser === "object"
          ? { ...parsed.oneTradeRuleByUser }
          : {};
      nextMap[oneTradeUserKey] = oneTradeRule;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ projects, oneTradeRuleByUser: nextMap, oneTradeRule })
      );
    } catch (error) {
      console.warn("Could not save local journal data.", error);
    }
  }, [projects, oneTradeRule, loaded, oneTradeUserKey]);

  useEffect(() => {
    if (!loaded) return;
    if (!supabaseSession?.user) return;
    if (!cloudInitialLoadDoneRef.current) return;
    if (suppressAutoSaveRef.current) return;

    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }

    const currentSnapshot = createCloudSyncSnapshot(projects, oneTradeRule);
    if (currentSnapshot === lastCloudSnapshotRef.current) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      pushCloudJournal({ silent: true, sessionOverride: supabaseSession });
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [projects, oneTradeRule, loaded, supabaseSession]);

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return undefined;
    }

    const nextSession = supabaseSession || null;
    cloudSessionRef.current = nextSession;

    if (!nextSession) {
      hasRequestedCloudLoadRef.current = false;
      cloudInitialLoadDoneRef.current = false;
      lastCloudSnapshotRef.current = "";
      return undefined;
    }

    if (!hasRequestedCloudLoadRef.current) {
      hasRequestedCloudLoadRef.current = true;
      setCloudStatus("Auto loading journal from Supabase...");
      setTimeout(() => {
        loadCloudJournal({ silent: true, sessionOverride: nextSession });
      }, 0);
    }

    return undefined;
  }, [supabaseSession]);

  useEffect(() => {
    if (!supabaseSession?.user?.id || !isSupabaseConfigured || !supabase) {
      setTodayReadiness(null);
      setReadinessForm(emptyReadinessForm(todayLocalDate));
      return;
    }
    loadTodayReadiness({ silent: true });
  }, [supabaseSession?.user?.id, todayLocalDate]);

  useEffect(() => {
    if (!supabaseSession?.user?.id || !isSupabaseConfigured || !supabase) {
      setTodayCleanDayEntry(null);
      setCleanDayActiveChallenge(null);
      setCleanDayChallengeDays([]);
      setCleanDayChallengeHistory([]);
      setCleanDayForm(emptyCleanDayForm(todayLocalDate));
      setCleanDayStatus("");
      setCleanDayFooterEvent(null);
      return;
    }
    loadActiveCleanDayChallenge({ silent: true }).then((active) => {
      loadCleanDayChallengeHistory({ silent: true });
      if (!active) {
        loadTodayCleanDayEntry({ silent: true });
      }
    });
  }, [supabaseSession?.user?.id, todayLocalDate]);

  useEffect(() => {
    if (!supabaseSession?.user?.id) return;
    scheduleCleanDayLocalReminders().catch((error) => {
      console.warn("Could not schedule Clean Day local reminders.", error);
    });
  }, [supabaseSession?.user?.id]);

  useEffect(() => {
    if (!Capacitor?.isNativePlatform?.()) return;
    let actionListener = null;
    let isUnmounted = false;

    (async () => {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      if (isUnmounted) return;

      actionListener = await LocalNotifications.addListener(
        "localNotificationActionPerformed",
        (event) => {
          const targetView = event?.notification?.extra?.targetView;
          if (targetView !== "clean-day-page") return;
          setSidebarActiveItem("clean-day");
          setView("clean-day-page");
          setSidebarDrawerOpen(false);
          if (typeof window !== "undefined") {
            window.requestAnimationFrame(() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
            });
          }
        }
      );
    })().catch((error) => {
      console.warn("Could not register Clean Day notification action listener.", error);
    });

    return () => {
      isUnmounted = true;
      if (actionListener?.remove) {
        actionListener.remove().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setOneTradeRule((prev) => applyOneTradeRule(prev, nowDate));
  }, [loaded, todayLocalDate]);

  useEffect(() => {
    const timer = setInterval(() => {
      setDisciplineNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const disciplineEval = evaluateOneTradeRule(oneTradeRule, nowDate);
    const activeChallenge = disciplineEval.activeChallenge;
    if (!activeChallenge) return;

    const evaluation = disciplineEval;
    const key = `one-trade:${evaluation.todayTradingDayKey || todayLocalDate}`;
    const previousCount = disciplineTradeCountRef.current[key];
    const nextCount = evaluation.todayTradesCount || 0;
    disciplineTradeCountRef.current[key] = nextCount;

    if (previousCount === undefined || nextCount <= previousCount) return;
    const firstTradeOutcome = evaluation.todayFirstTradeOutcome || "";

    (async () => {
      if (
        nextCount >= 2 &&
        evaluation.todayDay?.status === DISCIPLINE_DAY_STATUS.BROKEN
      ) {
        await showActionModal({
          kind: "info",
          tone: "danger",
          title: "Broken Day",
          message: "Today's rule was broken.\nRestart tomorrow with honesty, not shame.",
          confirmText: "I Understand",
        });
        return;
      }

      if (nextCount === 1) {
        await showActionModal({
          kind: "info",
          tone: "success",
          title: "Done For Today",
          message: "You did the hard part.\nNow hold the line until the day closes.",
          bullets: [
            "If you take no more trades before gold day close, this becomes a clean day.",
            firstTradeOutcome === "SL"
              ? "SL hit is not failure. Breaking rules after SL is failure."
              : "No second trade. No revenge. Just patience.",
          ],
          confirmText: "I Am Done Until Market Close",
        });
      }
    })();
  }, [loaded, projects, oneTradeRule, todayLocalDate, disciplineNowMs]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const selectedTrade = useMemo(
    () => selectedProject?.trades.find((trade) => trade.id === selectedTradeId) || null,
    [selectedProject, selectedTradeId]
  );

  const stats = useMemo(
    () => (selectedProject ? getProjectStats(selectedProject) : null),
    [selectedProject]
  );
  const phaseStats = useMemo(
    () =>
      selectedProject
        ? Object.fromEntries(PHASES.map((phase) => [phase.id, getProjectStats(selectedProject, phase.id)]))
        : {},
    [selectedProject]
  );

  const filteredTrades = useMemo(() => {
    if (!selectedProject) return [];
    return [...selectedProject.trades]
      .filter((trade) => filterDir === "ALL" || trade.direction === filterDir)
      .filter((trade) => {
        if (!search) return true;
        return [trade.pair, trade.setup, trade.tradePlan, trade.lesson]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase());
      })
      .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  }, [selectedProject, filterDir, search]);
  const selectedProjectTradeNumberById = useMemo(() => {
    if (!selectedProject) return {};
    return Object.fromEntries(
      [...selectedProject.trades]
        .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
        .map((trade, index) => [trade.id, index + 1])
    );
  }, [selectedProject]);

  const readinessPreview = useMemo(() => evaluateReadiness(readinessForm), [readinessForm]);
  const readinessBadge = todayReadiness
    ? `${badgeTextFromReadiness(todayReadiness)}`
    : "Mindset: Not Checked";
  const readinessBadgeVisual = getReadinessVisual(todayReadiness?.status || READINESS_STATUS.NOT_CHECKED);
  const focusDisciplineEvaluation = useMemo(
    () => evaluateOneTradeRule(oneTradeRule, nowDate),
    [oneTradeRule, projects, disciplineNowMs]
  );

  useEffect(() => {
    if (!loaded) return;
    if (!focusDisciplineEvaluation?.transitionsChanged) return;
    setOneTradeRule((prev) => {
      const evaluated = evaluateOneTradeRule(prev, nowDate);
      if (!evaluated?.transitionsChanged) return prev;
      return sanitizeOneTradeRuleForStore(evaluated.project);
    });
  }, [loaded, projects, disciplineNowMs, focusDisciplineEvaluation?.transitionsChanged]);

  const focusDisciplineChallengeLive = focusDisciplineEvaluation?.activeChallenge || null;
  const focusCurrentDisciplineChallenge =
    focusDisciplineEvaluation?.currentChallenge || focusDisciplineChallengeLive || null;
  const focusArchivedChallenges = useMemo(() => {
    const all = Array.isArray(oneTradeRule?.disciplineChallenges)
      ? oneTradeRule.disciplineChallenges
      : [];
    return [...all]
      .filter(
        (challenge) =>
          challenge.status === DISCIPLINE_CHALLENGE_STATUS.ARCHIVED ||
          challenge.status === DISCIPLINE_CHALLENGE_STATUS.COMPLETED
      )
      .sort((a, b) => {
        const aNum = Number(a.challenge_number || 0);
        const bNum = Number(b.challenge_number || 0);
        if (aNum !== bNum) return bNum - aNum;
        return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
      });
  }, [oneTradeRule]);
  const archiveTradesByChallengeId = useMemo(() => {
    const stored = Array.isArray(oneTradeRule?.disciplineManualJournalTrades)
      ? oneTradeRule.disciplineManualJournalTrades
      : [];
    const grouped = {};
    stored.forEach((trade) => {
      const challengeId = String(trade?.discipline_challenge_id || "").trim();
      if (!challengeId) return;
      if (!grouped[challengeId]) grouped[challengeId] = [];
      grouped[challengeId].push(
        normalizeTrade({
          ...trade,
          one_trade_manual: true,
        })
      );
    });
    Object.keys(grouped).forEach((challengeId) => {
      grouped[challengeId].sort(compareTradesChronoDesc);
    });
    return grouped;
  }, [oneTradeRule]);
  const focusMarketSettings = useMemo(
    () =>
      normalizeDisciplineMarketSettings(
        oneTradeRule?.disciplineMarketSettings || {},
        oneTradeRule?.id || ""
      ),
    [oneTradeRule]
  );
  const focusCloseCountdown = useMemo(
    () => getCountdownToGoldClose(nowDate, focusMarketSettings),
    [disciplineNowMs, focusMarketSettings]
  );
  const focusActiveTradingDayKey = String(
    focusDisciplineEvaluation?.todayTradingDayKey ||
      focusCloseCountdown?.tradingDayKey ||
      localDateValue(nowDate)
  ).slice(0, 10);
  useEffect(() => {
    const activeChallenge = focusDisciplineEvaluation?.activeChallenge || null;
    const currentTradingDayKey = focusActiveTradingDayKey;
    if (!activeChallenge?.id || !currentTradingDayKey) return;

    const previousObservedTradingDayKey = lastAutoCloseRolloverKeyRef.current;
    if (!previousObservedTradingDayKey) {
      lastAutoCloseRolloverKeyRef.current = currentTradingDayKey;
      return;
    }
    if (previousObservedTradingDayKey === currentTradingDayKey) return;

    lastAutoCloseRolloverKeyRef.current = currentTradingDayKey;
    const previousGoldDayKey = shiftDateKeyByDays(currentTradingDayKey, -1);
    if (!previousGoldDayKey) return;
    runOneTradeAutoCloseForDay(previousGoldDayKey);
  }, [focusActiveTradingDayKey, focusDisciplineEvaluation?.activeChallenge?.id]);
  const focusDisciplineChecklist = useMemo(
    () =>
      focusCurrentDisciplineChallenge
        ? getChallengeChecklist(
            focusCurrentDisciplineChallenge,
            focusDisciplineEvaluation?.allChallengeDays || []
          )
        : [],
    [focusCurrentDisciplineChallenge, focusDisciplineEvaluation]
  );
  const focusYesterdaySummary = useMemo(() => {
    const currentTradingDayKey = focusActiveTradingDayKey;
    if (!focusCurrentDisciplineChallenge) {
      return {
        heading: "Yesterday",
        title: "No saved result yet.",
        description: "Today, protect the rule.",
      };
    }
    const allChallengeDays = Array.isArray(focusDisciplineEvaluation?.allChallengeDays)
      ? focusDisciplineEvaluation.allChallengeDays
      : [];
    const previousSavedDay = [...allChallengeDays]
      .filter((day) => {
        const key = String(day?.trading_day_key || day?.trade_date || "").slice(0, 10);
        return (
          String(day?.challenge_id || "") === String(focusCurrentDisciplineChallenge.id) &&
          Boolean(day?.finalized_at) &&
          Boolean(key) &&
          key < currentTradingDayKey
        );
      })
      .sort((a, b) =>
        String(b?.trading_day_key || b?.trade_date || "").localeCompare(
          String(a?.trading_day_key || a?.trade_date || "")
        )
      )[0];

    if (!previousSavedDay) {
      return {
        heading: "Yesterday",
        title: "No saved result yet.",
        description: "Today, protect the rule.",
      };
    }

    const status = String(previousSavedDay?.status || "").toUpperCase();
    const dateLabel = formatShortDateLabel(
      String(previousSavedDay?.trading_day_key || previousSavedDay?.trade_date || "")
    );
    if (status === DISCIPLINE_DAY_STATUS.CLEAN) {
      return {
        heading: "Yesterday saved",
        title: `${dateLabel} — Clean Trade Day`,
        description: "You followed the rule and protected discipline.",
      };
    }
    if (status === DISCIPLINE_DAY_STATUS.NO_TRADE) {
      return {
        heading: "Yesterday saved",
        title: `${dateLabel} — No Trade Day`,
        description: "No trade is also discipline.",
      };
    }
    if (status === DISCIPLINE_DAY_STATUS.BROKEN) {
      const reason = String(
        previousSavedDay?.broken_rule_reason ||
          previousSavedDay?.brokenRuleReason ||
          previousSavedDay?.break_reason ||
          ""
      ).trim();
      return {
        heading: "Yesterday saved",
        title: `${dateLabel} — Broken Day`,
        description: reason
          ? `Broken rule: ${reason}\nReview calmly. Today starts fresh.`
          : "Review calmly. Today starts fresh.",
      };
    }
    return {
      heading: "Yesterday saved",
      title: `${dateLabel} — Needs Review`,
      description: "Check yesterday calmly when you are ready.",
    };
  }, [focusActiveTradingDayKey, focusCurrentDisciplineChallenge, focusDisciplineEvaluation, nowDate]);
  const focusRuleJournalTrades = useMemo(() => {
    const all = Array.isArray(focusDisciplineEvaluation?.project?.disciplineJournalTrades)
      ? focusDisciplineEvaluation.project.disciplineJournalTrades
      : [];
    const activeDayKey = focusActiveTradingDayKey;
    const challengeStartMs = (() => {
      if (!focusCurrentDisciplineChallenge) return null;
      const raw = String(
        focusCurrentDisciplineChallenge?.created_at || focusCurrentDisciplineChallenge?.updated_at || ""
      ).trim();
      if (!raw) return null;
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
    })();
    const filtered = focusCurrentDisciplineChallenge
          ? all.filter((trade) => {
              if (trade?.discipline_challenge_id !== focusCurrentDisciplineChallenge.id) return false;
          const tradeDayKey = String(
            trade?.trading_day_key ||
              trade?.tradingDayKey ||
              getTradeTradingDayKey(trade, focusMarketSettings) ||
              trade?.date ||
              ""
          ).slice(0, 10);
          if (!tradeDayKey || tradeDayKey !== activeDayKey) return false;
          if (!Number.isFinite(challengeStartMs) || challengeStartMs <= 0) return true;
          const tradeEventMs = resolveTradeEventMs(trade);
          if (!Number.isFinite(tradeEventMs) || tradeEventMs <= 0) return true;
          return tradeEventMs >= challengeStartMs;
        })
      : all.filter((trade) => {
          const tradeDayKey = String(
            trade?.trading_day_key ||
              trade?.tradingDayKey ||
              getTradeTradingDayKey(trade, focusMarketSettings) ||
              trade?.date ||
              ""
          ).slice(0, 10);
          return Boolean(trade?.one_trade_manual) && tradeDayKey === activeDayKey;
        });
    return filtered.sort(compareTradesChronoDesc);
  }, [focusActiveTradingDayKey, focusCurrentDisciplineChallenge, focusDisciplineEvaluation, nowDate, focusMarketSettings]);
  const focusHasImportedReadinessBreachTrade = useMemo(
    () =>
      focusRuleJournalTrades.some(
        (trade) => isReadinessBreachTrade(trade) && isMt5ImportedTrade(trade)
      ),
    [focusRuleJournalTrades]
  );
  const focusBrokenDayKeySet = useMemo(() => {
    const days = Array.isArray(focusDisciplineEvaluation?.allChallengeDays)
      ? focusDisciplineEvaluation.allChallengeDays
      : [];
    return new Set(
      days
        .filter((day) => day?.status === DISCIPLINE_DAY_STATUS.BROKEN)
        .map((day) => String(day?.trading_day_key || day?.trade_date || ""))
        .filter(Boolean)
    );
  }, [focusDisciplineEvaluation]);
  const focusBrokenMetaByTradeId = useMemo(() => {
    const sortedAsc = [...focusRuleJournalTrades].sort(compareTradesChronoAsc);
    const idsByDay = {};
    sortedAsc.forEach((trade) => {
      const dayKey = String(trade?.trading_day_key || trade?.date || "");
      if (!dayKey) return;
      if (!idsByDay[dayKey]) idsByDay[dayKey] = [];
      idsByDay[dayKey].push(trade.id);
    });
    const meta = {};
    Object.entries(idsByDay).forEach(([dayKey, tradeIds]) => {
      tradeIds.forEach((tradeId, index) => {
        meta[tradeId] = {
          dayKey,
          entryNumber: index + 1,
          brokenDay: focusBrokenDayKeySet.has(dayKey),
          overtrade: index >= 1,
        };
      });
    });
    return meta;
  }, [focusRuleJournalTrades, focusBrokenDayKeySet]);
  const focusVisibleRuleJournalTrades = useMemo(() => {
    if (!showBrokenOnlyTrades) return focusRuleJournalTrades;
    return focusRuleJournalTrades.filter((trade) => Boolean(focusBrokenMetaByTradeId[trade.id]?.brokenDay));
  }, [focusRuleJournalTrades, focusBrokenMetaByTradeId, showBrokenOnlyTrades]);
  const focusTradeNumberById = useMemo(
    () =>
      Object.fromEntries(
        [...focusRuleJournalTrades]
          .sort(compareTradesChronoAsc)
          .map((trade, index) => [trade.id, index + 1])
      ),
    [focusRuleJournalTrades]
  );
  const focusSortedRuleJournalTrades = useMemo(() => {
    const list = [...focusVisibleRuleJournalTrades];
    const pnlValue = (trade) => {
      const n = Number(trade?.pnl);
      return Number.isFinite(n) ? n : null;
    };
    if (focusTradeSortMode === "trade_asc") {
      return list.sort(
        (a, b) => (focusTradeNumberById[a.id] || Number.MAX_SAFE_INTEGER) - (focusTradeNumberById[b.id] || Number.MAX_SAFE_INTEGER)
      );
    }
    if (focusTradeSortMode === "trade_desc") {
      return list.sort(
        (a, b) => (focusTradeNumberById[b.id] || 0) - (focusTradeNumberById[a.id] || 0)
      );
    }
    if (focusTradeSortMode === "pnl_desc") {
      return list.sort((a, b) => {
        const aPnl = pnlValue(a);
        const bPnl = pnlValue(b);
        if (aPnl === null && bPnl === null) return 0;
        if (aPnl === null) return 1;
        if (bPnl === null) return -1;
        return bPnl - aPnl;
      });
    }
    if (focusTradeSortMode === "pnl_asc") {
      return list.sort((a, b) => {
        const aPnl = pnlValue(a);
        const bPnl = pnlValue(b);
        if (aPnl === null && bPnl === null) return 0;
        if (aPnl === null) return 1;
        if (bPnl === null) return -1;
        return aPnl - bPnl;
      });
    }
    return list.sort((a, b) =>
      compareTradesChronoDesc(a, b)
    );
  }, [focusVisibleRuleJournalTrades, focusTradeSortMode, focusTradeNumberById]);
  const focusRuleTradeNumberById = useMemo(
    () => focusTradeNumberById,
    [focusTradeNumberById]
  );
  const focusHasAnyRuleJournalTrades = focusRuleJournalTrades.length > 0;

  const setProjectField = (key, value) => setProjectForm((prev) => ({ ...prev, [key]: value }));
  const setTradeField = (key, value) => setTradeForm((prev) => ({ ...prev, [key]: value }));
  const setReadinessField = (key, value) => {
    setMindsetFooterEvent(null);
    setReadinessForm((prev) => ({ ...prev, [key]: value }));
  };
  const setCleanDayField = (key, value) => {
    setCleanDayFooterEvent(null);
    setCleanDayForm((prev) => ({ ...prev, [key]: value }));
  };
  const setCleanDayAdaptiveResponse = (slotKey, questionKey, value) => {
    if (!slotKey || !questionKey) return;
    setCleanDayFooterEvent(null);
    setCleanDayForm((prev) => {
      const prevAdaptive =
        prev.adaptiveResponses && typeof prev.adaptiveResponses === "object"
          ? prev.adaptiveResponses
          : {};
      const prevSlot =
        prevAdaptive[slotKey] && typeof prevAdaptive[slotKey] === "object"
          ? prevAdaptive[slotKey]
          : {};
      return {
        ...prev,
        adaptiveResponses: {
          ...prevAdaptive,
          [slotKey]: {
            ...prevSlot,
            [questionKey]: value,
          },
        },
      };
    });
  };

  const requireCloudConfig = () => {
    if (isSupabaseConfigured && supabase) return true;
    alert("Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the app.");
    return false;
  };

  const signOutCloud = async () => {
    if (!requireCloudConfig()) return;

    suppressAutoSaveRef.current = true;
    skipNextAutoSaveRef.current = true;

    setCloudBusy(true);
    setCloudStatus("Signing out...");
    const { error } = await supabase.auth.signOut();

    if (error) {
      suppressAutoSaveRef.current = false;
      setCloudBusy(false);
      setCloudStatus("");
      alert(error.message);
      return;
    }

    cloudSessionRef.current = null;
    hasRequestedCloudLoadRef.current = false;
    cloudInitialLoadDoneRef.current = false;
    lastCloudSnapshotRef.current = "";

    setProjects([]);
    setOneTradeRule(emptyOneTradeRule(""));
    setSelectedProjectId("");
    setSelectedTradeId("");
    setSearch("");
    setFilterDir("ALL");
    setView("projects");
    localStorage.removeItem(STORAGE_KEY);

    setCloudBusy(false);
    setCloudStatus("Signed out. Local journal cleared.");

    setTimeout(() => {
      suppressAutoSaveRef.current = false;
    }, 1000);
  };

  async function loadCloudJournal({ silent = false, sessionOverride = null } = {}) {
    if (!requireCloudConfig()) return false;

    const session = sessionOverride || cloudSessionRef.current || supabaseSession;
    if (!session?.user) return false;

    if (
      !silent &&
      projects.length > 0 &&
      !confirm("Load cloud journal?\n\nThis will replace the current local journal data with the Supabase version.")
    ) {
      return false;
    }

    setCloudBusy(true);
    setCloudStatus(silent ? "Auto loading journal from Supabase..." : "Loading journal from Supabase...");

    const { data: projectRows, error: projectError } = await supabase
      .from("projects")
      .select("id,name,data,created_at,updated_at")
      .order("created_at", { ascending: false });
    const { data: tradeRows, error: tradeError } = await supabase
      .from("trades")
      .select("id,project_id,data,created_at,updated_at")
      .order("created_at", { ascending: false });
    const { data: oneTradeRuleRow, error: oneTradeRuleError } = await supabase
      .from("one_trade_rule_states")
      .select("state")
      .eq("user_id", session.user.id)
      .maybeSingle();

    setCloudBusy(false);

    if (projectError || tradeError) {
      cloudInitialLoadDoneRef.current = false;
      setCloudStatus("");
      alert(projectError?.message || tradeError?.message || "Could not load cloud journal.");
      return false;
    }

    if (oneTradeRuleError) {
      const errorText = String(oneTradeRuleError.message || "").toLowerCase();
      if (errorText.includes("does not exist") || errorText.includes("relation")) {
        setCloudStatus(
          "Cloud projects loaded. One Trade Rule cloud state table missing. Run supabase_one_trade_rule_state_setup.sql once."
        );
      } else {
        setCloudStatus(`Cloud projects loaded. One Trade Rule state load warning: ${oneTradeRuleError.message}`);
      }
    }

    const cloudProjects = buildProjectsFromCloud(projectRows || [], tradeRows || []).map(
      applyDisciplineToProject
    );
    const loadedOneTradeRule = normalizeOneTradeRule(
      oneTradeRuleRow?.state && typeof oneTradeRuleRow.state === "object" ? oneTradeRuleRow.state : null,
      session.user.id
    );
    skipNextAutoSaveRef.current = true;
    lastCloudSnapshotRef.current = createCloudSyncSnapshot(cloudProjects, loadedOneTradeRule);
    cloudInitialLoadDoneRef.current = true;

    setProjects(cloudProjects);
    setOneTradeRule(loadedOneTradeRule);
    setSelectedProjectId(cloudProjects[0]?.id || "");
    setSelectedTradeId("");
    setSearch("");
    setFilterDir("ALL");
    setView("projects");
    if (!oneTradeRuleError) {
      setCloudStatus(`Loaded ${cloudProjects.length} project(s) and One Trade Rule state from Supabase.`);
    }
    return true;
  }

  async function pushCloudJournal({
    silent = false,
    sessionOverride = null,
    projectsOverride = null,
    oneTradeRuleOverride = null,
  } = {}) {
    if (!requireCloudConfig()) return false;

    const session = sessionOverride || cloudSessionRef.current || supabaseSession;
    if (!session?.user) return false;

    if (!silent && !confirm("Push local journal to Supabase?\n\nThis will replace your current cloud journal with this local version.")) {
      return false;
    }

    if (isPushingCloudRef.current) {
      if (silent) pendingAutoSaveRef.current = true;
      return false;
    }

    const userId = session.user.id;
    const sourceProjects = Array.isArray(projectsOverride) ? projectsOverride : projects;
    const sourceOneTradeRule =
      oneTradeRuleOverride && typeof oneTradeRuleOverride === "object"
        ? oneTradeRuleOverride
        : oneTradeRule;
    const normalizedProjects = sourceProjects.map(normalizeProject);
    const tradeCount = normalizedProjects.reduce((sum, project) => sum + project.trades.length, 0);
    const sanitizedOneTradeRule = sanitizeOneTradeRuleForStore(sourceOneTradeRule);
    const nextSnapshot = createCloudSyncSnapshot(normalizedProjects, sanitizedOneTradeRule);

    isPushingCloudRef.current = true;
    setCloudBusy(true);
    setCloudStatus(silent ? "Auto saving journal to Supabase..." : "Replacing cloud journal...");

    const { error: deleteTradesError } = await supabase.from("trades").delete().eq("user_id", userId);
    if (deleteTradesError) {
      isPushingCloudRef.current = false;
      setCloudBusy(false);
      setCloudStatus("");
      alert(deleteTradesError.message);
      return false;
    }

    const { error: deleteProjectsError } = await supabase.from("projects").delete().eq("user_id", userId);
    if (deleteProjectsError) {
      isPushingCloudRef.current = false;
      setCloudBusy(false);
      setCloudStatus("");
      alert(deleteProjectsError.message);
      return false;
    }

    if (normalizedProjects.length === 0) {
      const { error: oneTradeStateUpsertErrorWhenEmpty } = await supabase
        .from("one_trade_rule_states")
        .upsert(
          {
            user_id: userId,
            state: sanitizedOneTradeRule,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      if (oneTradeStateUpsertErrorWhenEmpty) {
        const errorText = String(oneTradeStateUpsertErrorWhenEmpty.message || "").toLowerCase();
        isPushingCloudRef.current = false;
        setCloudBusy(false);
        setCloudStatus("");
        if (errorText.includes("does not exist") || errorText.includes("relation")) {
          alert("One Trade Rule cloud state table missing. Run supabase_one_trade_rule_state_setup.sql once.");
        } else {
          alert(oneTradeStateUpsertErrorWhenEmpty.message);
        }
        return false;
      }

      lastCloudSnapshotRef.current = nextSnapshot;
      cloudInitialLoadDoneRef.current = true;
      isPushingCloudRef.current = false;
      setCloudBusy(false);
      setCloudStatus("Cloud journal cleared.");

      if (pendingAutoSaveRef.current) {
        pendingAutoSaveRef.current = false;
        setTimeout(() => pushCloudJournal({ silent: true }), 250);
      }

      return true;
    }

    const projectPayload = normalizedProjects.map((project) => ({
      user_id: userId,
      name: project.name,
      data: projectDataForCloud(project),
    }));
    const { data: insertedProjects, error: insertProjectError } = await supabase
      .from("projects")
      .insert(projectPayload)
      .select("id,data");

    if (insertProjectError) {
      isPushingCloudRef.current = false;
      setCloudBusy(false);
      setCloudStatus("");
      alert(insertProjectError.message);
      return false;
    }

    const cloudProjectIdByLocalId = Object.fromEntries(
      (insertedProjects || []).map((project) => [project.data?.id, project.id])
    );
    const tradePayload = normalizedProjects.flatMap((project) =>
      project.trades.map((trade) => ({
        user_id: userId,
        project_id: cloudProjectIdByLocalId[project.id],
        data: normalizeTrade(trade),
      }))
    );

    if (tradePayload.length > 0) {
      const { error: insertTradeError } = await supabase.from("trades").insert(tradePayload);
      if (insertTradeError) {
        isPushingCloudRef.current = false;
        setCloudBusy(false);
        setCloudStatus("");
        alert(insertTradeError.message);
        return false;
      }
    }

    lastCloudSnapshotRef.current = nextSnapshot;
    cloudInitialLoadDoneRef.current = true;
    isPushingCloudRef.current = false;
    setCloudBusy(false);
    setCloudStatus(
      silent
        ? `Auto saved ${normalizedProjects.length} project(s) and ${tradeCount} trade(s) to Supabase.`
        : `Synced ${normalizedProjects.length} project(s) and ${tradeCount} trade(s) to Supabase.`
    );

    if (pendingAutoSaveRef.current) {
      pendingAutoSaveRef.current = false;
      setTimeout(() => pushCloudJournal({ silent: true }), 250);
    }

    return true;
  }

  async function persistOneTradeRuleStateNow(nextRuleState) {
    if (!isSupabaseConfigured || !supabase || !supabaseSession?.user?.id) return true;
    const { error } = await supabase.from("one_trade_rule_states").upsert(
      {
        user_id: supabaseSession.user.id,
        state: sanitizeOneTradeRuleForStore(nextRuleState),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) {
      const errorText = String(error.message || "").toLowerCase();
      if (errorText.includes("does not exist") || errorText.includes("relation")) {
        setCloudStatus("State saved locally. Cloud state table missing. Run supabase_one_trade_rule_state_setup.sql once.");
      } else {
        setCloudStatus(`State saved locally. Cloud write warning: ${error.message}`);
      }
      return false;
    }
    return true;
  }

  async function loadTodayReadiness({ silent = false } = {}) {
    if (!isSupabaseConfigured || !supabase || !supabaseSession?.user?.id) {
      setTodayReadiness(null);
      setReadinessForm(emptyReadinessForm(todayLocalDate));
      if (!silent) setReadinessStatus("Supabase session missing. Mindset check is currently Not Checked.");
      return false;
    }

    setReadinessBusy(true);
    const { data, error } = await supabase
      .from("trade_readiness_checks")
      .select("*")
      .eq("user_id", supabaseSession.user.id)
      .eq("check_date", todayLocalDate)
      .maybeSingle();
    setReadinessBusy(false);

    if (error) {
      setTodayReadiness(null);
      setReadinessForm(emptyReadinessForm(todayLocalDate));
      setReadinessStatus(formatReadinessErrorMessage(error, "load"));
      return false;
    }

    if (!data) {
      setTodayReadiness(null);
      setReadinessForm(emptyReadinessForm(todayLocalDate));
      if (!silent) setReadinessStatus("No mindset check found for today.");
      return true;
    }

    const loaded = evaluateReadiness(readinessFromRow(data));
    setTodayReadiness(loaded);
    setReadinessForm(loaded);
    setReadinessStatus(silent ? "" : "Today's readiness loaded.");
    return true;
  }

  async function loadCleanDayEntryForDate(localDate, { silent = false } = {}) {
    if (!isSupabaseConfigured || !supabase || !supabaseSession?.user?.id) {
      setTodayCleanDayEntry(null);
      setCleanDayForm(emptyCleanDayForm(localDate || todayLocalDate));
      if (!silent) setCleanDayStatus("Supabase session missing. Could not load Clean Day.");
      return false;
    }

    const targetLocalDate = String(localDate || todayLocalDate).trim() || todayLocalDate;
    setCleanDayBusy(true);
    const { data, error } = await supabase
      .from("clean_day_entries")
      .select("*")
      .eq("user_id", supabaseSession.user.id)
      .eq("local_date", targetLocalDate)
      .maybeSingle();
    setCleanDayBusy(false);

    if (error) {
      setTodayCleanDayEntry(null);
      setCleanDayForm(emptyCleanDayForm(targetLocalDate));
      setCleanDayStatus(`Could not load Clean Day: ${error.message || "unknown error"}`);
      return false;
    }

    if (!data) {
      setTodayCleanDayEntry(null);
      setCleanDayForm(emptyCleanDayForm(targetLocalDate));
      setCleanDayStatus(silent ? "" : "No Clean Day entry found for today.");
      return true;
    }

    const loaded = cleanDayFromRow(data);
    setTodayCleanDayEntry(loaded);
    setCleanDayForm(loaded);
    setCleanDayStatus(silent ? "" : "Today's Clean Day loaded.");
    return true;
  }

  async function loadTodayCleanDayEntry({ silent = false } = {}) {
    return loadCleanDayEntryForDate(todayLocalDate, { silent });
  }

  async function loadCleanDayChallengeDays(challengeId) {
    if (!challengeId || !supabaseSession?.user?.id || !isSupabaseConfigured || !supabase) {
      setCleanDayChallengeDays([]);
      return [];
    }
    const { data, error } = await supabase
      .from("clean_day_challenge_days")
      .select("*")
      .eq("user_id", supabaseSession.user.id)
      .eq("challenge_id", challengeId)
      .order("day_number", { ascending: true });
    if (error) {
      const errorText = String(error.message || "").toLowerCase();
      if (errorText.includes("does not exist") || errorText.includes("relation")) {
        setCleanDayChallengeDays([]);
        return [];
      }
      setCleanDayStatus(`Could not load challenge days: ${error.message || "unknown error"}`);
      setCleanDayChallengeDays([]);
      return [];
    }
    const rows = Array.isArray(data) ? data : [];
    setCleanDayChallengeDays(rows);
    return rows;
  }

  async function loadCleanDayChallengeHistory({ silent = false } = {}) {
    if (!supabaseSession?.user?.id || !isSupabaseConfigured || !supabase) {
      setCleanDayChallengeHistory([]);
      return [];
    }
    const { data, error } = await supabase
      .from("clean_day_challenges")
      .select("*")
      .eq("user_id", supabaseSession.user.id)
      .order("created_at", { ascending: false });
    if (error) {
      const errorText = String(error.message || "").toLowerCase();
      if (errorText.includes("does not exist") || errorText.includes("relation")) {
        setCleanDayChallengeHistory([]);
        return [];
      }
      if (!silent) {
        setCleanDayStatus(`Could not load challenge archive: ${error.message || "unknown error"}`);
      }
      setCleanDayChallengeHistory([]);
      return [];
    }
    const rows = Array.isArray(data) ? data : [];
    setCleanDayChallengeHistory(rows);
    return rows;
  }

  async function loadActiveCleanDayChallenge({ silent = false } = {}) {
    if (!isSupabaseConfigured || !supabase || !supabaseSession?.user?.id) {
      setCleanDayActiveChallenge(null);
      setCleanDayChallengeDays([]);
      return null;
    }
    setCleanDayChallengeBusy(true);
    const { data, error } = await supabase
      .from("clean_day_challenges")
      .select("*")
      .eq("user_id", supabaseSession.user.id)
      .eq("status", CLEAN_DAY_CHALLENGE_STATUS.ACTIVE)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setCleanDayChallengeBusy(false);

    if (error) {
      const errorText = String(error.message || "").toLowerCase();
      if (errorText.includes("does not exist") || errorText.includes("relation")) {
        setCleanDayActiveChallenge(null);
        setCleanDayChallengeDays([]);
        return null;
      }
      setCleanDayActiveChallenge(null);
      setCleanDayChallengeDays([]);
      if (!silent) {
        setCleanDayStatus(`Could not load Clean Day challenge: ${error.message || "unknown error"}`);
      }
      return null;
    }

    if (!data) {
      setCleanDayActiveChallenge(null);
      setCleanDayChallengeDays([]);
      return null;
    }

    setCleanDayActiveChallenge(data);
    const cursor = computeCleanDayChallengeCursor(data, todayLocalDate);
    await Promise.all([
      loadCleanDayChallengeDays(data.id),
      loadCleanDayEntryForDate(cursor.dayLocalDate, { silent: true }),
    ]);
    return data;
  }

  function buildCleanDayHourlySnapshot(form = {}, slotKey) {
    const adaptiveBySlot =
      form.adaptiveResponses && typeof form.adaptiveResponses === "object"
        ? form.adaptiveResponses
        : {};
    const adaptiveAnswers =
      adaptiveBySlot[slotKey] && typeof adaptiveBySlot[slotKey] === "object"
        ? adaptiveBySlot[slotKey]
        : {};
    return {
      slotKey,
      recordedAt: new Date().toISOString(),
      location: String(form.eveningLocation || "").toLowerCase(),
      wentCarromPlace: String(form.eveningWentCarromPlace || "").toLowerCase(),
      playedCarrom: String(form.eveningPlayedCarrom || "").toLowerCase(),
      smokingDone: String(form.smokingDone || "").toLowerCase(),
      cigaretteCount:
        String(form.smokingDone || "").toLowerCase() === "yes"
          ? Math.max(0, Number(form.cigaretteCount) || 0)
          : 0,
      riskLevel: inferCleanDayRiskLevel(form),
      sleepProtectionLocked: Boolean(form.sleepProtectionLocked),
      adaptiveAnswers,
    };
  }

  const markCleanDayHourlyCheckin = (slotKey, patchFields = null) => {
    if (!slotKey) return;
    const seededForm =
      patchFields && typeof patchFields === "object"
        ? { ...cleanDayForm, ...patchFields }
        : cleanDayForm;
    const existingSnapshots =
      seededForm.hourlySnapshots && typeof seededForm.hourlySnapshots === "object"
        ? seededForm.hourlySnapshots
        : {};
    if (seededForm[slotKey] && existingSnapshots[slotKey]) return;
    const nextForm = {
      ...seededForm,
      [slotKey]: true,
      hourlySnapshots: {
        ...existingSnapshots,
        [slotKey]: existingSnapshots[slotKey] || buildCleanDayHourlySnapshot(seededForm, slotKey),
      },
    };
    setCleanDayFooterEvent(null);
    setCleanDayForm(nextForm);
    saveCleanDayEntry(nextForm, { silentStatus: true }).catch(() => {});
  };

  async function startCleanDayChallenge(targetDays) {
    if (!isSupabaseConfigured || !supabase || !supabaseSession?.user?.id) {
      setCleanDayStatus("Supabase session missing. Could not start Clean Day challenge.");
      return false;
    }
    const parsedTarget = Number(targetDays);
    if (!CLEAN_DAY_CHALLENGE_TARGET_OPTIONS.includes(parsedTarget)) {
      setCleanDayStatus("Invalid challenge target.");
      return false;
    }
    if (cleanDayActiveChallenge?.status === CLEAN_DAY_CHALLENGE_STATUS.ACTIVE) {
      setCleanDayStatus("An active Clean Day challenge already exists.");
      return false;
    }

    setCleanDayChallengeBusy(true);
    const payload = {
      user_id: supabaseSession.user.id,
      target_days: parsedTarget,
      challenge_name: `${parsedTarget} Day Challenge`,
      status: CLEAN_DAY_CHALLENGE_STATUS.ACTIVE,
      start_local_date: todayLocalDate,
      current_day_number: 1,
      clean_days_count: 0,
      recovered_days_count: 0,
      not_clean_days_count: 0,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("clean_day_challenges")
      .insert(payload)
      .select("*")
      .single();
    setCleanDayChallengeBusy(false);

    if (error) {
      const errorText = String(error.message || "").toLowerCase();
      if (errorText.includes("does not exist") || errorText.includes("relation")) {
        setCleanDayStatus(
          "Clean Day challenge table missing. Run supabase_clean_day_challenge_setup.sql once."
        );
        return false;
      }
      setCleanDayStatus(`Could not start challenge: ${error.message || "unknown error"}`);
      return false;
    }

    setCleanDayActiveChallenge(data);
    setCleanDayChallengeDays([]);
    setTodayCleanDayEntry(null);
    setCleanDayForm(emptyCleanDayForm(todayLocalDate));
    setCleanDayFooterEvent(null);
    loadCleanDayChallengeHistory({ silent: true });
    setCleanDayStatus(`${parsedTarget} Day Challenge started.`);
    return true;
  }

  async function upsertCleanDayChallengeSummary(challenge, dayNumber, localDate, form) {
    if (!challenge?.id || !supabaseSession?.user?.id || !isSupabaseConfigured || !supabase) {
      return { ok: false, advancedToNextDay: false };
    }
    const checkinsCompleted = CLEAN_DAY_HOURLY_CHECKIN_SLOTS.reduce(
      (count, slot) => count + (form?.[slot.key] ? 1 : 0),
      0
    );
    const resolvedCloseResult = resolveCleanDayCloseResult(form);
    const resolvedDailyStatus = resolvedCloseResult || null;
    const sleepDurationMinutes = Math.max(0, Number(form?.sleepDurationMinutes) || 0);
    const sleepDurationLabel =
      String(form?.sleepDurationLabel || "").trim() ||
      (sleepDurationMinutes > 0 ? formatCleanDayDurationLabel(sleepDurationMinutes) : "");
    const rawHourlySnapshots =
      form?.hourlySnapshots && typeof form.hourlySnapshots === "object"
        ? form.hourlySnapshots
        : {};
    const hourlyPayload = {
      ...rawHourlySnapshots,
      __sleep: {
        sleptAt: String(form?.sleepSleptAt || "").trim(),
        wokeAt: String(form?.sleepWokeAt || "").trim(),
        durationMinutes: sleepDurationMinutes,
        durationLabel: sleepDurationLabel,
        savedAt: String(form?.morningSleepSavedAt || "").trim(),
      },
    };
    const summaryPayload = {
      challenge_id: challenge.id,
      user_id: supabaseSession.user.id,
      local_date: localDate,
      day_number: dayNumber,
      checkins_completed: checkinsCompleted,
      final_cigarette_count:
        String(form?.smokingDone || "").toLowerCase() === "yes"
          ? Math.max(0, Number(form?.cigaretteCount) || 0)
          : 0,
      sleep_protection_started: Boolean(form?.sleepProtectionLocked),
      close_day_result: resolvedCloseResult || null,
      daily_status: resolvedDailyStatus,
      hourly_checkins: hourlyPayload,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("clean_day_challenge_days")
      .upsert(summaryPayload, { onConflict: "challenge_id,day_number" });
    if (error) {
      const errorText = String(error.message || "").toLowerCase();
      if (errorText.includes("does not exist") || errorText.includes("relation")) {
        setCleanDayStatus(
          "Clean Day challenge-day table missing. Run supabase_clean_day_challenge_setup.sql once."
        );
        return { ok: false, advancedToNextDay: false };
      }
      setCleanDayStatus(`Could not save day summary: ${error.message || "unknown error"}`);
      return { ok: false, advancedToNextDay: false };
    }

    const rows = await loadCleanDayChallengeDays(challenge.id);
    const cleanCount = rows.filter((row) => row.daily_status === CLEAN_DAY_DAILY_STATUS.CLEAN_DAY).length;
    const recoveredCount = rows.filter((row) => row.daily_status === CLEAN_DAY_DAILY_STATUS.RECOVERED_DAY).length;
    const notCleanCount = rows.filter((row) => row.daily_status === CLEAN_DAY_DAILY_STATUS.NOT_CLEAN).length;
    const targetDays = Math.max(1, Number(challenge.target_days || dayNumber) || dayNumber);
    const hasDayClosed = Boolean(summaryPayload.close_day_result);
    const nextDayNumber = hasDayClosed && dayNumber < targetDays ? dayNumber + 1 : dayNumber;
    const challengePatch = {
      clean_days_count: cleanCount,
      recovered_days_count: recoveredCount,
      not_clean_days_count: notCleanCount,
      current_day_number: Math.max(1, Math.min(targetDays, nextDayNumber)),
      updated_at: new Date().toISOString(),
    };
    const isFinalDay =
      dayNumber >= targetDays &&
      Boolean(summaryPayload.close_day_result);
    if (isFinalDay) {
      challengePatch.status = CLEAN_DAY_CHALLENGE_STATUS.COMPLETED;
      challengePatch.completed_at = new Date().toISOString();
    }
    const { data: updatedChallenge, error: challengeUpdateError } = await supabase
      .from("clean_day_challenges")
      .update(challengePatch)
      .eq("id", challenge.id)
      .eq("user_id", supabaseSession.user.id)
      .select("*")
      .single();
    if (!challengeUpdateError && updatedChallenge) {
      setCleanDayActiveChallenge(updatedChallenge);
      loadCleanDayChallengeHistory({ silent: true });
    }
    return {
      ok: !challengeUpdateError,
      advancedToNextDay: hasDayClosed && dayNumber < targetDays,
    };
  }

  async function saveTodayReadiness() {
    if (!isSupabaseConfigured || !supabase || !supabaseSession?.user?.id) {
      setReadinessStatus("Supabase session missing. Could not save mindset check.");
      return false;
    }

    const evaluated = evaluateReadiness({ ...readinessForm, checkDate: todayLocalDate });
    const payload = readinessRowPayload(evaluated, supabaseSession.user.id);

    setReadinessBusy(true);
    const { data, error } = await supabase
      .from("trade_readiness_checks")
      .upsert(payload, { onConflict: "user_id,check_date" })
      .select("*")
      .single();
    setReadinessBusy(false);

    if (error) {
      setReadinessStatus(formatReadinessErrorMessage(error, "save"));
      return false;
    }

    const saved = evaluateReadiness(readinessFromRow(data));
    setTodayReadiness(saved);
    setReadinessForm(saved);
    setMindsetFooterEvent({
      type: "saved",
      at: saved.updatedAt || saved.createdAt || new Date().toISOString(),
    });
    setReadinessStatus("Mindset readiness saved.");
    return true;
  }

  async function logNoTradeDayWin() {
    if (!todayReadiness || todayReadiness.status !== READINESS_STATUS.DO_NOT_TRADE) return false;
    const next = { ...todayReadiness, noTradeDay: true, disciplineWin: true };
    setReadinessForm(next);
    const ok = await saveTodayReadiness();
    if (ok) {
      const successMessage = "No Trade Day logged. You protected discipline today.";
      setReadinessStatus(successMessage);
      setCloudStatus(successMessage);
    }
    return ok;
  }

  function openMindsetReadiness() {
    setTradePermissionModal(null);
    setReadinessStatus("");
    setView("mindset-check-page");
    setSidebarActiveItem("mindset-check");
    setSidebarDrawerOpen(false);
  }

  function resetTodayReadinessForm() {
    setMindsetFooterEvent({
      type: "reset",
      at: new Date().toISOString(),
    });
    setReadinessForm(emptyReadinessForm(todayLocalDate));
    setReadinessStatus("");
  }

  async function saveCleanDayEntry(formOverride = null, options = {}) {
    if (!isSupabaseConfigured || !supabase || !supabaseSession?.user?.id) {
      setCleanDayStatus("Supabase session missing. Could not save Clean Day.");
      return false;
    }

    const formToSave = formOverride || cleanDayForm;
    const entryLocalDate = formToSave.localDate || cleanDayActiveDayLocalDate || todayLocalDate;
    const payload = cleanDayRowPayload(formToSave, supabaseSession.user.id, entryLocalDate);
    setCleanDayBusy(true);
    const { data, error } = await supabase
      .from("clean_day_entries")
      .upsert(payload, { onConflict: "user_id,local_date" })
      .select("*")
      .single();
    setCleanDayBusy(false);

    if (error) {
      setCleanDayStatus(`Could not save Clean Day: ${error.message || "unknown error"}`);
      return false;
    }

    const saved = cleanDayFromRow(data);
    setTodayCleanDayEntry(saved);
    setCleanDayForm(saved);
    if (cleanDayActiveChallenge?.id) {
      const summaryResult = await upsertCleanDayChallengeSummary(
        cleanDayActiveChallenge,
        cleanDayActiveDayNumber,
        entryLocalDate,
        saved
      );
      if (summaryResult?.advancedToNextDay) {
        await loadActiveCleanDayChallenge({ silent: true });
      }
    }

    const { error: oneTradeStateUpsertError } = await supabase
      .from("one_trade_rule_states")
      .upsert(
        {
          user_id: userId,
          state: sanitizedOneTradeRule,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    if (oneTradeStateUpsertError) {
      const errorText = String(oneTradeStateUpsertError.message || "").toLowerCase();
      isPushingCloudRef.current = false;
      setCloudBusy(false);
      setCloudStatus("");
      if (errorText.includes("does not exist") || errorText.includes("relation")) {
        alert("One Trade Rule cloud state table missing. Run supabase_one_trade_rule_state_setup.sql once.");
      } else {
        alert(oneTradeStateUpsertError.message);
      }
      return false;
    }
    setCleanDayFooterEvent({
      type: "saved",
      at: saved.savedAt || saved.updatedAt || new Date().toISOString(),
    });
    if (!options?.silentStatus) {
      setCleanDayStatus("Clean Day saved.");
    }
    return true;
  }

  function getTradeEntryReadinessMeta(readiness, override = false) {
    if (!readiness) {
      return {
        readinessStatusAtEntry: READINESS_STATUS.NOT_CHECKED,
        readinessScoreAtEntry: null,
        readinessOverride: false,
        readinessCheckId: "",
        readinessReasonsAtEntry: ["Mindset check was not completed before entry."],
      };
    }
    return {
      readinessStatusAtEntry: readiness.status,
      readinessScoreAtEntry: Number.isFinite(Number(readiness.score)) ? Number(readiness.score) : null,
      readinessOverride: Boolean(override),
      readinessCheckId: readiness.id || "",
      readinessReasonsAtEntry: Array.isArray(readiness.reasons) ? readiness.reasons : [],
    };
  }

  function getOneTradeReadinessMeta(readiness, options = {}) {
    const readinessMeta = getTradeEntryReadinessMeta(readiness, Boolean(options.override));
    const readinessStateAtTrade = mapReadinessStatusToOneTradeState(
      readinessMeta.readinessStatusAtEntry,
      readinessMeta.readinessScoreAtEntry,
      Boolean(readiness?.hardBlock)
    );
    const readinessBreach =
      Boolean(options.forceBreach) ||
      readinessStateAtTrade === ONE_TRADE_READINESS_STATE.DO_NOT_TRADE ||
      readinessMeta.readinessStatusAtEntry === READINESS_STATUS.DO_NOT_TRADE;

    return {
      ...readinessMeta,
      readinessStateAtTrade,
      readinessBreach,
      // Keep override badge for the main trade journal flow only.
      // One Trade Rule uses dedicated readiness breach tagging.
      readinessOverride: Boolean(options.overrideForMainJournalOnly) && readinessMeta.readinessOverride,
    };
  }

  function startNewTradeWithReadiness(readinessMeta) {
    const nextTrade = {
      ...emptyTrade(),
      ...readinessMeta,
    };
    if (selectedProject && getProjectStats(selectedProject, "phase1").targetHit) {
      nextTrade.phase = "phase2";
    }
    setPendingReadinessEntryMeta(readinessMeta);
    setTradeForm(nextTrade);
    setSelectedTradeId("");
    setTab("pre");
    setView("trade-new");
  }

  function closeTradePermissionModal() {
    setTradePermissionModal(null);
  }

  function resolveActionModal(result) {
    if (actionModalResolverRef.current) {
      actionModalResolverRef.current(Boolean(result));
      actionModalResolverRef.current = null;
    }
    setActionModal(null);
  }

  function showActionModal(config) {
    return new Promise((resolve) => {
      actionModalResolverRef.current = resolve;
      setActionModal(config);
    });
  }

  function openNotCheckedTradePermissionModal() {
    setTradePermissionModal({
      type: "NOT_CHECKED",
      reasons: ["Today's mindset check is still pending."],
    });
  }

  function openRedTradePermissionModal(readiness) {
    setTradePermissionModal({
      type: "DO_NOT_TRADE",
      readiness,
      reasons: Array.isArray(readiness?.reasons) ? readiness.reasons : [],
    });
  }

  function handleTradePermissionGoToCheck() {
    closeTradePermissionModal();
    openMindsetReadiness();
  }

  function handleTradePermissionContinueAnyway() {
    closeTradePermissionModal();
    startNewTradeWithReadiness(getTradeEntryReadinessMeta(null, false));
  }

  function handleTradePermissionOverrideAndContinue() {
    const readiness = tradePermissionModal?.readiness || todayReadiness;
    closeTradePermissionModal();
    startNewTradeWithReadiness(getTradeEntryReadinessMeta(readiness, true));
  }

  const openProjects = () => {
    setView("projects");
    setSelectedTradeId("");
    setSearch("");
    setFilterDir("ALL");
  };

  const openAccountPage = (section = "account") => {
    setSettingsPageSection(section);
    setSidebarActiveItem(section === "integrations-mt5" ? "mt5-sync" : "settings");
    setView("settings-page");
    setSidebarDrawerOpen(false);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  };

  const openProjectEdit = (project) => {
    setProjectForm(normalizeProject(project));
    setSelectedProjectId(project.id);
    setView("project-edit");
  };

  const openProject = (projectId) => {
    setSelectedProjectId(projectId);
    setSelectedTradeId("");
    setSearch("");
    setFilterDir("ALL");
    setView("project");
  };

  const isHiddenMt5ProjectCard = (project) => {
    const name = String(project?.name || "").trim().toLowerCase();
    const id = String(project?.id || "").trim().toLowerCase();
    return name === "mt5 auto sync" || id.startsWith("project-mt5-");
  };

  const closeSidebarDrawer = () => {
    setSidebarDrawerOpen(false);
  };

  const scrollToDashboardSection = (ref, options = {}) => {
    const { goTop = false } = options;
    setView("projects");
    setSidebarDrawerOpen(false);
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        if (goTop) {
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        ref?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    });
  };

  const openDashboardFromSidebar = () => {
    setSidebarActiveItem("dashboard");
    scrollToDashboardSection(oneTradeSectionRef, { goTop: true });
  };

  const openOneTradeRuleFromSidebar = () => {
    setSidebarActiveItem("one-trade-rule");
    scrollToDashboardSection(oneTradeSectionRef);
  };

  const openTradingJournalFromSidebar = () => {
    const selectedNow = projects.find((project) => project.id === selectedProjectId) || null;
    if (!selectedNow || isHiddenMt5ProjectCard(selectedNow)) {
      const visibleProjects = projects.filter((project) => !isHiddenMt5ProjectCard(project));
      const preferredProject =
        visibleProjects.find((project) => Array.isArray(project?.trades) && project.trades.length > 0) ||
        visibleProjects[0];
      if (preferredProject?.id) {
        setSelectedProjectId(preferredProject.id);
      }
    }
    setSearch("");
    setFilterDir("ALL");
    setSelectedTradeId("");
    setSidebarActiveItem("trading-journal");
    setView("trading-journal-page");
    setSidebarDrawerOpen(false);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  };

  const openMindsetCheckFromSidebar = () => {
    setSidebarActiveItem("mindset-check");
    setView("mindset-check-page");
    setSidebarDrawerOpen(false);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  };

  const openCleanDayFromSidebar = () => {
    setSidebarActiveItem("clean-day");
    setView("clean-day-page");
    setSidebarDrawerOpen(false);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  };

  const openSettingsFromSidebar = () => {
    openAccountPage("account");
  };

  const openMt5AutoSyncFromSidebar = () => {
    openAccountPage("integrations-mt5");
  };

  const startDisciplineChallengeForUser = async (targetCleanDays, challengeName) => {
    const safeName = String(challengeName || "").trim();
    const startedRuleState = applyOneTradeRule(
      startDisciplineChallenge(oneTradeRule, {
        targetCleanDays,
        challengeName: safeName,
      }),
      nowDate
    );
    setOneTradeRule(startedRuleState);
    await persistOneTradeRuleStateNow(startedRuleState);
    setCloudStatus(
      `${safeName || `${targetCleanDays} Trade Discipline Challenge`} started.`
    );
  };

  const openDisciplineChallengeStartModal = () => {
    setDisciplineStartTarget(10);
    setDisciplineStartModalOpen(true);
  };

  const startSelectedDisciplineChallenge = async () => {
    const safeName = `${disciplineStartTarget} Clean Days Challenge`;
    await startDisciplineChallengeForUser(disciplineStartTarget, safeName);
    setDisciplineStartModalOpen(false);
  };

  const shiftDateKeyByDays = (dateKey, offsetDays) => {
    const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    const base = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + offsetDays, 12, 0, 0));
    const y = String(base.getUTCFullYear()).padStart(4, "0");
    const m = String(base.getUTCMonth() + 1).padStart(2, "0");
    const d = String(base.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const runOneTradeAutoCloseForDay = (closeTradingDayKey = "") => {
    const requestedDayKey =
      String(closeTradingDayKey || focusCloseCountdown?.tradingDayKey || localDateValue(nowDate)).slice(0, 10);
    const beforeEval = evaluateOneTradeRule(oneTradeRule, nowDate);
    const beforeChallenge = beforeEval?.activeChallenge || beforeEval?.currentChallenge || null;
    const beforeProgress = {
      completedCleanDays: Number(beforeChallenge?.completed_clean_days || 0),
      streak: Number(beforeChallenge?.current_streak || 0),
      breaks: Number(beforeChallenge?.rule_breaks || 0),
    };

    const result = closeOneTradeRuleDay(oneTradeRule, {
      now: nowDate,
      closeTradingDayKey: requestedDayKey,
    });

    if (result?.error) {
      console.warn("[OneTrade AutoClose] close skipped/error", {
        reason: String(result.error || "unknown"),
        requestedChallengeDayDate: requestedDayKey,
      });
      return;
    }

    const debug = result?.closeDebug || {};
    const afterChallenge = result?.activeChallenge || result?.currentChallenge || null;
    const afterProgress = {
      completedCleanDays: Number(afterChallenge?.completed_clean_days || 0),
      streak: Number(afterChallenge?.current_streak || 0),
      breaks: Number(afterChallenge?.rule_breaks || 0),
    };
    console.info("[OneTrade AutoClose]", {
      mode: "auto",
      requestedChallengeDayDate: requestedDayKey,
      selectedChallengeDayDate: String(debug?.selectedChallengeDayDate || result?.closeTradingDayKey || ""),
      activeChallengeId: String(debug?.activeChallengeId || afterChallenge?.id || ""),
      challengeDayId: String(debug?.challengeDayId || ""),
      localDateBeingClosed: String(debug?.localDateBeingClosed || ""),
      mt5TradesFoundForDay: Number(debug?.mt5TradesFoundForDay || 0),
      normalizedTradeCount: Number(debug?.normalizedTradeCount || 0),
      calculatedStatus: String(debug?.calculatedStatus || result?.closeStatus || ""),
      previousSavedStatus: String(debug?.previousSavedStatus || ""),
      finalSavedStatus: String(debug?.finalSavedStatus || ""),
      progressBefore: beforeProgress,
      progressAfter: afterProgress,
      streakBefore: beforeProgress.streak,
      streakAfter: afterProgress.streak,
      trades: Array.isArray(debug?.trades) ? debug.trades : [],
    });

    setOneTradeRule(sanitizeOneTradeRuleForStore(result.project));
  };

  const openOneTradeManualJournal = async (options = {}) => {
    const allowDoNotTradeOverride = Boolean(options?.allowDoNotTradeOverride);
    const evaluation = evaluateOneTradeRule(oneTradeRule, nowDate);
    if (!evaluation?.activeChallenge) {
      await showActionModal({
        kind: "info",
        tone: "warning",
        title: "Start Challenge First",
        message: "Manual Journal Entry will unlock after you start a discipline challenge.",
      });
      return;
    }

    const currentReadinessState = getOneTradeReadinessState(todayReadiness);
    if (
      !allowDoNotTradeOverride &&
      currentReadinessState === ONE_TRADE_READINESS_STATE.DO_NOT_TRADE
    ) {
      setOneTradeMindsetWarningOpen(true);
      return;
    }

    const oneTradeReadinessMeta = getOneTradeReadinessMeta(todayReadiness, {
      forceBreach:
        allowDoNotTradeOverride &&
        currentReadinessState === ONE_TRADE_READINESS_STATE.DO_NOT_TRADE,
    });

    setOneTradeJournalForm(() => {
      const seededDate = focusCloseCountdown?.tradingDayKey || localDateValue(nowDate);
      const seededTime = getManualEntrySeedTime(focusMarketSettings?.close_time || "17:00");
      const seeded = {
        ...emptyTrade(),
        date: seededDate,
        time: seededTime,
        pair: "XAUUSD",
        direction: "BUY",
        outcome: "Manual",
        entryPrice: "100",
        closePrice: "102",
        slPrice: "99",
        tpPrice: "104",
        lotSize: "0.10",
        ...oneTradeReadinessMeta,
      };
      return {
        ...seeded,
        pnl: calculateManualJournalPnl(seeded),
      };
    });
    setOneTradeJournalOpen(true);
  };

  const handleOneTradeMindsetWarningCancel = () => {
    setOneTradeMindsetWarningOpen(false);
  };

  const handleOneTradeMindsetWarningLogNoTradeDay = async () => {
    setOneTradeMindsetWarningOpen(false);
    await logNoTradeDayWin();
  };

  const handleOneTradeMindsetWarningContinue = async () => {
    setOneTradeMindsetWarningOpen(false);
    await openOneTradeManualJournal({ allowDoNotTradeOverride: true });
  };

  const setOneTradeJournalField = (key, value) =>
    setOneTradeJournalForm((prev) => {
      const next = { ...prev, [key]: value };
      if ([
        "entryPrice",
        "closePrice",
        "slPrice",
        "tpPrice",
        "outcome",
        "direction",
        "lotSize",
      ].includes(key)) {
        const autoPnl = calculateManualJournalPnl(next);
        next.pnl = autoPnl;
      }
      return next;
    });

  const saveOneTradeManualJournalEntry = async () => {
    if (!oneTradeJournalForm?.date) {
      await showActionModal({
        kind: "info",
        tone: "warning",
        title: "Journal Date Required",
        message: "Please select a date for this manual entry.",
      });
      return;
    }
    setOneTradeRule((prev) => {
      const activeChallenge = getActiveDisciplineChallenge(prev);
      const manualPnlRaw = String(oneTradeJournalForm?.pnl ?? "").trim();
      const parsedManualPnl = manualPnlRaw === "" ? NaN : Number(manualPnlRaw);
      const autoPnl = calculateManualJournalPnl(oneTradeJournalForm);
      const safeDate =
        oneTradeJournalForm?.date ||
        focusCloseCountdown?.tradingDayKey ||
        localDateValue(nowDate);
      const safeTime =
        oneTradeJournalForm?.time ||
        getManualEntrySeedTime(focusMarketSettings?.close_time || "17:00");
      const readinessStateAtTrade =
        resolveTradeReadinessStateAtTrade(oneTradeJournalForm) ||
        getOneTradeReadinessState(todayReadiness);
      const readinessBreach =
        Boolean(oneTradeJournalForm?.readinessBreach ?? oneTradeJournalForm?.readiness_breach) ||
        readinessStateAtTrade === ONE_TRADE_READINESS_STATE.DO_NOT_TRADE ||
        String(oneTradeJournalForm?.readinessStatusAtEntry || "").toUpperCase() ===
          READINESS_STATUS.DO_NOT_TRADE;
      const normalized = normalizeTrade({
        ...oneTradeJournalForm,
        date: safeDate,
        time: safeTime,
        one_trade_manual: true,
        outcome: oneTradeJournalForm?.outcome || "Manual",
        readinessStateAtTrade,
        readinessBreach,
        pnl: autoPnl !== ""
          ? autoPnl
          : Number.isFinite(parsedManualPnl)
          ? formatNumberInput(parsedManualPnl)
          : oneTradeJournalForm?.pnl || "",
        discipline_journal_name: "Trades Journal",
        discipline_challenge_id:
          oneTradeJournalForm.discipline_challenge_id || activeChallenge?.id || "",
      });
      const existing = Array.isArray(prev.disciplineManualJournalTrades)
        ? prev.disciplineManualJournalTrades
        : [];
      const exists = existing.some((trade) => trade.id === normalized.id);
      const nextRule = {
        ...prev,
        disciplineManualJournalTrades: exists
          ? existing.map((trade) => (trade.id === normalized.id ? normalized : trade))
          : [normalized, ...existing],
      };
      return applyOneTradeRule(nextRule, nowDate);
    });

    setOneTradeJournalOpen(false);
    setOneTradeJournalForm(emptyTrade());
    setCloudStatus("One Trade Rule manual journal entry saved.");
  };

  const exitDisciplineChallengeForUser = async () => {
    const approved = await showActionModal({
      kind: "confirm",
      tone: "warning",
      title: "Exit Challenge",
      message: "Do you want to exit this discipline challenge?",
      bullets: [
        "Current challenge will be archived.",
        "Your progress history will stay saved.",
        "You can start a new challenge anytime.",
      ],
      confirmText: "Exit Challenge",
      cancelText: "Stay In Challenge",
    });
    if (!approved) return;

    const exitedRuleState = applyOneTradeRule(exitDisciplineChallenge(oneTradeRule), nowDate);
    setOneTradeRule(exitedRuleState);

    // Hard-persist only One Trade Rule state immediately to prevent stale challenge reappearing after refresh.
    const persisted = await persistOneTradeRuleStateNow(exitedRuleState);
    if (persisted) setCloudStatus("Discipline challenge exited.");
  };

  const deleteArchivedChallengeForUser = async (challengeId) => {
    if (!challengeId) return;
    const archived = focusArchivedChallenges.find((item) => item.id === challengeId);
    const approved = await showActionModal({
      kind: "confirm",
      tone: "danger",
      title: "Delete Archived Challenge",
      message: `Delete ${formatChallengeTitle(archived)} from archive?`,
      bullets: [
        "Challenge card will be removed.",
        "Linked journal entries for this archived challenge will be removed.",
      ],
      confirmText: "Delete",
      cancelText: "Keep",
    });
    if (!approved) return;

    setOneTradeRule((prev) => {
      const next = {
        ...prev,
        disciplineChallenges: Array.isArray(prev.disciplineChallenges)
          ? prev.disciplineChallenges.filter((item) => item.id !== challengeId)
          : [],
        disciplineDays: Array.isArray(prev.disciplineDays)
          ? prev.disciplineDays.filter((item) => item.challenge_id !== challengeId)
          : [],
        disciplineTradeEvents: Array.isArray(prev.disciplineTradeEvents)
          ? prev.disciplineTradeEvents.filter((item) => item.challenge_id !== challengeId)
          : [],
        dailyCommitments: Array.isArray(prev.dailyCommitments)
          ? prev.dailyCommitments.filter((item) => item.challenge_id !== challengeId)
          : [],
        disciplineNotices: Array.isArray(prev.disciplineNotices)
          ? prev.disciplineNotices.filter((item) => item.challenge_id !== challengeId)
          : [],
        disciplineManualJournalTrades: Array.isArray(prev.disciplineManualJournalTrades)
          ? prev.disciplineManualJournalTrades.filter(
              (item) => item.discipline_challenge_id !== challengeId
            )
          : [],
      };
      return applyOneTradeRule(next, nowDate);
    });
    setExpandedArchiveChallengeId((prev) => (prev === challengeId ? "" : prev));
    setCloudStatus("Archived challenge deleted.");
  };


  const saveProject = () => {
    const normalized = applyDisciplineToProject(normalizeProject(projectForm));
    setProjects((prev) => {
      const exists = prev.some((project) => project.id === normalized.id);
      return exists
        ? prev.map((project) => (project.id === normalized.id ? { ...project, ...normalized, trades: project.trades } : project))
        : [normalized, ...prev];
    });
    setSelectedProjectId(normalized.id);
    setView("project");
  };

  const deleteProject = async (projectId) => {
    const approved = await showActionModal({
      kind: "confirm",
      tone: "danger",
      title: "Delete Project",
      message: "Delete this project and all trades inside it?",
      confirmText: "Delete",
      cancelText: "Keep Project",
    });
    if (!approved) return;
    setProjects((prev) => prev.filter((project) => project.id !== projectId));
    if (selectedProjectId === projectId) {
      setSelectedProjectId("");
      setSelectedTradeId("");
      setView("projects");
    }
  };

  const openTradeNew = () => {
    const readiness = todayReadiness;

    if (!readiness) {
      openNotCheckedTradePermissionModal();
      return;
    }

    if (readiness.status === READINESS_STATUS.DO_NOT_TRADE) {
      openRedTradePermissionModal(readiness);
      return;
    }

    startNewTradeWithReadiness(getTradeEntryReadinessMeta(readiness, false));
  };

  const openTradeEdit = (trade) => {
    setPendingReadinessEntryMeta(null);
    setTradeForm(normalizeTrade(trade));
    setSelectedTradeId(trade.id);
    setTab("pre");
    setView("trade-edit");
  };

  const openTradeView = (tradeId) => {
    setSelectedTradeId(tradeId);
    setView("trade-view");
  };

  const saveTrade = async () => {
    if (!selectedProjectId || !selectedProject) return;
    const calculatedPnl = calculateTradePnl(tradeForm);
    const calculatedRr = calculateRiskReward(tradeForm);
    const exists = selectedProject.trades.some((trade) => trade.id === tradeForm.id);
    const entryReadinessMeta = exists
      ? {
          readinessStatusAtEntry: tradeForm.readinessStatusAtEntry,
          readinessScoreAtEntry: tradeForm.readinessScoreAtEntry,
          readinessOverride: tradeForm.readinessOverride,
          readinessCheckId: tradeForm.readinessCheckId,
          readinessReasonsAtEntry: tradeForm.readinessReasonsAtEntry,
        }
      : pendingReadinessEntryMeta || getTradeEntryReadinessMeta(todayReadiness, false);

    const normalized = normalizeTrade({
      ...tradeForm,
      ...entryReadinessMeta,
      closePrice:
        tradeForm.outcome === "TP" || tradeForm.outcome === "SL" || tradeForm.outcome === "Breakeven"
          ? formatNumberInput(getOutcomePrice(tradeForm))
          : tradeForm.closePrice,
      pnl: calculatedPnl === "" ? tradeForm.pnl : calculatedPnl.toFixed(2),
      riskReward: calculatedRr === "" ? tradeForm.riskReward : calculatedRr.toFixed(2),
    });
    const previousTrade = selectedProject.trades.find((trade) => trade.id === normalized.id);
    const sameDateTrade = selectedProject.trades.find((trade) => trade.id !== normalized.id && trade.date === normalized.date);
    const phase1Stats = getProjectStats(selectedProject, "phase1");

    if (!exists && selectedProject.trades.length >= CHALLENGE_TRADE_LIMIT) {
      await showActionModal({
        kind: "info",
        tone: "warning",
        title: "20 Trade Challenge Rule",
        message: "No Overtrading",
        bullets: [`You already completed ${CHALLENGE_TRADE_LIMIT} trades.`],
      });
      return;
    }

    if (sameDateTrade) {
      await showActionModal({
        kind: "info",
        tone: "warning",
        title: "20 Trade Challenge Rule",
        message: "Maximum 1 Entry Per Day",
        bullets: [`A trade is already logged on ${normalized.date}.`],
      });
      return;
    }

    if (
      previousTrade?.slPrice &&
      normalized.slPrice &&
      previousTrade.slPrice !== normalized.slPrice
    ) {
      const continueWithSlChange = await showActionModal({
        kind: "confirm",
        tone: "warning",
        title: "20 Trade Challenge Rule",
        message: "Do Not Trail Stop Loss",
        bullets: [
          `SL changed from ${previousTrade.slPrice} to ${normalized.slPrice}.`,
          "Continue only if this is a correction, not trailing.",
        ],
        confirmText: "Continue",
        cancelText: "Cancel",
      });
      if (!continueWithSlChange) return;
    }

    const rrForChallenge = Number(normalized.riskReward);
    if (
      ["TP", "Manual", "Breakeven"].includes(normalized.outcome) &&
      (!Number.isFinite(rrForChallenge) || rrForChallenge < CHALLENGE_MIN_RR)
    ) {
      await showActionModal({
        kind: "info",
        tone: "warning",
        title: "20 Trade Challenge Rule",
        message: "Do Not Exit Below 1:2 RR",
        bullets: [
          `Current RR: ${formatRiskReward(normalized.riskReward)}`,
          `Minimum required: 1:${CHALLENGE_MIN_RR.toFixed(2)}`,
        ],
      });
      return;
    }

    if (!exists && normalized.phase === "phase2" && !phase1Stats.targetHit) {
      await showActionModal({
        kind: "info",
        tone: "warning",
        title: "Phase 2 Locked",
        message: "Phase 2 is locked until Phase 1 is Passed.",
      });
      return;
    }

    if (!exists && normalized.phase === "phase1" && phase1Stats.targetHit) {
      await showActionModal({
        kind: "info",
        tone: "warning",
        title: "Phase 1 Passed",
        message: "Phase 1 is already Passed. New trades should be logged in Phase 2.",
      });
      return;
    }

    const riskMessages = getRiskGuardMessages(selectedProject, normalized);
    if (riskMessages.length > 0) {
      const proceedRiskGuard = await showActionModal({
        kind: "confirm",
        tone: "warning",
        title: "Risk Guard",
        message: "Save trade anyway?",
        bullets: riskMessages,
        confirmText: "Save Anyway",
        cancelText: "Cancel",
      });
      if (!proceedRiskGuard) return;
    }

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== selectedProjectId) return project;
        const projectTradeExists = project.trades.some((trade) => trade.id === normalized.id);
        return {
          ...project,
          trades: projectTradeExists
            ? project.trades.map((trade) => (trade.id === normalized.id ? normalized : trade))
            : [normalized, ...project.trades],
        };
      })
    );

    /* legacy coupled discipline flow removed (challenge now uses separate mini journal)
    if (!exists && false) {
      if (
        disciplineEvaluation.todayTradesCount >= 2 &&
        todayDayStatus === DISCIPLINE_DAY_STATUS.BROKEN_DAY
      ) {
        await showActionModal({
          kind: "info",
          tone: "danger",
          title: "Challenge Broken",
          message: "Your rule was: 1 trade per day.",
          bullets: [
            "You took another trade after your first trade.",
            "This is a discipline break, not a strategy problem.",
            "Restart tomorrow with honesty, not shame.",
          ],
          confirmText: "I Understand. Restart Tomorrow.",
        });
      } else if (disciplineEvaluation.todayTradesCount === 1 && todayClosedOnce) {
        if (normalized.outcome === "SL") {
          await showActionModal({
            kind: "info",
            tone: "success",
            title: "SL Hit - But You Won Today",
            message: "You followed your rule.",
            bullets: [
              "You accepted the loss.",
              "You did not fight the market.",
              "Today's trading is complete. Next trade tomorrow.",
            ],
            confirmText: "I Accept. I Am Done For Today.",
          });
        } else if (normalized.outcome === "Breakeven") {
          await showActionModal({
            kind: "info",
            tone: "success",
            title: "Trade Closed - No Damage",
            message: "You followed the process.",
            bullets: [
              "Do not create damage by taking another trade.",
              "Today's trading is complete.",
            ],
            confirmText: "Done For Today.",
          });
        } else {
          await showActionModal({
            kind: "info",
            tone: "success",
            title: "Trade Closed - Rule Followed",
            message: "Good job.",
            bullets: [
              "Do not give the profit back.",
              "Professional traders protect discipline after both win and loss.",
              "Today's trading is complete. Next trade tomorrow.",
            ],
            confirmText: "Protect Today. Close Session.",
          });
        }
      }
    }

    const updatedChallengeById = (projectAfterDiscipline?.disciplineChallenges || []).find(
      (item) => item.id === preSaveActiveChallenge?.id
    );
    if (
      preSaveActiveChallenge &&
      preSaveActiveChallenge.status === DISCIPLINE_CHALLENGE_STATUS.ACTIVE &&
      updatedChallengeById?.status === DISCIPLINE_CHALLENGE_STATUS.COMPLETED
    ) {
      await showActionModal({
        kind: "info",
        tone: "success",
        title: "Challenge Completed",
        message: `You completed ${updatedChallengeById.target_clean_days} clean trades.`,
        bullets: [
          "You proved you can follow rules.",
          "You can accept SL and still stop.",
          "This is professional behavior.",
        ],
        confirmText: "Keep This Identity.",
      });
    }

    */
    setPendingReadinessEntryMeta(null);
    setView("project");
  };

  const deleteTrade = async (tradeId) => {
    if (!selectedProjectId) return;
    const approved = await showActionModal({
      kind: "confirm",
      tone: "danger",
      title: "Delete Trade",
      message: "Delete this trade entry?",
      confirmText: "Delete",
      cancelText: "Keep Trade",
    });
    if (!approved) return;
    setProjects((prev) =>
      prev.map((project) =>
        project.id === selectedProjectId
          ? applyDisciplineToProject({
              ...project,
              trades: project.trades.filter((trade) => trade.id !== tradeId),
            })
          : project
      )
    );
    setSelectedTradeId("");
    setView("project");
  };

  const projectFormHints = {
    daily: ratioText(projectForm.balance, projectForm.dailyDrawdown),
    max: ratioText(projectForm.balance, projectForm.maxDrawdown),
    target: ratioText(projectForm.balance, projectForm.profitTarget),
    phase2Daily: ratioText(projectForm.phase2Balance, projectForm.phase2DailyDrawdown),
    phase2Max: ratioText(projectForm.phase2Balance, projectForm.phase2MaxDrawdown),
    phase2Target: ratioText(projectForm.phase2Balance, projectForm.phase2ProfitTarget),
  };

  if ((view === "project" || view === "trade-new" || view === "trade-edit" || view === "trade-view") && !selectedProject) {
    return (
      <div style={{ minHeight: "100vh", background: G.bg, color: G.text, fontFamily: "system-ui, sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
        <div style={{ maxWidth: APP_PAGE_WIDTH, margin: "0 auto", padding: "64px 24px", textAlign: "center" }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, color: G.goldLight, marginBottom: 12 }}>
            No project selected
          </div>
          <div style={{ fontSize: 14, color: G.textMuted, marginBottom: 20 }}>
            Start a project first, then the trading journal will stay inside that project.
          </div>
          <button
            type="button"
            onClick={openProjects}
            style={{
              background: `linear-gradient(135deg, ${G.gold}, ${G.goldDim})`,
              border: "none",
              color: "#ffffff",
              padding: "10px 22px",
              borderRadius: 9,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  if (view === "project-new" || view === "project-edit") {
    return (
      <div style={{ minHeight: "100vh", background: G.bg, color: G.text, fontFamily: "system-ui, sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #c5ccd8; border-radius: 3px; } input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; } @keyframes challengeFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } } @keyframes challengePulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.035); } } @keyframes challengeBarGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }`}</style>
        <div style={{ borderBottom: `1px solid ${G.border}`, background: G.bgCard, position: "sticky", top: 0, zIndex: 100 }}>
          <div
            style={{
              maxWidth: APP_PAGE_WIDTH,
              margin: "0 auto",
              padding: "0 24px",
              minHeight: 62,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => (view === "project-edit" ? setView("project") : openProjects())}
                style={{
                  background: "transparent",
                  border: `1px solid ${G.border}`,
                  color: G.textSub,
                  borderRadius: 8,
                  padding: "7px 14px",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Back
              </button>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: G.goldLight }}>
                {view === "project-edit" ? "Edit Project" : "Start New Project"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {view === "project-edit" && (
                <button
                  type="button"
                  onClick={() => deleteProject(projectForm.id)}
                  style={{
                    background: G.lossBg,
                    border: `1px solid ${G.loss}`,
                    color: G.loss,
                    borderRadius: 8,
                    padding: "8px 18px",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={saveProject}
                style={{
                  background: `linear-gradient(135deg, ${G.gold}, ${G.goldDim})`,
                  border: "none",
                  color: "#ffffff",
                  padding: "9px 24px",
                  borderRadius: 9,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 800,
                  boxShadow: `0 0 18px ${G.goldGlow2}`,
                }}
              >
                {view === "project-edit" ? "Update Project" : "Start Project"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: APP_PAGE_WIDTH, margin: "0 auto", padding: "28px 24px" }}>
          <Section num="1" title="Prop Firm Project Setup" color={G.gold}>
            <G2 gap={14}>
              <div>
                <Label required>Project Name</Label>
                <FInput
                  value={projectForm.name}
                  onChange={(e) => setProjectField("name", e.target.value)}
                  placeholder="Example: FTMO 5K Challenge"
                />
              </div>
              <div>
                <Label>Prop Firm Preset</Label>
                <FSelect
                  value={projectForm.presetId}
                  onChange={(e) => setProjectForm((prev) => applyPresetToProject(prev, e.target.value))}
                >
                  {PROP_FIRM_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </FSelect>
                <div style={{ marginTop: 6, fontSize: 11, color: G.textMuted }}>
                  Pick a preset to auto-fill Phase 1 and Phase 2 rules, then edit if needed.
                </div>
              </div>
            </G2>

            <div style={{ height: 18 }} />

            <div
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22,
                color: G.goldLight,
                marginBottom: 14,
              }}
            >
              Phase 1
            </div>

            <G2>
              <div>
                <Label required>Prop Firm Balance</Label>
                <FInput
                  type="number"
                  value={projectForm.balance}
                  onChange={(e) => setProjectField("balance", e.target.value)}
                  placeholder="5000"
                  step="0.01"
                />
                <div style={{ marginTop: 6, fontSize: 11, color: G.textMuted }}>
                  Starting account size
                </div>
              </div>
              <div>
                <Label>Profit Target</Label>
                <FInput
                  type="number"
                  value={projectForm.profitTarget}
                  onChange={(e) => setProjectField("profitTarget", e.target.value)}
                  placeholder="500"
                  step="0.01"
                />
                <div style={{ marginTop: 6, fontSize: 11, color: G.textMuted }}>
                  {projectFormHints.target || "How much profit you need to pass"}
                </div>
              </div>
            </G2>

            <div style={{ height: 16 }} />

            <G2>
              <div>
                <Label>Daily Drawdown</Label>
                <FInput
                  type="number"
                  value={projectForm.dailyDrawdown}
                  onChange={(e) => setProjectField("dailyDrawdown", e.target.value)}
                  placeholder="250"
                  step="0.01"
                />
                <div style={{ marginTop: 6, fontSize: 11, color: G.textMuted }}>
                  {projectFormHints.daily || "Max loss allowed in one day"}
                </div>
              </div>
              <div>
                <Label>Max Drawdown</Label>
                <FInput
                  type="number"
                  value={projectForm.maxDrawdown}
                  onChange={(e) => setProjectField("maxDrawdown", e.target.value)}
                  placeholder="500"
                  step="0.01"
                />
                <div style={{ marginTop: 6, fontSize: 11, color: G.textMuted }}>
                  {projectFormHints.max || "Max total loss allowed on the account"}
                </div>
              </div>
            </G2>

            <div
              style={{
                height: 1,
                background: G.border,
                margin: "24px 0 18px",
              }}
            />

            <div
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22,
                color: G.goldLight,
                marginBottom: 14,
              }}
            >
              Phase 2
            </div>

            <G2>
              <div>
                <Label required>Prop Firm Balance</Label>
                <FInput
                  type="number"
                  value={projectForm.phase2Balance}
                  onChange={(e) => setProjectField("phase2Balance", e.target.value)}
                  placeholder="5000"
                  step="0.01"
                />
                <div style={{ marginTop: 6, fontSize: 11, color: G.textMuted }}>
                  Starting account size for Phase 2
                </div>
              </div>
              <div>
                <Label>Profit Target</Label>
                <FInput
                  type="number"
                  value={projectForm.phase2ProfitTarget}
                  onChange={(e) => setProjectField("phase2ProfitTarget", e.target.value)}
                  placeholder="250"
                  step="0.01"
                />
                <div style={{ marginTop: 6, fontSize: 11, color: G.textMuted }}>
                  {projectFormHints.phase2Target || "How much profit Phase 2 needs"}
                </div>
              </div>
            </G2>

            <div style={{ height: 16 }} />

            <G2>
              <div>
                <Label>Daily Drawdown</Label>
                <FInput
                  type="number"
                  value={projectForm.phase2DailyDrawdown}
                  onChange={(e) => setProjectField("phase2DailyDrawdown", e.target.value)}
                  placeholder="250"
                  step="0.01"
                />
                <div style={{ marginTop: 6, fontSize: 11, color: G.textMuted }}>
                  {projectFormHints.phase2Daily || "Max loss allowed in one day"}
                </div>
              </div>
              <div>
                <Label>Max Drawdown</Label>
                <FInput
                  type="number"
                  value={projectForm.phase2MaxDrawdown}
                  onChange={(e) => setProjectField("phase2MaxDrawdown", e.target.value)}
                  placeholder="500"
                  step="0.01"
                />
                <div style={{ marginTop: 6, fontSize: 11, color: G.textMuted }}>
                  {projectFormHints.phase2Max || "Max total loss allowed on the account"}
                </div>
              </div>
            </G2>

            <div
              style={{
                marginTop: 20,
                padding: "14px 16px",
                borderRadius: 12,
                border: `1px solid ${G.border}`,
                background: G.bgCard2,
                fontSize: 13,
                color: G.textSub,
                lineHeight: 1.7,
              }}
            >
              Start the project with the prop firm rules first. After saving, the trading journal will stay inside that project and all PnL, drawdown, and target progress will track from there.
            </div>
          </Section>
        </div>
        <ActionModal modal={actionModal} onResolve={resolveActionModal} />
      </div>
    );
  }

  if (view === "trade-new" || view === "trade-edit") {
    const tradePreviewPnl = calculateTradePnl(tradeForm);
    const tradePreviewRr = calculateRiskReward(tradeForm);
    const phase1PassedForTrade = selectedProject ? getProjectStats(selectedProject, "phase1").targetHit : false;

    return (
      <div style={{ minHeight: "100vh", background: G.bg, color: G.text, fontFamily: "system-ui, sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #c5ccd8; border-radius: 3px; } input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }`}</style>
        <div style={{ borderBottom: `1px solid ${G.border}`, background: G.bgCard, position: "sticky", top: 0, zIndex: 100 }}>
          <div
            style={{
              maxWidth: APP_PAGE_WIDTH,
              margin: "0 auto",
              padding: "0 24px",
              minHeight: 62,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setView("project")}
                style={{
                  background: "transparent",
                  border: `1px solid ${G.border}`,
                  color: G.textSub,
                  borderRadius: 8,
                  padding: "7px 14px",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Back
              </button>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: G.goldLight }}>
                {view === "trade-edit" ? "Edit Trade" : "New Trade"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {view === "trade-edit" && (
                <button
                  type="button"
                  onClick={() => deleteTrade(tradeForm.id)}
                  style={{
                    background: G.lossBg,
                    border: `1px solid ${G.loss}`,
                    color: G.loss,
                    borderRadius: 8,
                    padding: "8px 18px",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={saveTrade}
                style={{
                  background: `linear-gradient(135deg, ${G.gold}, ${G.goldDim})`,
                  border: "none",
                  color: "#ffffff",
                  padding: "9px 24px",
                  borderRadius: 9,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 800,
                  boxShadow: `0 0 18px ${G.goldGlow2}`,
                }}
              >
                {view === "trade-edit" ? "Update Trade" : "Save Trade"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: APP_PAGE_WIDTH, margin: "0 auto", padding: "28px 24px" }}>
          <div
            style={{
              background: G.bgCard,
              border: `1px solid ${G.border}`,
              borderRadius: 14,
              padding: "20px 24px",
              marginBottom: 20,
            }}
          >
            <G3 gap={14}>
              <div>
                <Label>Date</Label>
                <FInput type="date" value={tradeForm.date} onChange={(e) => setTradeField("date", e.target.value)} />
              </div>
              <div>
                <Label>Time</Label>
                <FInput type="time" value={tradeForm.time} onChange={(e) => setTradeField("time", e.target.value)} />
              </div>
              <div>
                <Label>Phase</Label>
                <FSelect value={tradeForm.phase} onChange={(e) => setTradeField("phase", e.target.value)}>
                  {PHASES.map((phase) => (
                    <option
                      key={phase.id}
                      value={phase.id}
                      disabled={
                        (phase.id === "phase2" && !phase1PassedForTrade && tradeForm.phase !== "phase2") ||
                        (phase.id === "phase1" && phase1PassedForTrade && view === "trade-new")
                      }
                    >
                      {phase.label}
                      {phase.id === "phase1" && phase1PassedForTrade && view === "trade-new" ? " (Passed)" : ""}
                      {phase.id === "phase2" && !phase1PassedForTrade ? " (Locked)" : ""}
                    </option>
                  ))}
                </FSelect>
                {phase1PassedForTrade && view === "trade-new" ? (
                  <div style={{ marginTop: 6, fontSize: 11, color: G.textMuted }}>
                    Phase 1 is Passed, so new trades now go to Phase 2.
                  </div>
                ) : !phase1PassedForTrade ? (
                  <div style={{ marginTop: 6, fontSize: 11, color: G.textMuted }}>
                    Phase 2 unlocks after Phase 1 is Passed.
                  </div>
                ) : null}
              </div>
              <div>
                <Label>Pair</Label>
                <FSelect value={tradeForm.pair} onChange={(e) => setTradeField("pair", e.target.value)}>
                  {PAIRS.map((pair) => (
                    <option key={pair}>{pair}</option>
                  ))}
                </FSelect>
              </div>
            </G3>

            <div style={{ height: 14 }} />

            <G2>
              <div>
                <Label>Session</Label>
                <FSelect value={tradeForm.session} onChange={(e) => setTradeField("session", e.target.value)}>
                  {SESSIONS.map((session) => (
                    <option key={session}>{session}</option>
                  ))}
                </FSelect>
              </div>
              <div>
                <Label>Direction</Label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["BUY", "SELL"].map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      onClick={() => setTradeField("direction", direction)}
                      style={{
                        flex: 1,
                        padding: "10px",
                        cursor: "pointer",
                        fontWeight: 800,
                        fontSize: 14,
                        borderRadius: 8,
                        transition: "all 0.15s",
                        border: `1px solid ${
                          tradeForm.direction === direction ? (direction === "BUY" ? G.win : G.loss) : G.border
                        }`,
                        background:
                          tradeForm.direction === direction
                            ? direction === "BUY"
                              ? G.winBg
                              : G.lossBg
                            : "transparent",
                        color:
                          tradeForm.direction === direction
                            ? direction === "BUY"
                              ? G.win
                              : G.loss
                            : G.textMuted,
                      }}
                    >
                      {direction}
                    </button>
                  ))}
                </div>
              </div>
            </G2>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
            {[
              ["pre", "Section 1 - Pre-Trade Plan"],
              ["post", "Section 2 - Post-Trade Review"],
            ].map(([name, label]) => (
              <button
                key={name}
                type="button"
                onClick={() => setTab(name)}
                style={{
                  padding: "10px 24px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  transition: "all 0.15s",
                  background: tab === name ? G.goldGlow2 : "transparent",
                  border: `1px solid ${tab === name ? G.gold : G.border}`,
                  color: tab === name ? G.goldLight : G.textMuted,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "pre" && (
            <Section num="1" title="Pre-Trade Plan" color={G.purple}>
              <ScreenshotUpload
                value={tradeForm.preScreenshot}
                onChange={(value) => setTradeField("preScreenshot", value)}
                label="Chart Screenshot Before Entry"
                hint="TradingView, MT4, or MT5 chart"
              />

              <div style={{ height: 22 }} />

              <div style={{ marginBottom: 18 }}>
                <Label>Trade Setup</Label>
                <ChipGroup options={SETUPS} value={tradeForm.setup} onChange={(value) => setTradeField("setup", value)} />
              </div>

              <G2 gap={14}>
                <div>
                  <Label required>Entry Price</Label>
                  <FInput
                    type="number"
                    placeholder="2350.00"
                    value={tradeForm.entryPrice}
                    onChange={(e) => setTradeField("entryPrice", e.target.value)}
                    step="0.01"
                  />
                </div>
                <div>
                  <Label required>Lot Size</Label>
                  <FInput
                    type="number"
                    placeholder="0.01"
                    value={tradeForm.lotSize}
                    onChange={(e) => setTradeField("lotSize", e.target.value)}
                    step="0.01"
                  />
                </div>
              </G2>

              <div style={{ height: 14 }} />

              <G2 gap={14}>
                <div>
                  <Label required>Stop Loss</Label>
                  <FInput
                    type="number"
                    placeholder="2340.00"
                    value={tradeForm.slPrice}
                    onChange={(e) => setTradeField("slPrice", e.target.value)}
                    step="0.01"
                  />
                </div>
                <div>
                  <Label required>Take Profit</Label>
                  <FInput
                    type="number"
                    placeholder="2375.00"
                    value={tradeForm.tpPrice}
                    onChange={(e) => setTradeField("tpPrice", e.target.value)}
                    step="0.01"
                  />
                </div>
              </G2>

              <div style={{ height: 16 }} />

              <div style={{ marginBottom: 18 }}>
                <Label>Risk Reward Ratio</Label>
                <FInput
                  placeholder="Example: 2.5"
                  value={tradeForm.riskReward}
                  onChange={(e) => setTradeField("riskReward", e.target.value)}
                  style={{ maxWidth: 220 }}
                />
              </div>

              <div>
                <Label required>Trade Plan and Reasoning</Label>
                <FTextarea
                  rows={7}
                  placeholder={"Write your full trade plan before entering:\n\n- Market structure or trend direction\n- Key level or zone\n- Confluences\n- Entry confirmation\n- Invalidation"}
                  value={tradeForm.tradePlan}
                  onChange={(e) => setTradeField("tradePlan", e.target.value)}
                />
              </div>

              <div style={{ marginTop: 22, textAlign: "right" }}>
                <button
                  type="button"
                  onClick={() => setTab("post")}
                  style={{
                    background: G.goldGlow2,
                    border: `1px solid ${G.gold}`,
                    color: G.goldLight,
                    padding: "10px 22px",
                    borderRadius: 9,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Next: Post-Trade Review
                </button>
              </div>
            </Section>
          )}

          {tab === "post" && (
            <Section num="2" title="Post-Trade Review" color={G.gold}>
              <ScreenshotUpload
                value={tradeForm.postScreenshot}
                onChange={(value) => setTradeField("postScreenshot", value)}
                label="Chart Screenshot After Close"
                hint="Show where TP, SL, or manual close happened"
              />

              <div style={{ height: 22 }} />

              <div style={{ marginBottom: 20 }}>
                <Label>Trade Result</Label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {[
                    ["TP", G.win, G.winBg],
                    ["SL", G.loss, G.lossBg],
                    ["Manual", G.gold, G.goldGlow],
                    ["Breakeven", G.textSub, G.bgCard2],
                  ].map(([value, color, bg]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTradeField("outcome", value)}
                      style={{
                        flex: 1,
                        padding: "12px 6px",
                        cursor: "pointer",
                        fontWeight: 700,
                        fontSize: 12,
                        borderRadius: 9,
                        transition: "all 0.15s",
                        border: `1px solid ${tradeForm.outcome === value ? color : G.border}`,
                        background: tradeForm.outcome === value ? bg : "transparent",
                        color: tradeForm.outcome === value ? color : G.textMuted,
                      }}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <G2 gap={14}>
                <div>
                  <Label>Close Price</Label>
                  <FInput
                    type="number"
                    placeholder="2368.50"
                    value={tradeForm.closePrice}
                    onChange={(e) => setTradeField("closePrice", e.target.value)}
                    step="0.01"
                  />
                </div>
                <div>
                  <Label>Auto PnL in USD</Label>
                  <FInput
                    type="number"
                    placeholder="+80.00 or -25.00"
                    value={tradePreviewPnl === "" ? tradeForm.pnl : tradePreviewPnl.toFixed(2)}
                    onChange={(e) => setTradeField("pnl", e.target.value)}
                    step="0.01"
                    readOnly={tradePreviewPnl !== ""}
                  />
                  <div style={{ marginTop: 6, fontSize: 11, color: G.textMuted }}>
                    TP/SL/BE uses entry, target/stop, direction, and lot size automatically.
                  </div>
                </div>
              </G2>

              <div style={{ height: 14 }} />

              <div style={{ maxWidth: 280 }}>
                <Label>Auto RR After Close</Label>
                <FInput
                  type="number"
                  placeholder="Calculated after close"
                  value={tradePreviewRr === "" ? tradeForm.riskReward : tradePreviewRr.toFixed(2)}
                  onChange={(e) => setTradeField("riskReward", e.target.value)}
                  step="0.01"
                  readOnly={tradePreviewRr !== ""}
                />
                <div style={{ marginTop: 6, fontSize: 11, color: G.textMuted }}>
                  Uses entry, stop loss, direction, and close/outcome price.
                </div>
              </div>

              <div style={{ height: 22 }} />

              {[
                ["Mindset Before Trade", "mindsetBefore"],
                ["Mindset During Trade", "mindsetDuring"],
                ["Mindset After Trade", "mindsetAfter"],
              ].map(([label, key]) => (
                <div key={key} style={{ marginBottom: 18 }}>
                  <Label>{label}</Label>
                  <ChipGroup
                    options={MINDSETS}
                    value={tradeForm[key]}
                    onChange={(value) => setTradeField(key, value)}
                    multi
                  />
                </div>
              ))}

              <div style={{ height: 6 }} />

              <div style={{ marginBottom: 16 }}>
                <Label>What Went Well</Label>
                <FTextarea
                  rows={3}
                  placeholder="Good execution, waited for confirmation, respected stop loss..."
                  value={tradeForm.whatWentWell}
                  onChange={(e) => setTradeField("whatWentWell", e.target.value)}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <Label>What Went Wrong</Label>
                <FTextarea
                  rows={3}
                  placeholder="Moved stop loss, entered early, ignored plan..."
                  value={tradeForm.whatWentWrong}
                  onChange={(e) => setTradeField("whatWentWrong", e.target.value)}
                />
              </div>

              <div style={{ marginBottom: 22 }}>
                <Label>Key Lesson</Label>
                <FTextarea
                  rows={3}
                  placeholder="What will you do differently next time?"
                  value={tradeForm.lesson}
                  onChange={(e) => setTradeField("lesson", e.target.value)}
                />
              </div>

              <div>
                <Label>Trade Quality Rating</Label>
                <StarRating value={tradeForm.rating} onChange={(value) => setTradeField("rating", value)} />
              </div>
            </Section>
          )}
        </div>
        <ActionModal modal={actionModal} onResolve={resolveActionModal} />
      </div>
    );
  }

  if (view === "trade-view" && selectedProject && selectedTrade) {
    const pnl = Number(selectedTrade.pnl);
    const isSelectedImported = isMt5ImportedTrade(selectedTrade);
    const selectedSourceLabel = formatTradeSource(selectedTrade);
    const selectedOutcomeLabel = formatOutcomeLabel(selectedTrade.outcome);
    const selectedImportNote = getImportedTradeNote(selectedTrade.tradePlan);
    const outcomeColor =
      selectedTrade.outcome === "TP" ? G.win : selectedTrade.outcome === "SL" ? G.loss : G.gold;

    return (
      <div style={{ minHeight: "100vh", background: G.bg, color: G.text, fontFamily: "system-ui, sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #c5ccd8; border-radius: 3px; }`}</style>
        <div style={{ borderBottom: `1px solid ${G.border}`, background: G.bgCard, position: "sticky", top: 0, zIndex: 100 }}>
          <div
            style={{
              maxWidth: APP_PAGE_WIDTH,
              margin: "0 auto",
              padding: "0 24px",
              minHeight: 62,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setView("project")}
                style={{
                  background: "transparent",
                  border: `1px solid ${G.border}`,
                  color: G.textSub,
                  borderRadius: 8,
                  padding: "7px 14px",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Back
              </button>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span
                  style={{
                    background: selectedTrade.direction === "BUY" ? G.winBg : G.lossBg,
                    color: selectedTrade.direction === "BUY" ? G.win : G.loss,
                    borderRadius: 5,
                    padding: "2px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {selectedTrade.direction}
                </span>
                <span
                  style={{
                    background: G.goldGlow,
                    color: G.goldLight,
                    borderRadius: 5,
                    padding: "2px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {PHASES.find((phase) => phase.id === selectedTrade.phase)?.label || "Phase 1"}
                </span>
                {isSelectedImported && (
                  <span
                    style={{
                      background: G.bgCard2,
                      color: G.textSub,
                      border: `1px solid ${G.border}`,
                      borderRadius: 5,
                      padding: "2px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    Source: {selectedSourceLabel}
                  </span>
                )}
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: G.goldLight }}>
                  {selectedTrade.pair} | {selectedTrade.date} {selectedTrade.time}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openTradeEdit(selectedTrade)}
              style={{
                background: G.goldGlow2,
                border: `1px solid ${G.gold}`,
                color: G.goldLight,
                borderRadius: 8,
                padding: "8px 20px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Edit Trade
            </button>
          </div>
        </div>

        <div style={{ maxWidth: APP_PAGE_WIDTH, margin: "0 auto", padding: "28px 24px" }}>
          <Section num="1" title="Pre-Trade Plan" color={G.purple}>
            {selectedTrade.preScreenshot && (
              <div style={{ marginBottom: 22 }}>
                <img
                  src={selectedTrade.preScreenshot}
                  alt="Pre trade chart"
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: `1px solid ${G.border}`,
                    maxHeight: 420,
                    objectFit: "contain",
                    background: "#f8fafc",
                  }}
                />
              </div>
            )}

            <G3 gap={14}>
              <div>
                <Label>Setup</Label>
                <div style={{ color: G.gold, fontWeight: 600, fontSize: 14 }}>{selectedTrade.setup}</div>
              </div>
              <div>
                <Label>Session</Label>
                <div style={{ color: G.text }}>{isSelectedImported ? "Auto Import" : selectedTrade.session}</div>
              </div>
              <div>
                <Label>R:R</Label>
                <div style={{ color: G.gold, fontFamily: "monospace", fontSize: 18, fontWeight: 700 }}>
                  {formatRiskReward(selectedTrade.riskReward)}
                </div>
              </div>
            </G3>

            <div style={{ height: 16 }} />

            <G3 gap={14}>
              {[
                ["Entry", selectedTrade.entryPrice, G.text],
                ["Lot Size", selectedTrade.lotSize, G.text],
                ["Stop Loss", selectedTrade.slPrice, G.loss],
                ["Take Profit", selectedTrade.tpPrice, G.win],
              ].map(([label, value, color]) => (
                <div key={label}>
                  <Label>{label}</Label>
                  <div style={{ color, fontFamily: "monospace", fontSize: 20, fontWeight: 700 }}>{value || "--"}</div>
                </div>
              ))}
            </G3>

            {selectedTrade.tradePlan && (
              <>
                <div style={{ height: 20 }} />
                <Label>{isSelectedImported ? "Import Note" : "Trade Plan"}</Label>
                <div
                  style={{
                    background: "#f8fafc",
                    border: `1px solid ${G.border}`,
                    borderLeft: `3px solid ${G.purple}`,
                    borderRadius: "0 10px 10px 0",
                    padding: "16px 20px",
                    color: G.text,
                    fontSize: 14,
                    lineHeight: 1.8,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {isSelectedImported ? selectedImportNote : selectedTrade.tradePlan}
                </div>
              </>
            )}
          </Section>

          <Section num="2" title="Post-Trade Review" color={G.gold}>
            {selectedTrade.postScreenshot && (
              <div style={{ marginBottom: 22 }}>
                <img
                  src={selectedTrade.postScreenshot}
                  alt="Post trade chart"
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: `1px solid ${G.border}`,
                    maxHeight: 420,
                    objectFit: "contain",
                    background: "#f8fafc",
                  }}
                />
              </div>
            )}

            <G3 gap={14}>
              <div>
                <Label>Exit Result</Label>
                {selectedTrade.outcome ? (
                  <span style={{ color: outcomeColor, fontWeight: 800, fontSize: 16 }}>{selectedOutcomeLabel}</span>
                ) : (
                  <span style={{ color: G.textMuted }}>--</span>
                )}
              </div>
              <div>
                <Label>Close Price</Label>
                <div style={{ color: G.text, fontFamily: "monospace", fontSize: 18, fontWeight: 700 }}>
                  {selectedTrade.closePrice || "--"}
                </div>
              </div>
              <div>
                <Label>PnL</Label>
                <div style={{ color: pnl >= 0 ? G.win : G.loss, fontFamily: "monospace", fontSize: 22, fontWeight: 800 }}>
                  {selectedTrade.pnl ? fmtMoney(pnl, true) : "--"}
                </div>
              </div>
            </G3>

            {(selectedTrade.brokerTicket || selectedTrade.brokerAccountNumber) && (
              <>
                <div style={{ height: 16 }} />
                <G3 gap={14}>
                  <div>
                    <Label>Entry Source</Label>
                    <div style={{ color: G.text }}>{selectedSourceLabel}</div>
                  </div>
                  <div>
                    <Label>Broker Ticket</Label>
                    <div style={{ color: G.text, fontFamily: "monospace" }}>{selectedTrade.brokerTicket || "--"}</div>
                  </div>
                  <div>
                    <Label>Broker Account</Label>
                    <div style={{ color: G.text, fontFamily: "monospace" }}>{selectedTrade.brokerAccountNumber || "--"}</div>
                  </div>
                </G3>
              </>
            )}

            {(selectedTrade.readinessStatusAtEntry || selectedTrade.readinessScoreAtEntry !== null) && (
              <>
                <div style={{ height: 16 }} />
                <G3 gap={14}>
                  <div>
                    <Label>Mindset At Entry</Label>
                    <div style={{ color: G.text, fontWeight: 700 }}>
                      {formatReadinessStatusLabel(selectedTrade.readinessStatusAtEntry)}
                    </div>
                  </div>
                  <div>
                    <Label>Mindset Score</Label>
                    <div style={{ color: G.text, fontFamily: "monospace" }}>
                      {Number.isFinite(Number(selectedTrade.readinessScoreAtEntry))
                        ? `${Number(selectedTrade.readinessScoreAtEntry)}%`
                        : "--"}
                    </div>
                  </div>
                  <div>
                    <Label>Override</Label>
                    <div style={{ color: selectedTrade.readinessOverride ? G.loss : G.win, fontWeight: 700 }}>
                      {selectedTrade.readinessOverride ? "Red Mindset Override" : "No"}
                    </div>
                  </div>
                </G3>
              </>
            )}

            {(selectedTrade.mindsetBefore.length || selectedTrade.mindsetDuring.length || selectedTrade.mindsetAfter.length) > 0 && (
              <>
                <div style={{ height: 20 }} />
                <G3 gap={14}>
                  {[
                    ["Mindset Before", selectedTrade.mindsetBefore],
                    ["Mindset During", selectedTrade.mindsetDuring],
                    ["Mindset After", selectedTrade.mindsetAfter],
                  ].map(([label, value]) =>
                    value.length ? (
                      <div key={label}>
                        <Label>{label}</Label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {value.map((item) => (
                            <span
                              key={item}
                              style={{
                                fontSize: 11,
                                color: G.goldDim,
                                background: G.goldGlow,
                                borderRadius: 4,
                                padding: "3px 9px",
                              }}
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null
                  )}
                </G3>
              </>
            )}

            {(selectedTrade.whatWentWell || selectedTrade.whatWentWrong || selectedTrade.lesson) && (
              <>
                <div style={{ height: 20 }} />
                {[
                  ["What Went Well", selectedTrade.whatWentWell, G.win],
                  ["What Went Wrong", selectedTrade.whatWentWrong, G.loss],
                  ["Key Lesson", selectedTrade.lesson, G.purple],
                ]
                  .filter(([, value]) => value)
                  .map(([label, value, color]) => (
                    <div key={label} style={{ marginBottom: 14 }}>
                      <Label>{label}</Label>
                      <div
                        style={{
                          background: "#f8fafc",
                          border: `1px solid ${G.border}`,
                          borderLeft: `3px solid ${color}`,
                          borderRadius: "0 8px 8px 0",
                          padding: "13px 18px",
                          color: G.text,
                          fontSize: 14,
                          lineHeight: 1.75,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {value}
                      </div>
                    </div>
                  ))}
              </>
            )}

            {selectedTrade.rating > 0 && (
              <>
                <div style={{ height: 10 }} />
                <Label>Rating</Label>
                <div style={{ fontSize: 24 }}>
                  {"*".repeat(selectedTrade.rating)}
                  <span style={{ fontSize: 13, color: G.textSub, marginLeft: 8 }}>
                    {["", "Poor", "Below Avg", "Average", "Good", "Excellent"][selectedTrade.rating]}
                  </span>
                </div>
              </>
            )}
          </Section>
        </div>
      </div>
    );
  }

  if (view === "project" && selectedProject && stats) {
    const projectTotalPnl = selectedProject.trades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0);
    const projectWins = selectedProject.trades.filter((trade) => trade.outcome === "TP").length;
    const projectLosses = selectedProject.trades.filter((trade) => trade.outcome === "SL").length;
    const projectRatedTrades = selectedProject.trades.filter((trade) => trade.rating > 0);
    const projectAvgRating = projectRatedTrades.length
      ? (projectRatedTrades.reduce((sum, trade) => sum + trade.rating, 0) / projectRatedTrades.length).toFixed(1)
      : null;
    const tradeNumberById = Object.fromEntries(
      [...selectedProject.trades]
        .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
        .map((trade, index) => [trade.id, index + 1])
    );

    return (
      <div style={{ minHeight: "100vh", background: G.bg, color: G.text, fontFamily: "system-ui, sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #c5ccd8; border-radius: 3px; } input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }`}</style>
        <div style={{ borderBottom: `1px solid ${G.border}`, background: G.bgCard, position: "sticky", top: 0, zIndex: 100 }}>
          <div
            style={{
              maxWidth: APP_PAGE_WIDTH,
              margin: "0 auto",
              padding: "0 24px",
              minHeight: 64,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 13, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={openProjects}
                style={{
                  background: "transparent",
                  border: `1px solid ${G.border}`,
                  color: G.textSub,
                  borderRadius: 8,
                  padding: "7px 14px",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Projects
              </button>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, color: G.goldLight, lineHeight: 1 }}>
                  {selectedProject.name}
                </div>
                <div style={{ fontSize: 10, color: G.textMuted, letterSpacing: "0.14em", marginTop: 2 }}>
                  PROP FIRM PROJECT | TRADING JOURNAL INSIDE PROJECT
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
              {isSupabaseConfigured && supabaseSession && (
                <>
                  <button
                    type="button"
                    onClick={openMindsetReadiness}
                    style={{
                      background: readinessBadgeVisual.bg,
                      border: `1px solid ${readinessBadgeVisual.border}`,
                      color: readinessBadgeVisual.color,
                      borderRadius: 999,
                      padding: "7px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                    title="Open Mindset Readiness"
                  >
                    {readinessBadge}
                  </button>
                  <button type="button" onClick={openAccountPage}
                    title={signedInUserLabel}
                    style={{
                      background: G.winBg,
                      border: `1px solid ${G.win}33`,
                      color: G.win,
                      borderRadius: 999,
                      padding: "7px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      maxWidth: 280,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="8" cy="5" r="2.7" fill="currentColor" />
                      <path d="M2.5 13c.8-2.3 2.8-3.5 5.5-3.5s4.7 1.2 5.5 3.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                    </svg>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{signedInUserLabel}</span>
                  </button>
                  <button
                    type="button"
                    title={cloudStatus || "Sync local data to cloud"}
                    onClick={() => pushCloudJournal({ silent: false })}
                    disabled={cloudBusy}
                    style={{
                      background: G.bgCard,
                      border: `1px solid ${G.border}`,
                      color: G.textSub,
                      padding: "8px 14px",
                      borderRadius: 999,
                      cursor: cloudBusy ? "not-allowed" : "pointer",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {cloudBusy ? "Syncing..." : "Sync"}
                  </button>
                  <button
                    type="button"
                    title={cloudStatus || "Sign out from cloud session"}
                    onClick={signOutCloud}
                    disabled={cloudBusy}
                    style={{
                      background: "transparent",
                      border: `1px solid ${G.border}`,
                      color: G.textSub,
                      padding: "8px 14px",
                      borderRadius: 999,
                      cursor: cloudBusy ? "not-allowed" : "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Sign Out
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => openProjectEdit(selectedProject)}
                style={{
                  background: "transparent",
                  border: `1px solid ${G.border}`,
                  color: G.textSub,
                  padding: "8px 16px",
                  borderRadius: 9,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Edit Project
              </button>
              <button
                type="button"
                onClick={openTradeNew}
                style={{
                  background: `linear-gradient(135deg, ${G.gold}, ${G.goldDim})`,
                  border: "none",
                  color: "#ffffff",
                  padding: "9px 22px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                  boxShadow: `0 0 20px ${G.goldGlow2}`,
                }}
              >
                New Trade
              </button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: APP_PAGE_WIDTH, margin: "0 auto", padding: "28px 24px" }}>
          <Section num="1" title="Project Rules" color={G.gold}>
            {PHASES.map((phase, index) => {
              const locked =
                phase.id === "phase2" &&
                !phaseStats.phase1?.targetHit &&
                (phaseStats.phase2?.trades.length || 0) === 0;

              return (
                <div key={phase.id}>
                  <PhaseRulesPanel stats={phaseStats[phase.id]} locked={locked} />
                  {index < PHASES.length - 1 && (
                    <div
                      style={{
                        height: 1,
                        background: G.border,
                        margin: "0 0 28px",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </Section>

          <Section num="2" title="20 Trade Challenge Rules" color={G.purple}>
            <ChallengeRulesPanel
              challenge={getChallengeStats(selectedProject)}
              rules={CHALLENGE_RULES}
              theme={G}
            />
          </Section>

          <Section num="3" title="Trading Journal" color={G.purple}>
            {selectedProject.trades.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <MetricCard label="Trades" value={selectedProject.trades.length} color={G.gold} />
                <MetricCard label="TP Hit" value={projectWins} color={G.win} />
                <MetricCard label="SL Hit" value={projectLosses} color={G.loss} />
                <MetricCard label="Total PnL" value={fmtMoney(projectTotalPnl, true)} color={projectTotalPnl >= 0 ? G.win : G.loss} />
                <MetricCard label="Avg Rating" value={projectAvgRating ? `${projectAvgRating}/5` : "--"} color={G.gold} />
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
              <FInput
                placeholder="Search pair, setup, plan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ maxWidth: 280 }}
              />
              {["ALL", "BUY", "SELL"].map((direction) => (
                <button
                  key={direction}
                  type="button"
                  onClick={() => setFilterDir(direction)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    transition: "all 0.15s",
                    background: filterDir === direction ? G.goldGlow2 : "transparent",
                    border: `1px solid ${filterDir === direction ? G.gold : G.border}`,
                    color: filterDir === direction ? G.goldLight : G.textMuted,
                  }}
                >
                  {direction}
                </button>
              ))}
              <div style={{ marginLeft: "auto", fontSize: 13, color: G.textMuted }}>
                {filteredTrades.length} trade{filteredTrades.length !== 1 ? "s" : ""}
              </div>
            </div>

            {filteredTrades.length === 0 ? (
              <div style={{ textAlign: "center", padding: "72px 20px", color: G.textMuted }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: G.text, marginBottom: 10 }}>
                  {selectedProject.trades.length === 0 ? "No trades yet" : "No results"}
                </div>
                <div style={{ fontSize: 14, marginBottom: 26 }}>
                  {selectedProject.trades.length === 0
                    ? "Start logging trades inside this project."
                    : "Change the search text or direction filter."}
                </div>
                {selectedProject.trades.length === 0 && (
                  <button
                    type="button"
                    onClick={openTradeNew}
                    style={{
                      background: `linear-gradient(135deg, ${G.gold}, ${G.goldDim})`,
                      border: "none",
                      color: "#ffffff",
                      padding: "12px 28px",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 800,
                    }}
                  >
                    Log First Trade
                  </button>
                )}
              </div>
            ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredTrades.map((trade) => (
                <TradeCard
                  key={trade.id}
                  trade={trade}
                  tradeNo={tradeNumberById[trade.id]}
                  onClick={() => openTradeView(trade.id)}
                />
              ))}
            </div>
          )}
          </Section>
        </div>
        <TradePermissionModal
          modal={tradePermissionModal}
          onClose={closeTradePermissionModal}
          onGoToMindsetCheck={handleTradePermissionGoToCheck}
          onContinueAnyway={handleTradePermissionContinueAnyway}
          onOverrideAndContinue={handleTradePermissionOverrideAndContinue}
        />
      </div>
    );
  }

  if (view === "mindset-readiness") {
    const result = readinessPreview;
    const visual = getReadinessVisual(result.status);
    const goBackView = selectedProject ? "project" : "projects";

    return (
      <div style={{ minHeight: "100vh", background: G.bg, color: G.text, fontFamily: "system-ui, sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #c5ccd8; border-radius: 3px; }`}</style>
        <div style={{ borderBottom: `1px solid ${G.border}`, background: G.bgCard, position: "sticky", top: 0, zIndex: 100 }}>
          <div
            style={{
              maxWidth: APP_PAGE_WIDTH,
              margin: "0 auto",
              padding: "0 24px",
              minHeight: 64,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: G.goldLight, fontWeight: 700 }}>
                Mindset Readiness
              </div>
              <div style={{ fontSize: 12, color: G.textMuted, letterSpacing: "0.08em" }}>
                EARN YOUR PERMISSION BEFORE YOU TRADE
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setView(goBackView)}
                style={{
                  background: "transparent",
                  border: `1px solid ${G.border}`,
                  color: G.textSub,
                  borderRadius: 999,
                  padding: "8px 14px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => loadTodayReadiness({ silent: false })}
                disabled={readinessBusy}
                style={{
                  background: G.bgCard2,
                  border: `1px solid ${G.border}`,
                  color: G.textSub,
                  borderRadius: 999,
                  padding: "8px 14px",
                  cursor: readinessBusy ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {readinessBusy ? "Loading..." : "Reload Today"}
              </button>
              <button
                type="button"
                onClick={saveTodayReadiness}
                disabled={readinessBusy}
                style={{
                  background: `linear-gradient(135deg, ${G.gold}, ${G.goldDim})`,
                  border: "none",
                  color: "#ffffff",
                  borderRadius: 999,
                  padding: "8px 16px",
                  cursor: readinessBusy ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                Save Today Check
              </button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: APP_PAGE_WIDTH, margin: "0 auto", padding: "28px 24px" }}>
          <Section num="1" title="Today's Trade Permission" color={result.status === READINESS_STATUS.DO_NOT_TRADE ? G.loss : result.status === READINESS_STATUS.CAUTION ? G.gold : G.win}>
            <div
              style={{
                border: `1px solid ${visual.border}`,
                background: visual.bg,
                borderRadius: 12,
                padding: "14px 16px",
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: visual.color }}>{visual.label}</div>
                <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 800, color: visual.color }}>{result.score}%</div>
              </div>
              <div style={{ marginTop: 8, color: G.textSub, fontSize: 14 }}>{result.message}</div>
            </div>

            {result.reasons?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Label>Reasons / Warnings</Label>
                <div style={{ background: "#f8fafc", border: `1px solid ${G.border}`, borderRadius: 10, padding: "10px 12px", color: G.textSub, lineHeight: 1.7 }}>
                  {result.reasons.map((reason) => `- ${reason}`).join("\n")}
                </div>
              </div>
            )}

            <G2>
              <div>
                <Label>Recommended Action</Label>
                <div style={{ background: "#f8fafc", border: `1px solid ${G.border}`, borderRadius: 10, padding: "10px 12px", color: G.textSub, lineHeight: 1.7 }}>
                  {result.recommendedAction}
                </div>
              </div>
              <div>
                <Label>Today's Rule</Label>
                <div style={{ background: "#f8fafc", border: `1px solid ${G.border}`, borderRadius: 10, padding: "10px 12px", color: G.textSub, lineHeight: 1.7 }}>
                  One trade. Then stop.
                </div>
              </div>
            </G2>

            {result.status === READINESS_STATUS.DO_NOT_TRADE && (
              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  onClick={logNoTradeDayWin}
                  disabled={readinessBusy}
                  style={{
                    background: G.winBg,
                    border: `1px solid ${G.win}55`,
                    color: G.win,
                    borderRadius: 10,
                    padding: "9px 14px",
                    cursor: readinessBusy ? "not-allowed" : "pointer",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  Log No Trade Day
                </button>
              </div>
            )}

            {readinessStatus && (
              <div style={{ marginTop: 12, fontSize: 12, color: G.textMuted }}>
                {readinessStatus}
              </div>
            )}
          </Section>

          <Section num="2" title="Daily Checklist" color={G.purple}>
            <div style={{ marginBottom: 16, fontSize: 12, color: G.textMuted }}>
              Date: {todayLocalDate}
            </div>

            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: G.goldLight, marginBottom: 10 }}>
              Body & Energy
            </div>
            <G3>
              <div>
                <Label>SLEEP & RECOVERY</Label>
                <FSelect
                  value={readinessForm.sleepQuality}
                  onChange={(e) => setReadinessField("sleepQuality", e.target.value)}
                >
                  {SLEEP_QUALITY_DISPLAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </FSelect>
              </div>
              <div><Label>Meditation</Label><FSelect value={readinessForm.meditationDone} onChange={(e) => setReadinessField("meditationDone", e.target.value)}>{READINESS_OPTIONS.meditationDone.map((item) => <option key={item}>{item}</option>)}</FSelect></div>
              <div><Label>Showered</Label><FSelect value={readinessForm.showered} onChange={(e) => setReadinessField("showered", e.target.value)}>{READINESS_OPTIONS.yesNo.map((item) => <option key={item}>{item}</option>)}</FSelect></div>
              <div><Label>Food & Water</Label><FSelect value={readinessForm.foodAndWater} onChange={(e) => setReadinessField("foodAndWater", e.target.value)}>{READINESS_OPTIONS.yesNoPartial.map((item) => <option key={item}>{item}</option>)}</FSelect></div>
              <div><Label>Energy (1-10)</Label><FInput type="number" min="1" max="10" value={readinessForm.energyLevel} onChange={(e) => setReadinessField("energyLevel", e.target.value)} /></div>
              <div><Label>Focus (1-10)</Label><FInput type="number" min="1" max="10" value={readinessForm.focusLevel} onChange={(e) => setReadinessField("focusLevel", e.target.value)} /></div>
            </G3>

            <div style={{ height: 18 }} />
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: G.goldLight, marginBottom: 10 }}>
              Environment Check
            </div>
            <G2>
              <div><Label>Desk Clean</Label><FSelect value={readinessForm.deskClean} onChange={(e) => setReadinessField("deskClean", e.target.value)}>{READINESS_OPTIONS.yesNoPartial.map((item) => <option key={item}>{item}</option>)}</FSelect></div>
              <div><Label>Room Clean</Label><FSelect value={readinessForm.roomClean} onChange={(e) => setReadinessField("roomClean", e.target.value)}>{READINESS_OPTIONS.yesNoPartial.map((item) => <option key={item}>{item}</option>)}</FSelect></div>
              <div><Label>Phone Distraction Off</Label><FSelect value={readinessForm.phoneDistractionOff} onChange={(e) => setReadinessField("phoneDistractionOff", e.target.value)}>{READINESS_OPTIONS.yesNo.map((item) => <option key={item}>{item}</option>)}</FSelect></div>
              <div><Label>Outside Bias</Label><FSelect value={readinessForm.externalInfluence} onChange={(e) => setReadinessField("externalInfluence", e.target.value)}>{READINESS_OPTIONS.externalInfluence.map((item) => <option key={item}>{item}</option>)}</FSelect></div>
            </G2>

            <div style={{ height: 18 }} />
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: G.goldLight, marginBottom: 10 }}>
              Emotional State
            </div>
            <G2>
              <div><Label>Current Emotion</Label><FSelect value={readinessForm.currentEmotion} onChange={(e) => setReadinessField("currentEmotion", e.target.value)}>{READINESS_OPTIONS.currentEmotion.map((item) => <option key={item}>{item}</option>)}</FSelect></div>
              <div><Label>Previous Result Bothering</Label><FSelect value={readinessForm.previousResultBothering} onChange={(e) => setReadinessField("previousResultBothering", e.target.value)}>{READINESS_OPTIONS.previousResultBothering.map((item) => <option key={item}>{item}</option>)}</FSelect></div>
              <div><Label>Revenge Risk</Label><FSelect value={readinessForm.revengeRisk} onChange={(e) => setReadinessField("revengeRisk", e.target.value)}>{READINESS_OPTIONS.revengeRisk.map((item) => <option key={item}>{item}</option>)}</FSelect></div>
              <div><Label>Financial Pressure</Label><FSelect value={readinessForm.financialPressure} onChange={(e) => setReadinessField("financialPressure", e.target.value)}>{READINESS_OPTIONS.financialPressure.map((item) => <option key={item}>{item}</option>)}</FSelect></div>
              <div><Label>Stress (1-10)</Label><FInput type="number" min="1" max="10" value={readinessForm.stressLevel} onChange={(e) => setReadinessField("stressLevel", e.target.value)} /></div>
              <div><Label>Confidence (1-10)</Label><FInput type="number" min="1" max="10" value={readinessForm.confidenceLevel} onChange={(e) => setReadinessField("confidenceLevel", e.target.value)} /></div>
            </G2>

            <div style={{ height: 18 }} />
            <div>
              <Label>Today's Rule</Label>
              <div
                style={{
                  background: "#f8fafc",
                  border: `1px solid ${G.border}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  color: G.textSub,
                  lineHeight: 1.7,
                }}
              >
                One trade. Then stop.
              </div>
            </div>
          </Section>
        </div>
      </div>
    );
  }

  const isMindsetCheckPage = view === "mindset-check-page";
  const isCleanDayPage = view === "clean-day-page";
  const isSettingsPage = view === "settings-page";
  const isTradingJournalPage = view === "trading-journal-page";
  const cleanDayCompareFields = [
    "eveningLocation",
    "eveningWentCarromPlace",
    "eveningPlayedCarrom",
    "smokingDone",
    "cigaretteCount",
    "hourlyCheckin6pm",
    "hourlyCheckin7pm",
    "hourlyCheckin8pm",
    "hourlyCheckin9pm",
    "hourlyCheckin10pm",
    "hourlySnapshots",
    "adaptiveResponses",
    "eveningResetStartedAt",
    "sleepProtectionLocked",
    "shutdownNoOutside",
    "shutdownNoMoreCigarette",
    "shutdownNoCarromTrigger",
    "shutdownReducePhone",
    "shutdownMoveToBed",
    "closeDayResult",
    "emergencyLockActivated",
    "sleepSleptAt",
    "sleepWokeAt",
    "sleepDurationMinutes",
    "sleepDurationLabel",
    "morningSleepSavedAt",
    "closedAt",
  ];
  const cleanDayChallengeCursor = computeCleanDayChallengeCursor(cleanDayActiveChallenge, todayLocalDate);
  const cleanDayActiveDayLocalDate = cleanDayChallengeCursor.dayLocalDate || todayLocalDate;
  const cleanDayActiveDayNumber = cleanDayChallengeCursor.dayNumber || 1;
  const cleanDayTargetDays = cleanDayChallengeCursor.targetDays || 7;
  const cleanDayBaseline =
    todayCleanDayEntry || emptyCleanDayForm(cleanDayForm.localDate || cleanDayActiveDayLocalDate || todayLocalDate);
  const cleanDayChallengeProgress = (cleanDayChallengeDays || []).reduce(
    (acc, row) => {
      const status = String(row?.daily_status || "").toLowerCase();
      if (status === CLEAN_DAY_DAILY_STATUS.CLEAN_DAY) acc.cleanDays += 1;
      else if (status === CLEAN_DAY_DAILY_STATUS.RECOVERED_DAY) acc.recoveredDays += 1;
      else if (status === CLEAN_DAY_DAILY_STATUS.NOT_CLEAN) acc.notCleanDays += 1;
      else if (status === CLEAN_DAY_DAILY_STATUS.MISSED) acc.missedDays += 1;
      return acc;
    },
    {
      cleanDays: 0,
      recoveredDays: 0,
      notCleanDays: 0,
      missedDays: 0,
    }
  );
  const cleanDayHasUnsavedChanges = cleanDayCompareFields.some(
    (key) => {
      const currentValue = cleanDayForm?.[key];
      const baselineValue = cleanDayBaseline?.[key];
      if (
        (key === "hourlySnapshots" || key === "adaptiveResponses") &&
        currentValue &&
        baselineValue &&
        typeof currentValue === "object" &&
        typeof baselineValue === "object"
      ) {
        return JSON.stringify(currentValue) !== JSON.stringify(baselineValue);
      }
      return String(currentValue ?? "") !== String(baselineValue ?? "");
    }
  );
  const formatCleanDayTimeLabel = (raw) => {
    if (!raw) return "";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(parsed);
  };
  const cleanDaySavedTimeLabel = (() => {
    const raw = todayCleanDayEntry?.savedAt || todayCleanDayEntry?.updatedAt || "";
    if (!raw) return "";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return "";
    if (localDateValue(parsed) !== todayLocalDate) return "";
    return formatCleanDayTimeLabel(raw);
  })();
  const cleanDayFooterEventLabel = (() => {
    if (!cleanDayFooterEvent?.type || !cleanDayFooterEvent?.at) return "";
    const eventTime = formatCleanDayTimeLabel(cleanDayFooterEvent.at);
    if (!eventTime) return "";
    if (cleanDayFooterEvent.type === "saved") return `Saved today at ${eventTime}`;
    return "";
  })();
  const cleanDayFooterStatus =
    (cleanDayStatus && cleanDayStatus.startsWith("Could not") ? cleanDayStatus : "") ||
    cleanDayFooterEventLabel ||
    (cleanDayHasUnsavedChanges
      ? "Unsaved changes"
      : cleanDaySavedTimeLabel
        ? `Saved today at ${cleanDaySavedTimeLabel}`
        : "Not saved today");
  const homeReadinessResult = readinessPreview;
  const homeReadinessStatus = homeReadinessResult?.status || READINESS_STATUS.NOT_CHECKED;
  const homeReadinessScore = Number.isFinite(Number(homeReadinessResult?.score))
    ? Number(homeReadinessResult.score)
    : 0;
  const readinessScoreDisplay = homeReadinessScore;
  const homeReadinessTheme = (() => {
    if (homeReadinessStatus === READINESS_STATUS.READY_TO_TRADE) {
      return {
        accent: "#16A34A",
        softBg: "#ECFDF3",
        softBorder: "#A7F3D0",
        headline: "Mindset: Ready To Trade",
        decisionBody: "Clean execution state. Trade only your plan.",
        ringTrack: "#DFF5E9",
        iconBg: "#DDF6E8",
      };
    }
    if (homeReadinessStatus === READINESS_STATUS.CAUTION) {
      return {
        accent: "#F59E0B",
        softBg: "#FFF7E6",
        softBorder: "#FCD38D",
        headline: "Mindset: Caution",
        decisionBody: "Some weak areas detected. Recheck before trading.",
        ringTrack: "#FCECCE",
        iconBg: "#FDECC9",
      };
    }
    if (homeReadinessStatus === READINESS_STATUS.DO_NOT_TRADE) {
      return {
        accent: "#DC2626",
        softBg: "#FEF2F2",
        softBorder: "#FBCACA",
        headline: "Mindset: Do Not Trade",
        decisionBody: "Protect your account. Stay out today.",
        ringTrack: "#F8D6D6",
        iconBg: "#FEE2E2",
      };
    }
    return {
      accent: "#64748B",
      softBg: "#F8FAFC",
      softBorder: "#DBE4EF",
      headline: "Mindset: Not Checked Yet",
      decisionBody: "Complete today’s readiness check before trading.",
      ringTrack: "#DFE7F2",
      iconBg: "#EAF0FA",
    };
  })();
  const homeReadinessScoreClamped = Math.max(
    0,
    Math.min(100, Number.isFinite(Number(readinessScoreDisplay)) ? Number(readinessScoreDisplay) : 0)
  );
  const homeReadinessRingDegrees = homeReadinessScoreClamped * 3.6;
  const HomeReadinessStatusIcon =
    homeReadinessStatus === READINESS_STATUS.READY_TO_TRADE
      ? ShieldCheck
      : homeReadinessStatus === READINESS_STATUS.CAUTION || homeReadinessStatus === READINESS_STATUS.DO_NOT_TRADE
        ? TriangleAlert
        : ListChecks;
  const focusOneTradeReadinessState = getOneTradeReadinessState(todayReadiness);
  const focusShowDoNotTradeWarning =
    focusOneTradeReadinessState === ONE_TRADE_READINESS_STATE.DO_NOT_TRADE;
  const focusTodayDay = focusDisciplineEvaluation?.todayDay || null;
  const focusTodayTradesCount = focusDisciplineEvaluation?.todayTradesCount || 0;
  const focusRecentDays = Array.isArray(focusDisciplineEvaluation?.recentDays)
    ? focusDisciplineEvaluation.recentDays
    : [];
  const focusRecentDaysItems = focusCurrentDisciplineChallenge
    ? focusRecentDays
    : focusRecentDays.filter((item) => Boolean(item?.status));
  const focusHasRecentDaysItems = focusRecentDaysItems.length > 0;
  const focusBestStreak = Number(focusDisciplineEvaluation?.bestStreakCurrentTarget || 0);
  const focusChallengeStatus = focusCurrentDisciplineChallenge?.status || "";
  const focusIsActiveAttempt = focusChallengeStatus === DISCIPLINE_CHALLENGE_STATUS.ACTIVE;
  const focusIsBrokenFrozen = focusChallengeStatus === DISCIPLINE_CHALLENGE_STATUS.BROKEN_FROZEN;
  const focusIsScheduled = focusChallengeStatus === DISCIPLINE_CHALLENGE_STATUS.SCHEDULED;
  const focusIsCompletedAttempt = focusChallengeStatus === DISCIPLINE_CHALLENGE_STATUS.COMPLETED;
  const focusTodayStatus = focusTodayDay?.status || DISCIPLINE_DAY_STATUS.WAITING;
  const focusUnifiedCountdownLabel = formatDurationLabel(focusCloseCountdown.ms, {
    includeSeconds: true,
  });
  const focusChallengeProgress = focusCurrentDisciplineChallenge
    ? `${focusCurrentDisciplineChallenge.completed_clean_days} / ${focusCurrentDisciplineChallenge.target_clean_days}`
    : "0 / 0";
  const focusChallengeRuleBreaks = focusCurrentDisciplineChallenge?.rule_breaks || 0;
  const focusChallengeStreak = focusCurrentDisciplineChallenge?.current_streak || 0;
  const focusStreakValue = `${focusChallengeStreak} ${focusChallengeStreak === 1 ? "Day" : "Days"}`;
  const focusBestValue = `${focusBestStreak} ${focusBestStreak === 1 ? "Day" : "Days"}`;
  const focusAttemptNumberValue = focusCurrentDisciplineChallenge?.challenge_number || "-";
  const focusChallengeAttemptLabel = focusCurrentDisciplineChallenge
    ? `${focusCurrentDisciplineChallenge.target_clean_days} Clean Days Challenge`
    : "";
  const focusChallengeContextLine = focusCurrentDisciplineChallenge
    ? `${focusChallengeAttemptLabel} · Attempt #${focusAttemptNumberValue}`
    : "";
  const focusPostTradePending =
    focusIsActiveAttempt &&
    focusTodayTradesCount === 1 &&
    (focusTodayStatus === DISCIPLINE_DAY_STATUS.PENDING_CLEAN ||
      focusTodayStatus === DISCIPLINE_DAY_STATUS.TRADE_TAKEN ||
      focusTodayStatus === DISCIPLINE_DAY_STATUS.MARKET_CLOSED);
  const focusCleanLocked = focusTodayStatus === DISCIPLINE_DAY_STATUS.CLEAN;
  const focusBrokenToday =
    focusTodayStatus === DISCIPLINE_DAY_STATUS.BROKEN || focusIsBrokenFrozen;
  const focusHeaderAction = (() => {
    if (focusIsScheduled) {
      return {
        buttonText: "Next Attempt Prepared",
        helperText: "Starts after gold day close",
        disabled: true,
        onClick: undefined,
      };
    }
    if (focusIsCompletedAttempt) {
      return {
        buttonText: "Choose Challenge",
        helperText: "Start a new run",
        disabled: false,
        onClick: openDisciplineChallengeStartModal,
      };
    }
    if (focusPostTradePending) {
      return {
        buttonText: "Trading Closed For Today",
        helperText: "Hold the line until gold day close",
        disabled: true,
        onClick: undefined,
      };
    }
    if (!focusCurrentDisciplineChallenge) {
      return {
        buttonText: "Choose Challenge",
        helperText: "",
        disabled: false,
        onClick: openDisciplineChallengeStartModal,
      };
    }
    return {
      buttonText: "View Active Challenge",
      helperText: `${formatAttemptStatusLabel(focusChallengeStatus)} • ${focusCurrentDisciplineChallenge.completed_clean_days}/${focusCurrentDisciplineChallenge.target_clean_days}`,
      disabled: true,
      onClick: undefined,
    };
  })();
  const showHeaderActionControl =
    Boolean(focusCurrentDisciplineChallenge) && !focusIsActiveAttempt && !focusBrokenToday;
  const focusTodayStatusCard = (() => {
    if (focusIsCompletedAttempt) {
      return {
        title: "Completed",
        subtext: "Start a new challenge.",
        background: G.winBg,
        border: `1px solid ${G.win}33`,
        titleColor: G.win,
      };
    }
    if (focusBrokenToday) {
      return {
        title: "Broken Day",
        subtext: "Restart tomorrow, no shame.",
        background: G.lossBg,
        border: `1px solid ${G.loss}33`,
        titleColor: G.loss,
      };
    }
    if (focusTodayStatus === DISCIPLINE_DAY_STATUS.NO_TRADE) {
      return {
        title: "No Trade Day",
        subtext: "Disciplined skip. Capital protected.",
        background: "#F0FDF4",
        border: `1px solid ${G.win}30`,
        titleColor: G.win,
      };
    }
    if (focusTodayStatus === DISCIPLINE_DAY_STATUS.NEEDS_REVIEW) {
      return {
        title: "Needs Review",
        subtext: "Check today calmly.",
        background: "#F8FAFC",
        border: `1px solid ${G.border}`,
        titleColor: G.textSub,
      };
    }
    if (focusCleanLocked) {
      return {
        title: "Clean Trade Day",
        subtext: "Rule followed.",
        background: G.winBg,
        border: `1px solid ${G.win}33`,
        titleColor: G.win,
      };
    }
    if (
      focusTodayStatus === DISCIPLINE_DAY_STATUS.PENDING_CLEAN ||
      focusTodayStatus === DISCIPLINE_DAY_STATUS.TRADE_TAKEN ||
      focusTodayStatus === DISCIPLINE_DAY_STATUS.MARKET_CLOSED
    ) {
      return {
        title: "Done For Today",
        subtext: "No more trades today.",
        background: G.winBg,
        border: `1px solid ${G.win}30`,
        titleColor: G.win,
      };
    }
    return {
      title: "Waiting",
      subtext: "Wait for your plan.",
      background: G.bgCard2,
      border: `1px solid ${G.border}`,
      titleColor: G.text,
    };
  })();
  const focusTargetDays = Math.max(1, Number(focusCurrentDisciplineChallenge?.target_clean_days || 0) || 1);
  const focusCompletedDays = Math.max(0, Number(focusCurrentDisciplineChallenge?.completed_clean_days || 0) || 0);
  const focusProgressPercent = focusCurrentDisciplineChallenge
    ? Math.max(0, Math.min(100, Math.round((focusCompletedDays / focusTargetDays) * 100)))
    : 0;
  const focusProgressSegments = Array.from({ length: focusTargetDays }, (_, idx) => idx < focusCompletedDays);
  const focusCountdownCard = (() => {
    if (focusBrokenToday) {
      return {
        title: "Rule Broken Today",
        subtext: "Next run starts after gold day close",
        background: "#FEF2F2",
        border: `1px solid ${G.loss}33`,
        color: G.loss,
      };
    }
    if (focusTodayStatus === DISCIPLINE_DAY_STATUS.NO_TRADE) {
      return {
        title: "No Trade Day Locked",
        subtext: "Disciplined skip day completed",
        background: "#ECFDF3",
        border: `1px solid ${G.win}33`,
        color: G.win,
      };
    }
    if (focusTodayStatus === DISCIPLINE_DAY_STATUS.NEEDS_REVIEW) {
      return {
        title: "Needs Review",
        subtext: "Check the day calmly",
        background: "#F8FAFC",
        border: "1px solid #DDE7F2",
        color: G.textSub,
      };
    }
    if (focusIsCompletedAttempt) {
      return {
        title: "Challenge Completed",
        subtext: "Start a new run",
        background: "#ECFDF3",
        border: `1px solid ${G.win}33`,
        color: G.win,
      };
    }
    if (focusIsScheduled) {
      return {
        title: "Next Attempt Prepared",
        subtext: "Starts after gold day close",
        background: "#EEF5FF",
        border: "1px solid #DDE7F2",
        color: G.goldLight,
      };
    }
    return {
      title: "Protect Your Discipline:",
      subtext: `${focusUnifiedCountdownLabel}`,
      background: "#EEF5FF",
      border: "1px solid #DDE7F2",
      color: G.goldLight,
    };
  })();
  return (
    <div style={{ minHeight: "100vh", background: G.bg, color: G.text, fontFamily: "system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: #c5ccd8; border-radius: 3px; } .home-top-shell { max-width: 1472px; margin: 0 auto; padding: 0 24px; } .home-shell { max-width: 1472px; margin: 0 auto; padding: 28px 24px; } .home-two-col { display: grid; grid-template-columns: minmax(0, 1fr) 520px; gap: 20px; align-items: start; } .home-projects-grid { display: grid; grid-template-columns: repeat(2, minmax(320px, 1fr)); gap: 16px; } .home-right-sticky { position: sticky; top: 84px; } @media (max-width: 1400px) { .home-two-col { grid-template-columns: minmax(0, 1fr) 460px; } } @media (max-width: 1200px) { .home-two-col { grid-template-columns: 1fr; } .home-projects-grid { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); } .home-right-sticky { position: static; } } @media (max-width: 760px) { .home-shell { padding: 22px 14px; } .home-top-shell { padding: 0 14px; } .home-projects-grid { grid-template-columns: 1fr; } }`}</style>
      <style>{`.one-trade-main-card { padding: 32px; } .one-trade-summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; } .one-trade-summary-col { padding: 8px 18px; } .one-trade-summary-col + .one-trade-summary-col { border-left: 1px solid #DDE7F2; } .one-trade-summary-footer { margin-top: 16px; padding-top: 14px; border-top: 1px solid #DDE7F2; display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; } .one-trade-run-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; } @media (max-width: 980px) { .one-trade-header { flex-direction: column; align-items: flex-start; } .one-trade-countdown-card { width: 100%; min-width: 0 !important; } .one-trade-summary-grid { grid-template-columns: 1fr; gap: 10px; } .one-trade-summary-col { padding: 4px 0; } .one-trade-summary-col + .one-trade-summary-col { border-left: none; border-top: 1px solid #DDE7F2; padding-top: 12px; } .one-trade-run-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } } @media (max-width: 760px) { .one-trade-main-card { padding: 22px 18px !important; } .one-trade-controls-row { width: 100%; display: grid !important; grid-template-columns: 1fr; gap: 8px !important; } .one-trade-controls-row > * { width: 100% !important; max-width: 100% !important; min-width: 0 !important; } .one-trade-summary-footer { align-items: stretch; } .one-trade-summary-actions { width: 100%; display: grid; grid-template-columns: 1fr; gap: 8px; } .one-trade-run-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } } @media (max-width: 480px) { .one-trade-run-grid { grid-template-columns: 1fr; } }`}</style>
      <style>{`.one-trade-kpi-text { min-width: 0; flex: 1 1 0%; } .one-trade-kpi-label { margin-left: 10px; font-size: 14px; color: rgb(100, 116, 139); font-weight: 500; margin-bottom: 3px; } .one-trade-kpi-value { font-size: 26px; color: rgb(15, 23, 42); font-weight: 700; } .one-trade-kpi-subtext { margin-top: 4px; font-size: 14px; color: rgb(100, 116, 139); font-weight: 500; }`}</style>
      <style>{`
        .app-shell-layout {
          min-height: 100vh;
          display: flex;
        }
        .app-sidebar {
          width: 240px;
          flex: 0 0 240px;
          background: #FFFFFF;
          border-right: 1px solid #DDE7F2;
          height: 100vh;
          min-height: 100vh;
          max-height: 100vh;
          position: sticky;
          top: 0;
          z-index: 35;
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 22px 16px 16px;
          overflow: hidden;
          transition: width 220ms ease, flex-basis 220ms ease, padding 220ms ease;
        }
        .app-sidebar-brand {
          padding: 2px 6px 14px;
          border-bottom: 1px solid #EAF1FA;
          flex: 0 0 auto;
        }
        .app-sidebar-brand-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .app-sidebar-brand-main {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
        }
        .app-sidebar-toggle-row {
          margin-top: 8px;
          display: none;
          justify-content: center;
        }
        .app-sidebar-collapse-toggle {
          width: 18px;
          height: 18px;
          border: none;
          background: transparent;
          box-shadow: none;
          border-radius: 0;
          padding: 0;
          color: #64748B;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 12px;
          line-height: 1;
          opacity: 0.9;
          transition: color 150ms ease, opacity 150ms ease;
        }
        .app-sidebar-collapse-toggle:hover {
          color: #2563EB;
          opacity: 1;
        }
        .app-sidebar-brand-name {
          display: block;
          font-size: 18px;
          font-weight: 700;
          line-height: 1;
          color: #0F172A;
          letter-spacing: 0.01em;
        }
        .app-sidebar-brand-subtitle {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: #64748B;
          font-weight: 600;
        }
        .app-sidebar-link-label {
          display: inline;
        }
        .app-sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 9px;
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 2px;
        }
        .app-sidebar-link {
          border: 1px solid transparent;
          background: transparent;
          color: #475569;
          border-radius: 9px;
          padding: 0 10px 0 14px;
          min-height: 34px;
          font-size: 14px;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          position: relative;
          line-height: 1.2;
          transition: color 0.16s ease, background-color 0.16s ease, border-color 0.16s ease;
        }
        .app-sidebar-link:hover {
          color: #2563EB;
          background: #EEF5FF;
          border-color: #DDE7F2;
        }
        .app-sidebar-link.active {
          color: #2563EB;
          font-weight: 700;
          background: #F8FBFF;
          border-color: #DDE7F2;
        }
        .app-sidebar-link.active::before {
          content: "";
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 14px;
          border-radius: 999px;
          background: #2563EB;
        }
        .app-sidebar-link-icon {
          width: 16px;
          height: 16px;
          flex: 0 0 auto;
          opacity: 0.9;
        }
        .app-sidebar-main-actions {
          margin-top: 4px;
          padding-top: 4px;
          flex: 0 0 auto;
        }
        .app-sidebar-footer {
          margin-top: auto;
          border-top: 1px solid #EAF1FA;
          padding-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          flex: 0 0 auto;
        }
        .app-sidebar-user-card {
          border: 1px solid #DDE7F2;
          background: #FFFFFF;
          border-radius: 12px;
          padding: 8px 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          text-align: left;
        }
        .app-sidebar-user-avatar {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          background: #EEF5FF;
          border: 1px solid #BFD6FF;
          color: #2563EB;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          flex: 0 0 auto;
        }
        .app-sidebar-user-copy {
          display: block;
        }
        .app-sidebar-user-chevron {
          display: inline-flex;
        }
        .app-shell-main {
          min-width: 0;
          flex: 1 1 auto;
        }
        .app-shell-layout.sidebar-collapsed .app-sidebar {
          width: 72px;
          flex-basis: 72px;
          padding: 18px 10px 14px;
        }
        .app-shell-layout.sidebar-collapsed .app-sidebar-brand {
          padding: 0 0 12px;
        }
        .app-shell-layout.sidebar-collapsed .app-sidebar-brand-main {
          justify-content: center;
        }
        .app-shell-layout.sidebar-collapsed .app-sidebar-toggle-row {
          display: flex;
          justify-content: center;
          margin-top: 8px;
        }
        .app-shell-layout.sidebar-collapsed .app-sidebar-brand-row {
          justify-content: center;
        }
        .app-shell-layout.sidebar-collapsed .app-sidebar-brand-name,
        .app-shell-layout.sidebar-collapsed .app-sidebar-brand-subtitle,
        .app-shell-layout.sidebar-collapsed .app-sidebar-link-label,
        .app-shell-layout.sidebar-collapsed .app-sidebar-user-copy,
        .app-shell-layout.sidebar-collapsed .app-sidebar-user-chevron {
          display: none;
        }
        .app-shell-layout.sidebar-collapsed .app-sidebar-link {
          justify-content: center;
          padding: 0;
        }
        .app-shell-layout.sidebar-collapsed .app-sidebar-link.active::before {
          left: 5px;
        }
        .app-shell-layout.sidebar-collapsed .app-sidebar-main-actions {
          margin-top: 0;
          padding-top: 0;
        }
        .app-shell-layout.sidebar-collapsed .app-sidebar-user-card {
          justify-content: center;
          padding: 6px 0;
          min-height: 42px;
        }
        .app-shell-layout.sidebar-collapsed .app-sidebar-footer .app-sidebar-link {
          padding-left: 0;
          justify-content: center;
        }
        .app-mobile-topbar {
          display: none;
        }
        .app-sidebar-overlay {
          display: none;
        }
        .home-shell {
          max-width: none;
          margin: 0;
          padding: 24px 24px 30px;
        }
        .home-two-col {
          max-width: 1472px;
          margin: 0 auto;
        }
        .home-two-col.mindset-full {
          grid-template-columns: minmax(0, 1fr);
        }
        .mindset-main-pane {
          grid-column: 1 / -1;
          width: 100%;
          max-width: 100%;
          margin-right: auto;
        }
        .home-right-sticky {
          top: 24px;
        }
        @media (max-width: 1100px) {
          .app-sidebar {
            position: fixed;
            left: 0;
            top: 0;
            transform: translateX(-104%);
            transition: transform 0.22s ease;
            box-shadow: 0 20px 40px rgba(15, 23, 42, 0.2);
            width: 240px;
            flex-basis: 240px;
            padding: 22px 16px 16px;
          }
          .app-shell-layout.sidebar-collapsed .app-sidebar {
            width: 240px;
            flex-basis: 240px;
            padding: 22px 16px 16px;
          }
          .app-shell-layout.sidebar-collapsed .app-sidebar-brand-main {
            justify-content: flex-start;
          }
          .app-shell-layout.sidebar-collapsed .app-sidebar-toggle-row {
            display: flex;
            justify-content: center;
          }
          .app-shell-layout.sidebar-collapsed .app-sidebar-brand-name {
            display: block;
          }
          .app-shell-layout.sidebar-collapsed .app-sidebar-brand-subtitle {
            display: block;
          }
          .app-shell-layout.sidebar-collapsed .app-sidebar-link-label {
            display: inline;
          }
          .app-shell-layout.sidebar-collapsed .app-sidebar-user-copy {
            display: block;
          }
          .app-shell-layout.sidebar-collapsed .app-sidebar-user-chevron {
            display: inline-flex;
          }
          .app-shell-layout.sidebar-collapsed .app-sidebar-link {
            justify-content: flex-start;
            padding: 0 10px 0 14px;
          }
          .app-shell-layout.sidebar-collapsed .app-sidebar-footer .app-sidebar-link {
            padding-left: 8px;
          }
          .app-shell-layout.sidebar-collapsed .app-sidebar-user-card {
            justify-content: flex-start;
            padding: 8px 10px;
            min-height: 0;
          }
          .app-shell-layout.sidebar-open .app-sidebar {
            transform: translateX(0);
          }
          .app-sidebar-overlay {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.25);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease;
            z-index: 30;
          }
          .app-shell-layout.sidebar-open .app-sidebar-overlay {
            opacity: 1;
            pointer-events: auto;
          }
          .app-mobile-topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 12px 14px;
            border-bottom: 1px solid #DDE7F2;
            background: #FFFFFF;
            position: sticky;
            top: 0;
            z-index: 20;
          }
          .home-shell {
            padding-top: 18px;
          }
        }
        @media (max-width: 760px) {
          .home-shell {
            padding: 16px 12px 24px;
          }
        }
        .app-sidebar-footer .app-sidebar-link {
          min-height: 30px;
          font-size: 13px;
          color: #475569;
          padding-left: 8px;
          font-weight: 600;
        }
        .app-sidebar-footer .app-sidebar-link.active::before {
          display: none;
        }
      `}</style>
      <style>{`
        .mindset-shell-card {
          background: #FFFFFF;
          border: 1px solid #DDE7F2;
          border-radius: 22px;
          box-shadow: 0 10px 26px rgba(15, 23, 42, 0.05);
          padding: 32px;
          font-family: ${ONE_TRADE_UI_FONT_STACK};
          container-type: inline-size;
        }
        .mindset-main-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 34px;
          font-weight: 600;
          line-height: 1;
          color: #0F172A;
        }
        .mindset-header-row {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0;
          margin-bottom: 18px;
        }
        .mindset-main-subtitle {
          margin-top: 8px;
          margin-bottom: 14px;
          font-size: 12px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #64748B;
          font-weight: 600;
        }
        .mindset-toggle-btn {
          display: inline-flex;
          width: auto;
          flex: 0 0 auto;
          align-items: center;
          gap: 8px;
          border-radius: 999px;
          padding: 8px 14px;
          min-height: 36px;
          border: 1px solid #BFDBFE;
          background: #F8FBFF;
          color: #2563EB;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        .mindset-summary-panel {
          margin-top: 0;
          border: 1px solid;
          border-radius: 18px;
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.04);
          padding: 14px 16px;
        }
        .mindset-summary-panel.summary-only {
          padding: 18px;
        }
        .mindset-summary-compact {
          min-height: 126px;
          display: grid;
          grid-template-columns: auto 1px minmax(0, 1fr) auto;
          align-items: center;
          gap: 14px;
        }
        .readiness-summary-card {
          min-height: 86px;
          display: flex;
          align-items: center;
          gap: 18px;
        }
        .mindset-summary-panel.summary-only .mindset-score-ring {
          width: 82px;
          height: 82px;
        }
        .mindset-summary-panel.summary-only .mindset-score-ring-inner {
          width: 66px;
          height: 66px;
        }
        .mindset-summary-panel.summary-only .mindset-inline-score {
          font-size: 22px;
        }
        .mindset-summary-panel.summary-only .mindset-readiness-title-row {
          margin-bottom: 6px;
        }
        .mindset-summary-panel.summary-only .mindset-readiness-desc {
          margin-top: 0;
          margin-bottom: 8px;
          line-height: 1.38;
          max-width: 360px;
        }
        .mindset-score-ring {
          width: 82px;
          height: 82px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
        }
        .mindset-score-ring-inner {
          width: 66px;
          height: 66px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.94);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.05);
        }
        .mindset-inline-score {
          font-size: 22px;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
        }
        .mindset-readiness-divider {
          width: 1px;
          height: 74px;
          align-self: center;
          background: #D6E2EF;
          flex: 0 0 auto;
        }
        .mindset-readiness-main {
          min-width: 0;
          flex: 1;
        }
        .mindset-readiness-title-row {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .mindset-readiness-status-icon {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
        }
        .mindset-readiness-copy {
          min-width: 0;
          flex: 1;
        }
        .mindset-readiness-title {
          font-size: 20px;
          font-weight: 700;
          color: #0F172A;
          line-height: 1.2;
        }
        .mindset-readiness-desc {
          margin-top: 8px;
          font-size: 13px;
          color: #334155;
          line-height: 1.4;
          max-width: 420px;
        }
        .mindset-summary-actions-wrap {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
        }
        .mindset-action-row {
          margin-top: 0;
          display: flex;
          flex-direction: row;
          align-items: center;
          flex-wrap: nowrap;
          gap: 8px;
        }
        .mindset-btn-primary,
        .mindset-btn-recommend {
          border-radius: 999px;
          min-height: 36px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .mindset-btn-secondary {
          border-radius: 999px;
          min-height: 36px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 1px solid #D4DEEB;
          background: #FFFFFF;
          color: #64748B;
          transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
        }
        .mindset-btn-primary {
          border: 1px solid #2563EB;
          background: linear-gradient(135deg, #2E6BFF, #1D4ED8);
          color: #FFFFFF;
          transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
        }
        .mindset-btn-secondary:not(:disabled):hover {
          background: #F8FAFC;
          border-color: #CBD5E1;
          color: #475569;
        }
        .mindset-btn-primary:not(:disabled):hover {
          background: #1D4ED8;
          border-color: #1D4ED8;
        }
        .mindset-btn-recommend {
          border: 1px solid #FCA5A5;
          background: #FEF2F2;
          color: #B91C1C;
          flex: 1 1 100%;
        }
        .mindset-date-divider {
          margin-top: 0;
          border-top: 1px solid #DDE7F2;
        }
        .mindset-date-row {
          margin-top: 0;
          font-size: 12px;
          color: #64748B;
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 500;
          line-height: 1.35;
        }
        .mindset-date-label {
          color: #94A3B8;
          font-weight: 500;
        }
        .mindset-date-value {
          color: #475569;
          font-weight: 600;
        }
        .mindset-warnings {
          margin-top: 12px;
          border: 1px solid #DDE7F2;
          border-radius: 14px;
          background: #F9FBFF;
          padding: 11px 12px;
          font-size: 12px;
          color: #475569;
          line-height: 1.6;
        }
        .mindset-section-card {
          margin-top: 16px;
          background: transparent;
          border: none;
          border-radius: 0;
          box-shadow: none;
          padding: 0;
          overflow: visible;
        }
        .mindset-section-card + .mindset-section-card {
          border-top: 1px solid #E2E8F0;
          margin-top: 20px;
          padding-top: 20px;
        }
        .mindset-section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 52px;
          padding: 6px 2px 10px;
          border-radius: 0;
        }
        .mindset-section-icon {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          background: #EEF5FF;
          color: #2563EB;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .mindset-section-title {
          font-size: 15px;
          font-weight: 700;
          color: #0F172A;
          line-height: 1.2;
        }
        .mindset-section-summary {
          font-size: 13px;
          color: #64748B;
          font-weight: 700;
          white-space: nowrap;
        }
        .mindset-fields-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 6px;
          padding: 0 0 6px;
          align-items: start;
          overflow: visible;
        }
        .mindset-field-card {
          border: 1px solid #EEF3F9;
          border-left: 2px solid var(--mindset-field-accent, transparent);
          border-radius: 8px;
          padding: 8px 9px;
          background: transparent;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          min-height: 40px;
          align-self: start;
          overflow: visible;
          z-index: 1;
        }
        .mindset-field-card.expanded {
          z-index: 70;
          border-color: #D5E2F3;
          background: #FFFFFF;
        }
        .mindset-field-card.is-interactive:hover {
          background: #F8FAFC;
          border-color: #DDE7F2;
        }
        .mindset-field-card:focus-within {
          background: #F8FAFC;
          border-color: #BFD4EE;
          box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.15);
        }
        .mindset-field-icon {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          background: var(--mindset-field-icon-bg, #EEF5FF);
          color: var(--mindset-field-icon-color, #2563EB);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          margin-top: 1px;
        }
        .mindset-field-main {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .mindset-field-label {
          font-size: 13px;
          color: #0F172A;
          font-weight: 600;
          flex: 1;
          min-width: 0;
        }
        .mindset-field-value {
          min-width: 0;
          flex: 0 1 auto;
          color: #334155;
        }
        .mindset-inline-options {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 6px;
        }
        .mindset-inline-option {
          border: 1px solid #E3EBF5;
          background: #FFFFFF;
          color: #64748B;
          border-radius: 999px;
          padding: 3px 8px;
          font-size: 11px;
          font-weight: 500;
          line-height: 1.2;
          cursor: pointer;
          transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
        }
        .mindset-inline-option:hover {
          border-color: #BFDBFE;
          background: #EFF6FF;
          color: #2563EB;
        }
        .mindset-inline-option.selected {
          border-color: #2563EB;
          background: #F2F7FF;
          color: #1D4ED8;
          font-weight: 600;
        }
        .mindset-range-wrap {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-width: 210px;
          justify-content: flex-end;
        }
        .mindset-range-slider {
          width: 130px;
          accent-color: #2563EB;
          cursor: pointer;
          opacity: 0.9;
          transition: opacity 150ms ease, filter 150ms ease;
        }
        .mindset-range-slider:hover {
          opacity: 1;
          filter: saturate(1.05);
        }
        .mindset-range-slider:focus-visible {
          opacity: 1;
          filter: saturate(1.08);
          outline: none;
        }
        .mindset-field-card input.mindset-range-slider {
          width: 130px !important;
          text-align: left;
        }
        .mindset-range-value {
          font-size: 12px;
          font-weight: 700;
          color: #334155;
          min-width: 44px;
          text-align: right;
        }
        .mindset-field-card input,
        .mindset-field-card select {
          width: auto;
          background: transparent !important;
          border: none !important;
          border-radius: 0 !important;
          padding: 0 !important;
          color: #0F172A !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          line-height: 1.2 !important;
          outline: none !important;
          box-shadow: none !important;
          text-align: right;
        }
        .mindset-field-card select {
          appearance: none;
          cursor: pointer;
          max-width: 220px;
          text-overflow: ellipsis;
        }
        .mindset-field-helper {
          margin-top: 4px;
          font-size: 11px;
          color: #64748B;
        }
        .mindset-field-overlay {
          position: absolute;
          left: 0;
          right: 0;
          top: calc(100% + 6px);
          z-index: 90;
          border: 1px solid #DDE7F2;
          border-radius: 10px;
          background: #FFFFFF;
          box-shadow: 0 12px 22px rgba(15, 23, 42, 0.12);
          padding: 8px;
        }
        .mindset-choice-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .mindset-choice-chip {
          border: 1px solid #E3EBF5;
          background: #FFFFFF;
          color: #64748B;
          border-radius: 999px;
          padding: 5px 9px;
          font-size: 11px;
          font-weight: 500;
          line-height: 1.2;
          cursor: pointer;
          transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
        }
        .mindset-choice-chip:hover {
          border-color: #BFDBFE;
          background: #EFF6FF;
          color: #2563EB;
        }
        .mindset-choice-chip.selected {
          border-color: #2563EB;
          background: #F2F7FF;
          color: #1D4ED8;
          font-weight: 600;
        }
        .mindset-footer-row {
          margin-top: 0;
          padding-top: 0;
          border-top: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .mindset-footer-status {
          color: #64748B;
          font-size: 12px;
          font-weight: 600;
        }
        .mindset-footer-actions {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          margin-left: auto;
        }
        .clean-day-page-card {
          background: #FFFFFF;
          border: 1px solid #DDE7F2;
          border-radius: 24px;
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.06);
          padding: 28px 30px;
        }
        .clean-day-main-wrap {
          width: 100%;
          max-width: 1080px;
          margin: 0 auto;
        }
        .clean-day-section {
          margin-top: 16px;
          border: 1px solid #E2E8F0;
          border-radius: 14px;
          background: #FFFFFF;
          padding: 14px 15px;
        }
        .clean-day-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .clean-day-section-title {
          font-size: 14px;
          font-weight: 700;
          color: #0F172A;
        }
        .clean-day-streak {
          font-size: 12px;
          font-weight: 600;
          color: #64748B;
        }
        .clean-day-progress-row {
          margin-top: 10px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .clean-day-progress-item {
          border: 1px solid #DDE7F2;
          background: #F8FAFC;
          color: #334155;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 700;
        }
        .clean-day-status-row {
          margin-top: 10px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .clean-day-status-pill {
          border: 1px solid #DDE7F2;
          background: #FFFFFF;
          color: #334155;
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
        }
        .clean-day-status-pill:hover {
          background: #F8FAFC;
          border-color: #CBD5E1;
        }
        .clean-day-current-status {
          margin-top: 8px;
          font-size: 12px;
          font-weight: 700;
        }
        .clean-day-sleep-grid {
          margin-top: 8px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .clean-day-label {
          font-size: 11px;
          color: #64748B;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .clean-day-time-input {
          width: 100%;
          margin-top: 6px;
          border: 1px solid #DDE7F2;
          border-radius: 10px;
          padding: 8px 10px;
          color: #0F172A;
          background: #FFFFFF;
          font-size: 13px;
        }
        .clean-day-chip-row {
          margin-top: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }
        .clean-day-chip {
          border: 1px solid #DDE7F2;
          background: #FFFFFF;
          color: #475569;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
        }
        .clean-day-chip:hover {
          background: #EFF6FF;
          border-color: #BFDBFE;
          color: #2563EB;
        }
        .clean-day-chip.selected {
          background: #EFF6FF;
          border-color: #2563EB;
          color: #1D4ED8;
        }
        .clean-day-chip.current {
          border-color: #93C5FD;
          box-shadow: 0 0 0 1px rgba(147, 197, 253, 0.45);
        }
        .clean-day-checklist {
          margin-top: 10px;
          display: grid;
          gap: 8px;
        }
        .clean-day-checklist-row {
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid #E2E8F0;
          border-radius: 10px;
          background: #FFFFFF;
          padding: 8px 10px;
          font-size: 13px;
          color: #334155;
          font-weight: 600;
        }
        .clean-day-checklist-row input {
          width: 15px;
          height: 15px;
          accent-color: #2563EB;
        }
        .clean-day-inline-actions {
          margin-top: 10px;
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .clean-day-inline-note {
          font-size: 12px;
          color: #64748B;
          font-weight: 500;
        }
        .clean-day-time-prompt {
          margin-top: 10px;
          font-size: 12px;
          color: #334155;
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 10px;
          padding: 8px 10px;
          font-weight: 600;
        }
        .clean-day-textarea {
          width: 100%;
          margin-top: 8px;
          border: 1px solid #DDE7F2;
          border-radius: 10px;
          background: #FFFFFF;
          color: #0F172A;
          padding: 10px 12px;
          font-size: 13px;
          line-height: 1.45;
          resize: vertical;
          min-height: 84px;
          font-family: inherit;
        }
        .clean-day-footer-row {
          margin-top: 16px;
          padding-top: 0;
        }
        .clean-day-date-hint {
          margin-top: 8px;
          font-size: 12px;
          color: #94A3B8;
          font-weight: 500;
        }
        @container (min-width: 820px) {
          .mindset-fields-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @container (max-width: 720px) {
          .mindset-main-title {
            font-size: 28px;
          }
          .mindset-summary-panel {
            padding: 12px;
          }
          .mindset-summary-compact {
            min-height: 0;
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .mindset-score-ring { width: 97px; height: 97px; font-size: 30px; }
          .mindset-score-ring-inner { width: 86px; height: 86px; }
          .mindset-inline-score { font-size: inherit; }
          .mindset-summary-panel.summary-only .mindset-score-ring {
            width: 82px;
            height: 82px;
          }
          .mindset-summary-panel.summary-only .mindset-score-ring-inner {
            width: 66px;
            height: 66px;
          }
          .mindset-summary-panel.summary-only .mindset-inline-score {
            font-size: 22px;
          }
          .mindset-readiness-title {
            font-size: 18px;
          }
          .mindset-readiness-desc {
            font-size: 13px;
          }
          .mindset-readiness-divider { display: none; }
          .mindset-summary-actions-wrap {
            align-items: flex-start;
            width: 100%;
          }
          .mindset-action-row {
            width: 100%;
            flex-direction: row;
            flex-wrap: wrap;
          }
          .mindset-action-row > .mindset-btn-primary,
          .mindset-action-row > .mindset-btn-secondary {
            flex: 1 1 0;
          }
          .mindset-footer-row {
            align-items: flex-start;
          }
          .mindset-footer-actions {
            width: 100%;
            justify-content: flex-end;
            flex-wrap: wrap;
          }
          .clean-day-sleep-grid {
            grid-template-columns: 1fr;
          }
          .mindset-range-wrap {
            min-width: 160px;
          }
          .mindset-range-slider {
            width: 94px;
          }
        }
        @container (max-width: 420px) {
          .readiness-summary-card {
            min-height: 0;
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
          }
        }
        @container (max-width: 360px) {
          .mindset-action-row {
            flex-direction: column;
            align-items: stretch;
          }
          .mindset-action-row > .mindset-btn-primary,
          .mindset-action-row > .mindset-btn-secondary,
          .mindset-action-row > .mindset-btn-recommend {
            width: 100%;
            flex: 1 1 auto;
          }
        }
        @container (max-width: 400px) {
          .mindset-inline-score { font-size: 32px; }
        }
        @media (max-width: 760px) {
          .mindset-shell-card {
            padding: 20px 16px;
          }
        }
      `}</style>
      <div
        className={`app-shell-layout${sidebarDrawerOpen ? " sidebar-open" : ""}${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
      >
        <div className="app-sidebar-overlay" onClick={closeSidebarDrawer} />
        <aside className="app-sidebar" aria-label="Primary">
          <div className="app-sidebar-brand">
            <div className="app-sidebar-brand-row">
              <div className="app-sidebar-brand-main">
                <OneTradeLogoMark />
                <div>
                  <div className="app-sidebar-brand-name">OneTrade OS</div>
                  <div className="app-sidebar-brand-subtitle">Discipline Dashboard</div>
                </div>
              </div>
              {!sidebarCollapsed ? (
                <button
                  type="button"
                  className="app-sidebar-collapse-toggle"
                  onClick={() => setSidebarCollapsed((prev) => !prev)}
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                >
                  <ChevronsLeft size={13} strokeWidth={2.3} />
                </button>
              ) : null}
            </div>
            <div className="app-sidebar-toggle-row">
              {sidebarCollapsed ? (
                <button
                  type="button"
                  className="app-sidebar-collapse-toggle"
                  onClick={() => setSidebarCollapsed((prev) => !prev)}
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                >
                  <ChevronsRight size={13} strokeWidth={2.3} />
                </button>
              ) : null}
            </div>
          </div>
          <div className="app-sidebar-nav">
            <button
              type="button"
              className={`app-sidebar-link${sidebarActiveItem === "dashboard" ? " active" : ""}`}
              onClick={openDashboardFromSidebar}
              title={sidebarCollapsed ? "Dashboard" : ""}
            >
              <LayoutGrid className="app-sidebar-link-icon" strokeWidth={2.1} />
              <span className="app-sidebar-link-label">Dashboard</span>
            </button>
            <button
              type="button"
              className={`app-sidebar-link${sidebarActiveItem === "one-trade-rule" ? " active" : ""}`}
              onClick={openOneTradeRuleFromSidebar}
              title={sidebarCollapsed ? "One Trade Rule" : ""}
            >
              <Target className="app-sidebar-link-icon" strokeWidth={2.1} />
              <span className="app-sidebar-link-label">One Trade Rule</span>
            </button>
            <button
              type="button"
              className={`app-sidebar-link${sidebarActiveItem === "trading-journal" ? " active" : ""}`}
              onClick={openTradingJournalFromSidebar}
              title={sidebarCollapsed ? "Trading Journal" : ""}
            >
              <ListChecks className="app-sidebar-link-icon" strokeWidth={2.1} />
              <span className="app-sidebar-link-label">Trading Journal</span>
            </button>
            <button
              type="button"
              className={`app-sidebar-link${sidebarActiveItem === "mindset-check" ? " active" : ""}`}
              onClick={openMindsetCheckFromSidebar}
              title={sidebarCollapsed ? "Mindset Check" : ""}
            >
              <ShieldCheck className="app-sidebar-link-icon" strokeWidth={2.1} />
              <span className="app-sidebar-link-label">Mindset Check</span>
            </button>
            <button
              type="button"
              className={`app-sidebar-link${sidebarActiveItem === "clean-day" ? " active" : ""}`}
              onClick={openCleanDayFromSidebar}
              title={sidebarCollapsed ? "Clean Day" : ""}
            >
              <Flame className="app-sidebar-link-icon" strokeWidth={2.1} />
              <span className="app-sidebar-link-label">Clean Day</span>
            </button>
            <button
              type="button"
              className={`app-sidebar-link${sidebarActiveItem === "mt5-sync" ? " active" : ""}`}
              onClick={openMt5AutoSyncFromSidebar}
              title={sidebarCollapsed ? "MT5 Auto Sync" : ""}
            >
              <Monitor className="app-sidebar-link-icon" strokeWidth={2.1} />
              <span className="app-sidebar-link-label">MT5 Auto Sync</span>
            </button>
            <button
              type="button"
              className={`app-sidebar-link${sidebarActiveItem === "settings" ? " active" : ""}`}
              onClick={openSettingsFromSidebar}
              title={sidebarCollapsed ? "Settings" : ""}
            >
              <Settings className="app-sidebar-link-icon" strokeWidth={2.1} />
              <span className="app-sidebar-link-label">Settings</span>
            </button>
          </div>
          <div className="app-sidebar-footer">
            <button
              type="button"
              className="app-sidebar-link"
              title={sidebarCollapsed ? "Sync" : cloudStatus || "Sync local data to cloud"}
              onClick={() => pushCloudJournal({ silent: false })}
              disabled={cloudBusy}
              style={{ opacity: cloudBusy ? 0.6 : 1, cursor: cloudBusy ? "not-allowed" : "pointer" }}
            >
              <RefreshCw className="app-sidebar-link-icon" strokeWidth={2.1} />
              <span className="app-sidebar-link-label">{cloudBusy ? "Syncing..." : "Sync"}</span>
            </button>
            <button
              type="button"
              className="app-sidebar-user-card"
              onClick={() => {
                closeSidebarDrawer();
                openAccountPage();
              }}
              title={sidebarDisplayName}
            >
              <span className="app-sidebar-user-avatar">
                {showSidebarAvatarImage ? (
                  <img
                    src={sidebarAvatarUrl}
                    alt={sidebarDisplayName}
                    onError={() => setSidebarAvatarFailed(true)}
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 999,
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  sidebarUserInitials
                )}
              </span>
              <span className="app-sidebar-user-copy" style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {sidebarDisplayName}
                </span>
                <span style={{ display: "block", marginTop: 2, fontSize: 12, fontWeight: 600, color: "#64748B" }}>
                  Discipline Mode
                </span>
              </span>
              <ChevronDown className="app-sidebar-user-chevron" size={15} strokeWidth={2.15} color="#64748B" aria-hidden="true" />
            </button>
            {isSupabaseConfigured && supabaseSession ? (
              <button
                type="button"
                className="app-sidebar-link"
                title={sidebarCollapsed ? "Sign Out" : cloudStatus || "Sign out from cloud session"}
                onClick={signOutCloud}
                disabled={cloudBusy}
                style={{ opacity: cloudBusy ? 0.6 : 1, cursor: cloudBusy ? "not-allowed" : "pointer" }}
              >
                <Shield className="app-sidebar-link-icon" strokeWidth={2.1} />
                <span className="app-sidebar-link-label">Sign Out</span>
              </button>
            ) : null}
          </div>
        </aside>

        <div className="app-shell-main">
          <div className="app-mobile-topbar">
            <button
              type="button"
              onClick={() => setSidebarDrawerOpen((prev) => !prev)}
              style={{
                border: "1px solid #DDE7F2",
                background: "#FFFFFF",
                color: G.textSub,
                borderRadius: 10,
                padding: "7px 10px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
              aria-label={sidebarDrawerOpen ? "Close menu" : "Open menu"}
            >
              {sidebarDrawerOpen ? "Close" : "Menu"}
            </button>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 27, color: G.goldLight, fontWeight: 700, lineHeight: 1 }}>
              OneTrade OS
            </div>
            <div style={{ width: 46 }} />
          </div>
          <div className="home-shell">
          <div className={`home-two-col${isMindsetCheckPage || isCleanDayPage || isSettingsPage || isTradingJournalPage ? " mindset-full" : ""}`}>
          {isMindsetCheckPage ? (
            <div>
              <MindsetReadinessPage
                isMindsetCheckPage
                headerTitle="Pre-Trade Permission Check"
                headerSubtitle="Complete your readiness checklist before taking one planned trade."
                showSummaryCard={false}
                homeReadinessTheme={homeReadinessTheme}
                homeReadinessRingDegrees={homeReadinessRingDegrees}
                readinessScoreDisplay={readinessScoreDisplay}
                homeReadinessStatusIcon={HomeReadinessStatusIcon}
                readinessBusy={readinessBusy}
                saveTodayReadiness={saveTodayReadiness}
                resetTodayReadinessForm={resetTodayReadinessForm}
                todayLocalDate={todayLocalDate}
                todayReadiness={todayReadiness}
                mindsetFooterEvent={mindsetFooterEvent}
                readinessForm={readinessForm}
                setReadinessField={setReadinessField}
              />
            </div>
          ) : null}
          {isCleanDayPage ? (
            <div className="clean-day-main-wrap">
              <CleanDayPage
                todayLocalDate={todayLocalDate}
                nowMs={disciplineNowMs}
                cleanDayForm={cleanDayForm}
                cleanDayActiveChallenge={cleanDayActiveChallenge}
                cleanDayTargetDays={cleanDayTargetDays}
                cleanDayActiveDayNumber={cleanDayActiveDayNumber}
                cleanDayChallengeProgress={cleanDayChallengeProgress}
                cleanDayChallengeDays={cleanDayChallengeDays}
                cleanDayChallengeHistory={cleanDayChallengeHistory}
                cleanDayChallengeBusy={cleanDayChallengeBusy}
                cleanDayBusy={cleanDayBusy}
                cleanDayFooterStatus={cleanDayFooterStatus}
                setCleanDayField={setCleanDayField}
                setCleanDayAdaptiveResponse={setCleanDayAdaptiveResponse}
                markCleanDayHourlyCheckin={markCleanDayHourlyCheckin}
                startCleanDayChallenge={startCleanDayChallenge}
                saveCleanDayEntry={saveCleanDayEntry}
              />
            </div>
          ) : null}
          {isSettingsPage ? (
            <div className="mindset-main-pane">
              <AccountPage
                session={supabaseSession}
                embedded
                initialSection={settingsPageSection}
              />
            </div>
          ) : null}
          {isTradingJournalPage ? (
            <div className="mindset-main-pane" style={{ width: "100%", maxWidth: APP_PAGE_WIDTH }}>
              {selectedProject ? (
                <Section num="3" title="Trading Journal" color={G.purple}>
                  {selectedProject.trades.length > 0 && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                        gap: 12,
                        marginBottom: 20,
                      }}
                    >
                      <MetricCard label="Trades" value={selectedProject.trades.length} color={G.gold} />
                      <MetricCard label="TP Hit" value={selectedProject.trades.filter((trade) => trade.outcome === "TP").length} color={G.win} />
                      <MetricCard label="SL Hit" value={selectedProject.trades.filter((trade) => trade.outcome === "SL").length} color={G.loss} />
                      <MetricCard
                        label="Total PnL"
                        value={fmtMoney(selectedProject.trades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0), true)}
                        color={selectedProject.trades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0) >= 0 ? G.win : G.loss}
                      />
                      <MetricCard
                        label="Avg Rating"
                        value={
                          (() => {
                            const ratedTrades = selectedProject.trades.filter((trade) => Number(trade.rating));
                            if (!ratedTrades.length) return "--";
                            const avg = ratedTrades.reduce((sum, trade) => sum + Number(trade.rating || 0), 0) / ratedTrades.length;
                            return `${avg.toFixed(1)}/5`;
                          })()
                        }
                        color={G.gold}
                      />
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
                    <FInput
                      placeholder="Search pair, setup, plan..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      style={{ maxWidth: 280 }}
                    />
                    {["ALL", "BUY", "SELL"].map((direction) => (
                      <button
                        key={direction}
                        type="button"
                        onClick={() => setFilterDir(direction)}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 8,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                          transition: "all 0.15s",
                          background: filterDir === direction ? G.goldGlow2 : "transparent",
                          border: `1px solid ${filterDir === direction ? G.gold : G.border}`,
                          color: filterDir === direction ? G.goldLight : G.textMuted,
                        }}
                      >
                        {direction}
                      </button>
                    ))}
                    <div style={{ marginLeft: "auto", fontSize: 13, color: G.textMuted }}>
                      {filteredTrades.length} trade{filteredTrades.length !== 1 ? "s" : ""}
                    </div>
                  </div>

                  {filteredTrades.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "72px 20px", color: G.textMuted }}>
                      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: G.text, marginBottom: 10 }}>
                        {selectedProject.trades.length === 0 ? "No trades yet" : "No results"}
                      </div>
                      <div style={{ fontSize: 14, marginBottom: 26 }}>
                        {selectedProject.trades.length === 0
                          ? "Start logging trades inside this project."
                          : "Change the search text or direction filter."}
                      </div>
                      {selectedProject.trades.length === 0 && (
                        <button
                          type="button"
                          onClick={openTradeNew}
                          style={{
                            background: `linear-gradient(135deg, ${G.gold}, ${G.goldDim})`,
                            border: "none",
                            color: "#ffffff",
                            padding: "12px 28px",
                            borderRadius: 10,
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 800,
                          }}
                        >
                          Log First Trade
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {filteredTrades.map((trade) => (
                        <TradeCard
                          key={trade.id}
                          trade={trade}
                          tradeNo={selectedProjectTradeNumberById[trade.id]}
                          onClick={() => openTradeView(trade.id)}
                        />
                      ))}
                    </div>
                  )}
                </Section>
              ) : (
                <div
                  style={{
                    background: usePremiumOneTradeTheme ? "#FFFFFF" : G.bgCard,
                    border: usePremiumOneTradeTheme ? "1px solid #DDE7F2" : `1px solid ${G.border}`,
                    borderRadius: 16,
                    padding: "18px 20px",
                    color: G.textMuted,
                    fontSize: 14,
                  }}
                >
                  No project selected yet. Open a project with trades, then come back to Trading Journal.
                </div>
              )}
            </div>
          ) : null}
          <div style={{ display: isMindsetCheckPage || isCleanDayPage || isSettingsPage || isTradingJournalPage ? "none" : "block" }}>
            <div className="home-projects-grid">
                <div
                  className="one-trade-main-card"
                  ref={oneTradeSectionRef}
                  style={{
                    gridColumn: "1 / -1",
                    background: usePremiumOneTradeTheme ? "#FFFFFF" : G.bgCard,
                    border: usePremiumOneTradeTheme ? "1px solid #DDE7F2" : `1px solid ${G.border}`,
                    borderRadius: usePremiumOneTradeTheme ? 24 : 18,
                    boxShadow: usePremiumOneTradeTheme ? "0 16px 40px rgba(15, 23, 42, 0.06)" : "none",
                    padding: usePremiumOneTradeTheme ? 32 : "20px 22px",
                    fontFamily: ONE_TRADE_UI_FONT_STACK,
                  }}
                >
                  <div
                    className="one-trade-header"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: usePremiumOneTradeTheme ? 16 : 14,
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "'Cormorant Garamond', serif",
                          fontSize: usePremiumOneTradeTheme ? 32 : 28,
                          fontWeight: 400,
                          color: usePremiumOneTradeTheme ? G.text : G.goldLight,
                          lineHeight: 1,
                        }}
                      >
                        One Trade Rule
                      </div>
                      <div
                        style={{
                          marginTop: usePremiumOneTradeTheme ? 8 : 6,
                          fontSize: usePremiumOneTradeTheme ? 12 : 11,
                          color: G.textMuted,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                        }}
                      >
                        ONE TRADE. ONE DECISION. NO REVENGE.
                      </div>
                      {focusCurrentDisciplineChallenge ? (
                        <div
                          style={{
                            marginTop: usePremiumOneTradeTheme ? 10 : 6,
                            fontSize: usePremiumOneTradeTheme ? 14 : 13,
                            color: G.textSub,
                            fontWeight: 600,
                            lineHeight: 1.25,
                          }}
                        >
                          {focusChallengeContextLine}
                        </div>
                      ) : (
                        <div
                          style={{
                            marginTop: usePremiumOneTradeTheme ? 10 : 6,
                            fontSize: usePremiumOneTradeTheme ? 14 : 13,
                            color: G.textSub,
                            fontWeight: 600,
                            lineHeight: 1.25,
                          }}
                        >
                          No active challenge yet
                        </div>
                      )}
                    </div>
                    <div
                      className="one-trade-countdown-card"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: usePremiumOneTradeTheme ? 10 : 8,
                        background: usePremiumOneTradeTheme ? "rgba(239, 246, 255, 0.4)" : G.bgCard2,
                        border: usePremiumOneTradeTheme ? "1px solid #DBEAFE" : `1px solid ${G.border}`,
                        borderRadius: usePremiumOneTradeTheme ? 18 : 14,
                        padding: usePremiumOneTradeTheme ? "14px 18px" : "10px 14px",
                        minWidth: usePremiumOneTradeTheme ? 290 : 210,
                        maxWidth: "100%",
                        boxShadow: usePremiumOneTradeTheme ? "0 8px 20px rgba(37, 99, 235, 0.08)" : "none",
                      }}
                      >
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        {usePremiumOneTradeTheme ? (
                          <DisciplineShieldIcon />
                        ) : null}
                        <div
                          style={{
                            fontFamily: ONE_TRADE_UI_FONT_STACK,
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                            minWidth: 0,
                          }}
                        >
                          {usePremiumOneTradeTheme ? (
                            <>
                              <div style={{ fontSize: 14, color: "#334155", fontWeight: 600 }}>
                                {focusCountdownCard.title}
                              </div>
                              <div
                                style={{
                                  marginTop: 2,
                                  fontSize: 24,
                                  color: "#0F172A",
                                  fontWeight: 700,
                                  lineHeight: 1.1,
                                }}
                              >
                                {focusCountdownCard.subtext}
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: 13, color: focusCountdownCard.color, fontWeight: 600 }}>
                              {focusCountdownCard.title} {focusCountdownCard.subtext}
                            </div>
                          )}
                        </div>
                      </div>
                      {showHeaderActionControl ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                          <button
                            type="button"
                            onClick={focusHeaderAction.onClick}
                            disabled={focusHeaderAction.disabled}
                            style={{
                              border: usePremiumOneTradeTheme ? "1px solid #DDE7F2" : "none",
                              background: usePremiumOneTradeTheme ? "#FFFFFF" : "transparent",
                              color: focusHeaderAction.disabled ? G.textMuted : G.text,
                              padding: usePremiumOneTradeTheme ? "6px 10px" : 0,
                              borderRadius: usePremiumOneTradeTheme ? 999 : 0,
                              cursor: focusHeaderAction.disabled ? "not-allowed" : "pointer",
                              opacity: focusHeaderAction.disabled ? 0.85 : 1,
                              fontFamily: ONE_TRADE_UI_FONT_STACK,
                              fontSize: 12,
                              fontWeight: 600,
                              textAlign: "left",
                            }}
                          >
                            {focusHeaderAction.buttonText}
                          </button>
                          {focusHeaderAction.helperText ? (
                            <div style={{ fontSize: 11, color: G.textMuted, lineHeight: 1.25, textAlign: "left" }}>
                              {focusHeaderAction.helperText}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <>
                    {focusCurrentDisciplineChallenge ? (
                      <div
                        style={{
                          marginTop: usePremiumOneTradeTheme ? 24 : 14,
                          background: usePremiumOneTradeTheme ? "#F9FBFF" : "transparent",
                          border: usePremiumOneTradeTheme ? "1px solid #DDE7F2" : "none",
                          borderRadius: usePremiumOneTradeTheme ? 20 : 0,
                          boxShadow: usePremiumOneTradeTheme ? "0 10px 24px rgba(15, 23, 42, 0.04)" : "none",
                          padding: usePremiumOneTradeTheme ? 24 : 0,
                        }}
                      >
                        <div
                          className="one-trade-summary-grid"
                          style={
                            usePremiumOneTradeTheme
                              ? undefined
                              : { gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }
                          }
                        >
                          <div
                            className="one-trade-summary-col"
                            style={
                              usePremiumOneTradeTheme
                                ? {
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "stretch",
                                    textAlign: "left",
                                  }
                                : {
                                    background: G.bgCard2,
                                    border: `1px solid ${G.border}`,
                                    borderLeft: "none",
                                    borderRadius: 10,
                                    padding: "8px 10px",
                                  }
                            }
                          >
                            <div
                              style={{
                                marginTop: usePremiumOneTradeTheme ? 8 : 6,
                                display: "flex",
                                alignItems: "flex-start",
                                gap: usePremiumOneTradeTheme ? 12 : 0,
                              }}
                            >
                              {usePremiumOneTradeTheme ? (
                                <div style={{ marginTop: 2 }}>
                                  <IconCircle tone="blue">
                                    <ProgressTargetIcon className="h-5 w-5 stroke-[2.2]" style={{ width: 20, height: 20, strokeWidth: 2.2 }} />
                                  </IconCircle>
                                </div>
                              ) : null}
                              <div className={usePremiumOneTradeTheme ? "one-trade-kpi-text" : ""} style={usePremiumOneTradeTheme ? undefined : { minWidth: 0, flex: 1 }}>
                                <div
                                  className={usePremiumOneTradeTheme ? "one-trade-kpi-label" : ""}
                                  style={
                                    usePremiumOneTradeTheme
                                      ? undefined
                                      : { fontSize: 13, color: G.textMuted, fontWeight: 500, marginBottom: 4 }
                                  }
                                >
                                  Progress
                                </div>
                                <div className={usePremiumOneTradeTheme ? "one-trade-kpi-value" : ""} style={usePremiumOneTradeTheme ? undefined : { fontSize: 20, color: G.goldLight, fontWeight: 700 }}>
                                  {focusChallengeProgress}
                                </div>
                                {usePremiumOneTradeTheme ? (
                                  <>
                                    <div
                                      style={{
                                        marginTop: 10,
                                        display: "grid",
                                        gridTemplateColumns: `repeat(${focusTargetDays}, minmax(0, 1fr))`,
                                        gap: 4,
                                        width: "min(220px, 100%)",
                                        maxWidth: "100%",
                                      }}
                                    >
                                      {focusProgressSegments.map((isDone, idx) => (
                                        <span
                                          key={`progress-segment-${idx + 1}`}
                                          style={{
                                            height: 7,
                                            borderRadius: 999,
                                            background: isDone ? G.gold : "#E6EDF8",
                                          }}
                                        />
                                      ))}
                                    </div>
                                    <div className="one-trade-kpi-subtext">
                                      {focusProgressPercent}% Completed
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div
                            className="one-trade-summary-col"
                            style={
                              usePremiumOneTradeTheme
                                ? {
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "stretch",
                                    textAlign: "left",
                                  }
                                : {
                                    background: focusTodayStatusCard.background,
                                    border: focusTodayStatusCard.border,
                                    borderLeft: "none",
                                    borderRadius: 10,
                                    padding: "8px 10px",
                                  }
                            }
                          >
                            <div
                              style={{
                                marginTop: usePremiumOneTradeTheme ? 8 : 6,
                                display: "flex",
                                alignItems: "flex-start",
                                gap: usePremiumOneTradeTheme ? 12 : 0,
                              }}
                            >
                              {usePremiumOneTradeTheme ? (
                                <div style={{ marginTop: 2 }}>
                                  <IconCircle tone="orange">
                                    <Hourglass className="h-5 w-5 stroke-[2.2]" style={{ width: 20, height: 20, strokeWidth: 2.2 }} />
                                  </IconCircle>
                                </div>
                              ) : null}
                              <div className={usePremiumOneTradeTheme ? "one-trade-kpi-text" : ""} style={usePremiumOneTradeTheme ? undefined : { minWidth: 0, flex: 1 }}>
                                <div
                                  className={usePremiumOneTradeTheme ? "one-trade-kpi-label" : ""}
                                  style={
                                    usePremiumOneTradeTheme
                                      ? undefined
                                      : { fontSize: 13, color: G.textMuted, fontWeight: 500, marginBottom: 4 }
                                  }
                                >
                                  Status
                                </div>
                                <div className={usePremiumOneTradeTheme ? "one-trade-kpi-value" : ""} style={usePremiumOneTradeTheme ? undefined : { fontSize: 20, color: focusTodayStatusCard.titleColor, fontWeight: 700 }}>
                                  {focusTodayStatusCard.title}
                                </div>
                                <div className={usePremiumOneTradeTheme ? "one-trade-kpi-subtext" : ""} style={usePremiumOneTradeTheme ? undefined : { marginTop: 8, fontSize: 12, color: G.textMuted, fontWeight: 500 }}>
                                  {focusTodayStatusCard.subtext}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div
                            className="one-trade-summary-col"
                            style={
                              usePremiumOneTradeTheme
                                ? {
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "stretch",
                                    textAlign: "left",
                                  }
                                : {
                                    background: G.bgCard2,
                                    border: `1px solid ${G.border}`,
                                    borderLeft: "none",
                                    borderRadius: 10,
                                    padding: "8px 10px",
                                  }
                            }
                          >
                            <div
                              style={{
                                marginTop: usePremiumOneTradeTheme ? 8 : 6,
                                display: "flex",
                                alignItems: "flex-start",
                                gap: usePremiumOneTradeTheme ? 12 : 0,
                              }}
                            >
                              {usePremiumOneTradeTheme ? (
                                <div style={{ marginTop: 2 }}>
                                  <IconCircle tone="green">
                                    <Flame className="h-5 w-5 stroke-[2.2]" style={{ width: 20, height: 20, strokeWidth: 2.2 }} />
                                  </IconCircle>
                                </div>
                              ) : null}
                              <div className={usePremiumOneTradeTheme ? "one-trade-kpi-text" : ""} style={usePremiumOneTradeTheme ? undefined : { minWidth: 0, flex: 1 }}>
                                <div
                                  className={usePremiumOneTradeTheme ? "one-trade-kpi-label" : ""}
                                  style={
                                    usePremiumOneTradeTheme
                                      ? undefined
                                      : { fontSize: 13, color: G.textMuted, fontWeight: 500, marginBottom: 4 }
                                  }
                                >
                                  Streak
                                </div>
                                <div className={usePremiumOneTradeTheme ? "one-trade-kpi-value" : ""} style={usePremiumOneTradeTheme ? undefined : { fontSize: 20, color: G.text, fontWeight: 700 }}>
                                  {focusStreakValue}
                                </div>
                                {usePremiumOneTradeTheme ? (
                                  <div className="one-trade-kpi-subtext">
                                    Keep it going!
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div
                          className="one-trade-summary-footer"
                          style={
                            usePremiumOneTradeTheme
                              ? undefined
                              : {
                                  marginTop: 8,
                                  paddingTop: 0,
                                  borderTop: "none",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 12,
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                }
                          }
                        >
                          <div style={{ fontSize: usePremiumOneTradeTheme ? 14 : 12, color: G.textMuted, fontWeight: 500 }}>
                            Best: {focusBestValue} • Breaks: {focusChallengeRuleBreaks}
                          </div>
                          <div className="one-trade-summary-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {focusIsCompletedAttempt ? (
                              <button
                                type="button"
                                onClick={openDisciplineChallengeStartModal}
                                style={{
                                  background: usePremiumOneTradeTheme ? G.gold : `linear-gradient(135deg, ${G.gold}, ${G.goldDim})`,
                                  border: usePremiumOneTradeTheme ? `1px solid ${G.gold}` : "none",
                                  color: "#ffffff",
                                  borderRadius: 999,
                                  padding: "8px 14px",
                                  cursor: "pointer",
                                  fontSize: usePremiumOneTradeTheme ? 14 : 13,
                                  fontWeight: 600,
                                }}
                              >
                                Choose Challenge
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => exitDisciplineChallengeForUser()}
                              style={{
                                background: usePremiumOneTradeTheme ? "#FFFFFF" : "transparent",
                                border: usePremiumOneTradeTheme ? `1px solid ${G.loss}66` : `1px solid ${G.loss}55`,
                                color: G.loss,
                                borderRadius: 999,
                                padding: "8px 14px",
                                cursor: "pointer",
                                fontSize: usePremiumOneTradeTheme ? 14 : 13,
                                fontWeight: 600,
                              }}
                            >
                              Exit Challenge
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: usePremiumOneTradeTheme ? 24 : 14,
                          background: usePremiumOneTradeTheme ? "#F9FBFF" : G.bgCard2,
                          border: usePremiumOneTradeTheme ? "1px solid #DDE7F2" : `1px solid ${G.border}`,
                          borderRadius: usePremiumOneTradeTheme ? 20 : 10,
                          boxShadow: usePremiumOneTradeTheme ? "0 8px 20px rgba(15, 23, 42, 0.04)" : "none",
                          padding: usePremiumOneTradeTheme ? "20px 22px" : "12px 14px",
                        }}
                      >
                        <div style={{ fontSize: usePremiumOneTradeTheme ? 20 : 16, color: G.text, fontWeight: 700 }}>
                          No active challenge yet
                        </div>
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: usePremiumOneTradeTheme ? 14 : 12,
                            color: G.textMuted,
                            lineHeight: 1.5,
                          }}
                        >
                          Choose 5, 10, or 15 clean days.
                          <br />
                          Build the habit of stopping after one trade.
                        </div>
                        <button
                          type="button"
                          onClick={openDisciplineChallengeStartModal}
                          style={{
                            marginTop: 14,
                            background: usePremiumOneTradeTheme ? G.gold : `linear-gradient(135deg, ${G.gold}, ${G.goldDim})`,
                            border: usePremiumOneTradeTheme ? `1px solid ${G.gold}` : "none",
                            color: "#ffffff",
                            borderRadius: 999,
                            padding: "8px 14px",
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 600,
                          }}
                        >
                          Choose Challenge
                        </button>
                      </div>
                    )}

                      {focusShowDoNotTradeWarning ? (
                        <div
                          style={{
                            marginTop: usePremiumOneTradeTheme ? 16 : 12,
                            background: "#FEF2F2",
                            border: `1px solid ${G.loss}33`,
                            borderRadius: usePremiumOneTradeTheme ? 14 : 10,
                            padding: usePremiumOneTradeTheme ? "12px 14px" : "10px 12px",
                            fontFamily: ONE_TRADE_UI_FONT_STACK,
                          }}
                        >
                          <div style={{ fontSize: 14, color: G.loss, fontWeight: 700 }}>
                            Mindset Says: Do Not Trade
                          </div>
                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 13,
                              color: G.textSub,
                              lineHeight: 1.6,
                            }}
                          >
                            Your current state is not clean enough for live trading.
                            <br />
                            Protect your account. Log a No Trade Day.
                          </div>
                          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={handleOneTradeMindsetWarningLogNoTradeDay}
                              style={{
                                border: `1px solid ${G.win}55`,
                                background: G.winBg,
                                color: G.win,
                                borderRadius: 999,
                                padding: "7px 12px",
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Log No Trade Day
                            </button>
                            <button
                              type="button"
                              onClick={openMindsetReadiness}
                              style={{
                                border: `1px solid ${G.border}`,
                                background: "#FFFFFF",
                                color: G.textSub,
                                borderRadius: 999,
                                padding: "7px 12px",
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Review Checklist
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <div
                        style={{
                          marginTop: usePremiumOneTradeTheme ? 20 : 12,
                          background: "#F8FAFC",
                          border: "1px solid #DDE7F2",
                          borderRadius: usePremiumOneTradeTheme ? 14 : 10,
                          padding: usePremiumOneTradeTheme ? "12px 14px" : "10px 12px",
                          fontFamily: ONE_TRADE_UI_FONT_STACK,
                        }}
                      >
                        <div style={{ fontSize: 12, color: G.textMuted, fontWeight: 700, letterSpacing: "0.02em" }}>
                          {focusYesterdaySummary.heading}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 15, color: G.text, fontWeight: 700 }}>
                          {focusYesterdaySummary.title}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13, color: G.textSub, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                          {focusYesterdaySummary.description}
                        </div>
                      </div>

                      {focusCurrentDisciplineChallenge && (
                        <div style={{ marginTop: usePremiumOneTradeTheme ? 24 : 12 }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                              flexWrap: "wrap",
                              marginBottom: 10,
                            }}
                          >
                            <div
                              style={{
                                fontSize: usePremiumOneTradeTheme ? 18 : 15,
                                color: G.text,
                                fontWeight: usePremiumOneTradeTheme ? 700 : 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              {usePremiumOneTradeTheme ? (
                                <Calendar size={15} strokeWidth={2.2} color={G.textMuted} aria-hidden="true" />
                              ) : null}
                              <span>Current Run</span>
                            </div>
                            <div
                              style={{
                                fontSize: usePremiumOneTradeTheme ? 12 : 11,
                                color: G.textMuted,
                                fontWeight: 500,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                              title="Legend: Clean, Broken, Pending, No Trade Day"
                            >
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <CheckCircle2 size={12} strokeWidth={2.2} color={G.win} aria-hidden="true" />
                                Clean
                              </span>
                              <span>·</span>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <Ban size={12} strokeWidth={2.2} color={G.loss} aria-hidden="true" />
                                Broken
                              </span>
                              <span>·</span>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <Hourglass size={12} strokeWidth={2.2} color="#B45309" aria-hidden="true" />
                                Pending
                              </span>
                              <span>·</span>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <span
                                  aria-hidden="true"
                                  style={{
                                    display: "inline-block",
                                    width: 6,
                                    height: 6,
                                    borderRadius: 999,
                                    background: G.textMuted,
                                  }}
                                />
                                No Trade Day
                              </span>
                            </div>
                          </div>
                          <div
                            className={usePremiumOneTradeTheme ? "one-trade-run-grid" : ""}
                            style={
                              usePremiumOneTradeTheme
                                ? undefined
                                : { display: "flex", flexWrap: "wrap", gap: 6 }
                            }
                          >
                            {focusDisciplineChecklist.map((item) => {
                              const isBroken = item.state === "BROKEN";
                              const isClean = item.state === "CLEAN";
                              const isNoTrade = item.state === "NO_TRADE";
                              const isNeedsReview = item.state === "NEEDS_REVIEW";
                              const isPending = item.state === "PENDING";
                              const cardBackground = isBroken
                                ? "#FEF2F2"
                                : isClean
                                  ? "#ECFDF3"
                                  : isNoTrade
                                    ? "#EEF5FF"
                                  : isNeedsReview
                                    ? "#F8FAFC"
                                  : isPending
                                    ? "#FFF7E6"
                                    : "#FFFFFF";
                              const cardBorder = isBroken
                                ? `${G.loss}55`
                                : isClean
                                  ? `${G.win}55`
                                  : isNoTrade
                                    ? "#BFDBFE"
                                  : isNeedsReview
                                    ? "#CBD5E1"
                                  : isPending
                                    ? "#FCD34D"
                                    : "#DDE7F2";
                              const cardTextColor = isBroken
                                ? G.loss
                                : isClean
                                  ? G.win
                                  : isNoTrade
                                    ? G.goldLight
                                    : isNeedsReview
                                      ? G.textSub
                                    : isPending
                                      ? "#B45309"
                                      : G.textMuted;
                              const cardIcon = isBroken ? (
                                <Ban size={14} strokeWidth={2.2} color={G.loss} aria-hidden="true" />
                              ) : isClean ? (
                                <CheckCircle2 size={14} strokeWidth={2.2} color={G.win} aria-hidden="true" />
                              ) : isNoTrade ? (
                                <CheckCircle2 size={14} strokeWidth={2.2} color={G.goldLight} aria-hidden="true" />
                              ) : isNeedsReview ? (
                                <TriangleAlert size={14} strokeWidth={2.2} color={G.textSub} aria-hidden="true" />
                              ) : isPending ? (
                                <Hourglass size={14} strokeWidth={2.2} color="#B45309" aria-hidden="true" />
                              ) : (
                                <span
                                  aria-hidden="true"
                                  style={{
                                    display: "inline-block",
                                    width: 6,
                                    height: 6,
                                    borderRadius: 999,
                                    background: G.textMuted,
                                  }}
                                />
                              );
                              return (
                                <div
                                  key={item.day}
                                  title={`${item.tradingDayKey || ""} - ${item.label}`}
                                  style={{
                                    background: cardBackground,
                                    border: `1px solid ${cardBorder}`,
                                    borderRadius: usePremiumOneTradeTheme ? 14 : 8,
                                    padding: usePremiumOneTradeTheme ? "10px 12px" : "6px 9px",
                                    minWidth: usePremiumOneTradeTheme ? 0 : 82,
                                    width: usePremiumOneTradeTheme ? "auto" : "fit-content",
                                    boxShadow: usePremiumOneTradeTheme ? "0 4px 14px rgba(15, 23, 42, 0.04)" : "none",
                                  }}
                                >
                                  {usePremiumOneTradeTheme ? (
                                    <>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                        <div style={{ fontSize: 14, color: G.text, fontWeight: 600 }}>Day {item.day}</div>
                                        <div aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16 }}>
                                          {cardIcon}
                                        </div>
                                      </div>
                                      <div style={{ marginTop: 10, fontSize: 14, color: cardTextColor, fontWeight: 700 }}>{item.label}</div>
                                      {item.tradingDayKey ? (
                                        <div style={{ marginTop: 6, fontSize: 12, color: G.textMuted, fontWeight: 500 }}>
                                          {formatShortDateLabel(item.tradingDayKey)}
                                        </div>
                                      ) : null}
                                    </>
                                  ) : (
                                    <>
                                      <div style={{ whiteSpace: "nowrap", fontSize: 12, color: cardTextColor, fontWeight: 700 }}>
                                        Day {item.day} - {item.label}
                                      </div>
                                      {item.tradingDayKey ? (
                                        <div style={{ marginTop: 2, fontSize: 10, color: G.textMuted, fontWeight: 700, whiteSpace: "nowrap" }}>
                                          {formatShortDateLabel(item.tradingDayKey)}
                                        </div>
                                      ) : null}
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {focusHasRecentDaysItems ? (
                        <div style={{ marginTop: usePremiumOneTradeTheme ? 24 : 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: usePremiumOneTradeTheme ? 8 : 6 }}>
                            <div
                              style={{
                                fontSize: usePremiumOneTradeTheme
                                  ? (focusCurrentDisciplineChallenge ? 18 : 16)
                                  : 15,
                                color: G.text,
                                fontWeight: usePremiumOneTradeTheme ? 700 : 600,
                                lineHeight: 1.2,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              {usePremiumOneTradeTheme ? (
                                <Calendar size={15} strokeWidth={2.2} color={G.textMuted} aria-hidden="true" />
                              ) : null}
                              <span>Recent Days</span>
                            </div>
                            {focusCurrentDisciplineChallenge ? (
                              <div
                                style={{
                                  fontSize: usePremiumOneTradeTheme ? 12 : 11,
                                  color: G.textMuted,
                                  fontWeight: 500,
                                  letterSpacing: "0.02em",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                                title="Legend: Clean, Broken, Pending, No Trade Day"
                              >
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  <CheckCircle2 size={12} strokeWidth={2.2} color={G.win} aria-hidden="true" />
                                  Clean
                                </span>
                                <span>·</span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  <Ban size={12} strokeWidth={2.2} color={G.loss} aria-hidden="true" />
                                  Broken
                                </span>
                                <span>·</span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  <Hourglass size={12} strokeWidth={2.2} color="#B45309" aria-hidden="true" />
                                  Pending
                                </span>
                                <span>·</span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  <span
                                    aria-hidden="true"
                                    style={{
                                      display: "inline-block",
                                      width: 6,
                                      height: 6,
                                      borderRadius: 999,
                                      background: G.textMuted,
                                    }}
                                  />
                                  No Trade Day
                                </span>
                              </div>
                            ) : null}
                          </div>
                          <div
                            style={{
                              background: usePremiumOneTradeTheme
                                ? (focusCurrentDisciplineChallenge ? "#F7FAFF" : "#FAFCFF")
                                : "#F1F5FA",
                              border: usePremiumOneTradeTheme
                                ? (focusCurrentDisciplineChallenge ? "1px solid #DDE7F2" : "1px solid #E5ECF5")
                                : "1px solid #D8E2EF",
                              borderRadius: 999,
                              padding: usePremiumOneTradeTheme
                                ? (focusCurrentDisciplineChallenge ? "12px 16px" : "10px 14px")
                                : "8px 12px",
                              overflowX: "auto",
                            }}
                          >
                            <div style={{ display: "flex", flexWrap: "nowrap", gap: 14, alignItems: "center", minWidth: "max-content" }}>
                              {focusRecentDaysItems.map((item) => (
                                <div
                                  key={item.tradingDayKey}
                                  title={`${item.tradingDayKey} - ${item.label}`}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 5,
                                    whiteSpace: "nowrap",
                                    fontSize: usePremiumOneTradeTheme ? 14 : 13,
                                    color: usePremiumOneTradeTheme ? G.text : G.textSub,
                                    fontWeight: 500,
                                    lineHeight: 1.2,
                                    flex: "0 0 auto",
                                  }}
                                >
                                  <span>{item.symbol}</span>
                                  <span>{formatShortDateLabel(item.tradingDayKey)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : !focusCurrentDisciplineChallenge ? (
                        <div
                          style={{
                            marginTop: usePremiumOneTradeTheme ? 24 : 10,
                            background: usePremiumOneTradeTheme ? "#FAFCFF" : G.bgCard2,
                            border: usePremiumOneTradeTheme ? "1px solid #E5ECF5" : `1px solid ${G.border}`,
                            borderRadius: usePremiumOneTradeTheme ? 14 : 8,
                            padding: usePremiumOneTradeTheme ? "12px 14px" : "10px 12px",
                            fontSize: usePremiumOneTradeTheme ? 13 : 12,
                            color: G.textMuted,
                          }}
                        >
                          No challenge activity yet.
                        </div>
                      ) : null}

                      <div
                        ref={tradeJournalSectionRef}
                        style={{ marginTop: usePremiumOneTradeTheme ? 24 : 14 }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                          <div
                            style={{
                              fontFamily: ONE_TRADE_UI_FONT_STACK,
                              fontSize: usePremiumOneTradeTheme ? 19 : 15,
                              fontWeight: usePremiumOneTradeTheme ? 700 : 600,
                              color: G.text,
                              lineHeight: usePremiumOneTradeTheme ? 1.15 : 1.2,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: usePremiumOneTradeTheme ? 10 : 8,
                            }}
                          >
                            {usePremiumOneTradeTheme ? (
                              <div
                                style={{
                                  width: 40,
                                  height: 40,
                                  borderRadius: 999,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "rgba(239, 246, 255, 0.8)",
                                  color: "#2563EB",
                                  border: "1px solid rgba(219, 234, 254, 0.7)",
                                  flex: "0 0 auto",
                                }}
                                aria-hidden="true"
                              >
                                <ChartNoAxesColumnIncreasing style={{ width: 22, height: 22, strokeWidth: 2.6 }} />
                              </div>
                            ) : null}
                            <span>Today's Trade</span>
                          </div>
                          <div className="one-trade-controls-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <FSelect
                              value={focusTradeSortMode}
                              onChange={(e) => setFocusTradeSortMode(e.target.value)}
                              disabled={!focusHasAnyRuleJournalTrades}
                              style={{
                                display: "inline-flex",
                                width: "auto",
                                fieldSizing: "content",
                                padding: usePremiumOneTradeTheme ? "8px 16px" : "6px 10px",
                                fontSize: usePremiumOneTradeTheme ? 14 : 13,
                                fontWeight: 600,
                                borderRadius: 999,
                                border: usePremiumOneTradeTheme ? "1px solid #DDE7F2" : `1px solid ${G.border}`,
                                background: usePremiumOneTradeTheme ? "#FFFFFF" : G.bgCard,
                                color: !focusHasAnyRuleJournalTrades ? G.textMuted : G.textSub,
                                cursor: !focusHasAnyRuleJournalTrades ? "not-allowed" : "pointer",
                                opacity: !focusHasAnyRuleJournalTrades ? 0.65 : 1,
                                whiteSpace: "nowrap",
                                flex: "0 0 auto",
                                alignSelf: "flex-start",
                                justifyContent: "center",
                                gap: 8,
                              }}
                              title={!focusHasAnyRuleJournalTrades ? "Sorting unlocks after the first trade is added." : "Sort trade entries"}
                            >
                              <option value="newest">Sort: Newest</option>
                              <option value="trade_asc">Trade # ?</option>
                              <option value="trade_desc">Trade # ?</option>
                              <option value="pnl_desc">P&amp;L ?</option>
                              <option value="pnl_asc">P&amp;L ?</option>
                            </FSelect>
                            <button
                              type="button"
                              onClick={() => setShowBrokenOnlyTrades((prev) => !prev)}
                              disabled={!focusHasAnyRuleJournalTrades}
                              style={{
                                background: showBrokenOnlyTrades ? (usePremiumOneTradeTheme ? "#FEF2F2" : G.lossBg) : (usePremiumOneTradeTheme ? "#FFFFFF" : G.bgCard),
                                border: `1px solid ${
                                  showBrokenOnlyTrades
                                    ? `${G.loss}${usePremiumOneTradeTheme ? "55" : "44"}`
                                    : usePremiumOneTradeTheme
                                      ? "#DDE7F2"
                                      : G.border
                                }`,
                                color: showBrokenOnlyTrades ? G.loss : G.textSub,
                                borderRadius: 999,
                                padding: usePremiumOneTradeTheme ? "8px 12px" : "6px 11px",
                                cursor: !focusHasAnyRuleJournalTrades ? "not-allowed" : "pointer",
                                opacity: !focusHasAnyRuleJournalTrades ? 0.65 : 1,
                                fontSize: usePremiumOneTradeTheme ? 14 : 13,
                                fontWeight: 600,
                                flex: "0 0 auto",
                                alignSelf: "flex-start",
                                whiteSpace: "nowrap",
                              }}
                              title={!focusHasAnyRuleJournalTrades ? "Broken-day filter unlocks after the first trade is added." : "Show only broken day trades"}
                            >
                              {showBrokenOnlyTrades ? "Broken Only: On" : "Broken Only: Off"}
                            </button>
                          </div>
                        </div>
                        {focusHasImportedReadinessBreachTrade ? (
                          <div
                            style={{
                              marginBottom: 10,
                              background: "#FFF7E6",
                              border: "1px solid #FCD34D",
                              borderRadius: usePremiumOneTradeTheme ? 12 : 8,
                              padding: usePremiumOneTradeTheme ? "10px 12px" : "8px 10px",
                            }}
                          >
                            <div style={{ fontSize: 13, color: "#B45309", fontWeight: 700 }}>
                              Trade imported on a Do Not Trade day.
                            </div>
                            <div style={{ marginTop: 3, fontSize: 12, color: G.textMuted, lineHeight: 1.55 }}>
                              This is a mindset breach, not automatically a One Trade Rule break.
                            </div>
                          </div>
                        ) : null}
                        {!focusCurrentDisciplineChallenge ? (
                          <div
                            style={{
                              background: usePremiumOneTradeTheme ? "#F9FBFF" : G.bgCard2,
                              border: usePremiumOneTradeTheme ? "1px solid #DDE7F2" : `1px solid ${G.border}`,
                              borderRadius: usePremiumOneTradeTheme ? 14 : 8,
                              padding: usePremiumOneTradeTheme ? "14px 16px" : "10px 12px",
                              fontSize: usePremiumOneTradeTheme ? 14 : 12,
                              color: G.textMuted,
                            }}
                          >
                            Start a challenge to track one-trade-rule journal entries here.
                          </div>
                        ) : focusSortedRuleJournalTrades.length === 0 ? (
                          <div
                            style={{
                              background: usePremiumOneTradeTheme ? "#F9FBFF" : G.bgCard2,
                              border: usePremiumOneTradeTheme ? "1px solid #DDE7F2" : `1px solid ${G.border}`,
                              borderRadius: usePremiumOneTradeTheme ? 14 : 8,
                              padding: usePremiumOneTradeTheme ? "14px 16px" : "10px 12px",
                              fontSize: usePremiumOneTradeTheme ? 14 : 12,
                              color: G.textMuted,
                            }}
                          >
                            {showBrokenOnlyTrades
                              ? "No broken day trades found in this challenge."
                              : "No entries yet in this challenge journal."}
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {focusSortedRuleJournalTrades.map((trade) => {
                              const meta = focusBrokenMetaByTradeId[trade.id];
                              const showBrokenTag = Boolean(meta?.brokenDay);
                              return (
                                <TradeCard
                                  key={trade.id}
                                  trade={trade}
                                  tradeNo={focusRuleTradeNumberById[trade.id]}
                                  onClick={() => {}}
                                  uiFontFamily={ONE_TRADE_UI_FONT_STACK}
                                  compactTypography
                                  premiumCard={usePremiumOneTradeTheme}
                                  deEmphasizePnl={usePremiumOneTradeTheme}
                                  brokenDayHighlight={showBrokenTag}
                                  disciplineSequenceTag={
                                    showBrokenTag
                                      ? {
                                          label: meta?.overtrade
                                            ? `${formatEntryOrdinalLabel(meta?.entryNumber)} (Overtrade)`
                                            : formatEntryOrdinalLabel(meta?.entryNumber),
                                          overtrade: Boolean(meta?.overtrade),
                                          tooltip: meta?.overtrade
                                            ? "Rule broken after first trade"
                                            : "First entry of broken day",
                                        }
                                      : null
                                  }
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: usePremiumOneTradeTheme ? 24 : 14 }}>
                        <button
                          type="button"
                          onClick={() => setArchiveSectionOpen((prev) => !prev)}
                          style={{
                            border: usePremiumOneTradeTheme ? "1px solid #DDE7F2" : `1px solid ${G.border}`,
                            background: usePremiumOneTradeTheme ? "#F7FAFF" : G.bgCard2,
                            color: G.goldLight,
                            borderRadius: 999,
                            padding: usePremiumOneTradeTheme ? "10px 14px" : "8px 14px",
                            fontSize: usePremiumOneTradeTheme ? 14 : 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M2 4.5h12v8.8c0 .4-.3.7-.7.7H2.7c-.4 0-.7-.3-.7-.7V4.5z" fill="none" stroke="currentColor" strokeWidth="1.4" />
                            <path d="M6 2h4l.8 1.6H5.2L6 2z" fill="none" stroke="currentColor" strokeWidth="1.4" />
                            <path d="M2 6.7h12" stroke="currentColor" strokeWidth="1.4" />
                          </svg>
                          {archiveSectionOpen ? "Hide Challenge Archive" : `Challenge Archive (${focusArchivedChallenges.length})`}
                          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M5.5 3.5L10 8l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>

                        {archiveSectionOpen && (
                          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                            {focusArchivedChallenges.length === 0 ? (
                              <div
                                style={{
                                  border: usePremiumOneTradeTheme ? "1px solid #DDE7F2" : `1px solid ${G.border}`,
                                  borderRadius: usePremiumOneTradeTheme ? 14 : 10,
                                  background: usePremiumOneTradeTheme ? "#F9FBFF" : G.bgCard2,
                                  padding: usePremiumOneTradeTheme ? "14px 16px" : "10px 12px",
                                  fontSize: usePremiumOneTradeTheme ? 14 : 12,
                                  color: G.textMuted,
                                }}
                              >
                                No archived challenges yet.
                              </div>
                            ) : (
                              focusArchivedChallenges.map((item) => {
                                const challengeTrades = archiveTradesByChallengeId[item.id] || [];
                                const isExpanded = expandedArchiveChallengeId === item.id;
                                const brokenDayKeySet = new Set(
                                  (Array.isArray(oneTradeRule?.disciplineDays) ? oneTradeRule.disciplineDays : [])
                                    .filter(
                                      (day) =>
                                        day?.challenge_id === item.id &&
                                        day?.status === DISCIPLINE_DAY_STATUS.BROKEN
                                    )
                                    .map((day) => String(day?.trading_day_key || day?.trade_date || ""))
                                    .filter(Boolean)
                                );
                                const challengeTradesAsc = [...challengeTrades].sort(compareTradesChronoAsc);
                                const archiveTradeNumberById = Object.fromEntries(
                                  challengeTradesAsc.map((trade, index) => [trade.id, index + 1])
                                );
                                const archiveEntryMetaByTradeId = {};
                                const idsByDay = {};
                                challengeTradesAsc.forEach((trade) => {
                                  const dayKey = String(trade?.trading_day_key || trade?.date || "");
                                  if (!dayKey) return;
                                  if (!idsByDay[dayKey]) idsByDay[dayKey] = [];
                                  idsByDay[dayKey].push(trade.id);
                                });
                                Object.entries(idsByDay).forEach(([dayKey, tradeIds]) => {
                                  tradeIds.forEach((tradeId, index) => {
                                    archiveEntryMetaByTradeId[tradeId] = {
                                      dayKey,
                                      entryNumber: index + 1,
                                      brokenDay: brokenDayKeySet.has(dayKey),
                                      overtrade: index >= 1,
                                    };
                                  });
                                });
                                const archiveVisibleTradesBase = archiveShowBrokenOnlyTrades
                                  ? challengeTrades.filter(
                                      (trade) =>
                                        Boolean(archiveEntryMetaByTradeId[trade.id]?.brokenDay)
                                    )
                                  : [...challengeTrades];
                                const archiveVisibleTrades = [...archiveVisibleTradesBase];
                                const archivePnlValue = (trade) => {
                                  const n = Number(trade?.pnl);
                                  return Number.isFinite(n) ? n : null;
                                };
                                if (archiveTradeSortMode === "trade_asc") {
                                  archiveVisibleTrades.sort(
                                    (a, b) =>
                                      (archiveTradeNumberById[a.id] || Number.MAX_SAFE_INTEGER) -
                                      (archiveTradeNumberById[b.id] || Number.MAX_SAFE_INTEGER)
                                  );
                                } else if (archiveTradeSortMode === "trade_desc") {
                                  archiveVisibleTrades.sort(
                                    (a, b) =>
                                      (archiveTradeNumberById[b.id] || 0) -
                                      (archiveTradeNumberById[a.id] || 0)
                                  );
                                } else if (archiveTradeSortMode === "pnl_desc") {
                                  archiveVisibleTrades.sort((a, b) => {
                                    const aPnl = archivePnlValue(a);
                                    const bPnl = archivePnlValue(b);
                                    if (aPnl === null && bPnl === null) return 0;
                                    if (aPnl === null) return 1;
                                    if (bPnl === null) return -1;
                                    return bPnl - aPnl;
                                  });
                                } else if (archiveTradeSortMode === "pnl_asc") {
                                  archiveVisibleTrades.sort((a, b) => {
                                    const aPnl = archivePnlValue(a);
                                    const bPnl = archivePnlValue(b);
                                    if (aPnl === null && bPnl === null) return 0;
                                    if (aPnl === null) return 1;
                                    if (bPnl === null) return -1;
                                    return aPnl - bPnl;
                                  });
                                } else {
                                  archiveVisibleTrades.sort(compareTradesChronoDesc);
                                }
                                return (
                                  <div
                                    key={item.id}
                                    onClick={() =>
                                      setExpandedArchiveChallengeId((prev) =>
                                        prev === item.id ? "" : item.id
                                      )
                                    }
                                    style={{
                                      border: `1px solid ${G.border}`,
                                      borderRadius: 10,
                                      background: G.bgCard2,
                                      padding: "10px 12px",
                                      cursor: "pointer",
                                      transition: "all 0.18s",
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.borderColor = G.borderHover;
                                      e.currentTarget.style.transform = "translateY(-1px)";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.borderColor = G.border;
                                      e.currentTarget.style.transform = "none";
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: 10,
                                        flexWrap: "wrap",
                                        marginBottom: 4,
                                        alignItems: "center",
                                      }}
                                    >
                                      <div style={{ fontWeight: 800, color: G.text }}>
                                        {formatChallengeTitle(item)}
                                      </div>
                                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 12, color: item.status === "COMPLETED" ? G.win : G.textSub, fontWeight: 700 }}>
                                          {item.status}
                                        </span>
                                        <button
                                          type="button"
                                          title="Delete archived challenge"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteArchivedChallengeForUser(item.id);
                                          }}
                                          style={{
                                            width: 24,
                                            height: 24,
                                            borderRadius: 999,
                                            border: `1px solid ${G.loss}55`,
                                            background: "transparent",
                                            color: G.loss,
                                            cursor: "pointer",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            padding: 0,
                                          }}
                                        >
                                          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                                            <path d="M3 4.5h10" stroke="currentColor" strokeWidth="1.3" />
                                            <path d="M6.3 2.5h3.4l.7 1.2H5.6l.7-1.2z" fill="none" stroke="currentColor" strokeWidth="1.2" />
                                            <path d="M4.4 4.6v8.1c0 .5.4.9.9.9h5.4c.5 0 .9-.4.9-.9V4.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
                                            <path d="M6.7 6.6v5M9.3 6.6v5" stroke="currentColor" strokeWidth="1.2" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                    <div style={{ fontSize: 12, color: G.textMuted, lineHeight: 1.6 }}>
                                      {item.completed_clean_days}/{item.target_clean_days} clean days • Streak {item.current_streak} • Breaks {item.rule_breaks}
                                    </div>
                                    <div style={{ fontSize: 11, color: G.textMuted, marginTop: 4 }}>
                                      Started {formatDateLabel(item.start_date)}{item.archived_at ? ` • Archived ${formatDateLabel(String(item.archived_at).slice(0, 10))}` : ""}
                                      {item.archive_reason ? ` • ${item.archive_reason}` : ""}
                                    </div>
                                    <div style={{ fontSize: 11, color: G.textMuted, marginTop: 6 }}>
                                      {challengeTrades.length} trades • {isExpanded ? "Hide trades" : "Show trades"}
                                    </div>
                                    {isExpanded ? (
                                      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                                        <div
                                          onClick={(e) => e.stopPropagation()}
                                          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
                                        >
                                          <FSelect
                                            value={archiveTradeSortMode}
                                            onChange={(e) => setArchiveTradeSortMode(e.target.value)}
                                            style={{
                                              width: "auto",
                                              minWidth: 170,
                                              padding: "7px 10px",
                                              fontSize: 13,
                                              fontWeight: 600,
                                              borderRadius: 999,
                                            }}
                                          >
                                            <option value="newest">Newest First</option>
                                            <option value="trade_asc">Trade # (Low to High)</option>
                                            <option value="trade_desc">Trade # (High to Low)</option>
                                            <option value="pnl_desc">P&amp;L (High to Low)</option>
                                            <option value="pnl_asc">P&amp;L (Low to High)</option>
                                          </FSelect>
                                          <button
                                            type="button"
                                            onClick={() => setArchiveShowBrokenOnlyTrades((prev) => !prev)}
                                            style={{
                                              background: archiveShowBrokenOnlyTrades ? G.lossBg : "transparent",
                                              border: `1px solid ${archiveShowBrokenOnlyTrades ? `${G.loss}66` : G.border}`,
                                              color: archiveShowBrokenOnlyTrades ? G.loss : G.textSub,
                                              borderRadius: 999,
                                              padding: "7px 12px",
                                              cursor: "pointer",
                                              fontSize: 13,
                                              fontWeight: 600,
                                            }}
                                            title="Show only broken day trades"
                                          >
                                            {archiveShowBrokenOnlyTrades
                                              ? "Broken Day Only: ON"
                                              : "Show Only Broken Day Trades"}
                                          </button>
                                        </div>
                                        {archiveVisibleTrades.length === 0 ? (
                                          <div
                                            style={{
                                              border: `1px solid ${G.border}`,
                                              borderRadius: 8,
                                              background: G.bgCard,
                                              padding: "8px 10px",
                                              fontSize: 12,
                                              color: G.textMuted,
                                            }}
                                          >
                                            {archiveShowBrokenOnlyTrades
                                              ? "No broken day trades found for this challenge."
                                              : "No journal trades found for this challenge."}
                                          </div>
                                        ) : (
                                          archiveVisibleTrades.map((trade) => {
                                            const meta = archiveEntryMetaByTradeId[trade.id];
                                            const showBrokenTag = Boolean(meta?.brokenDay);
                                            return (
                                              <TradeCard
                                                key={trade.id}
                                                trade={trade}
                                                tradeNo={archiveTradeNumberById[trade.id]}
                                                onClick={() => {}}
                                                uiFontFamily={ONE_TRADE_UI_FONT_STACK}
                                                compactTypography
                                                premiumCard={usePremiumOneTradeTheme}
                                                deEmphasizePnl={usePremiumOneTradeTheme}
                                                brokenDayHighlight={showBrokenTag}
                                                disciplineSequenceTag={
                                                  showBrokenTag
                                                    ? {
                                                        label: meta?.overtrade
                                                          ? `${formatEntryOrdinalLabel(meta?.entryNumber)} (Overtrade)`
                                                          : formatEntryOrdinalLabel(meta?.entryNumber),
                                                        overtrade: Boolean(meta?.overtrade),
                                                        tooltip: meta?.overtrade
                                                          ? "Rule broken after first trade"
                                                          : "First entry of broken day",
                                                      }
                                                    : null
                                                }
                                              />
                                            );
                                          })
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                  </>
                </div>
                <div ref={projectsSectionRef} style={{ gridColumn: "1 / -1", height: 0 }} />
                {!isTradingJournalPage && projects.length > 0
                  ? projects.filter((project) => !isHiddenMt5ProjectCard(project)).map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        stats={getProjectStats(project)}
                        onOpen={() => openProject(project.id)}
                        onEdit={() => openProjectEdit(project)}
                      />
                    ))
                  : null}
              </div>
          </div>

          <div
            className="home-right-sticky"
            ref={mindsetSectionRef}
            style={{ display: isCleanDayPage || isSettingsPage || isTradingJournalPage ? "none" : "block" }}
          >
            <MindsetReadinessPage
              isMindsetCheckPage={false}
              showSummaryCard
              showSummaryActions={false}
              headerSubtitle="Earn your permission before you trade"
              homeReadinessTheme={homeReadinessTheme}
              homeReadinessRingDegrees={homeReadinessRingDegrees}
              readinessScoreDisplay={readinessScoreDisplay}
              homeReadinessStatusIcon={HomeReadinessStatusIcon}
              readinessBusy={readinessBusy}
              saveTodayReadiness={saveTodayReadiness}
              resetTodayReadinessForm={resetTodayReadinessForm}
              todayLocalDate={todayLocalDate}
              todayReadiness={todayReadiness}
              mindsetFooterEvent={mindsetFooterEvent}
              readinessForm={readinessForm}
              setReadinessField={setReadinessField}
            />
          </div>
        </div>
      </div>
      </div>
      </div>
      <DisciplineChallengeStartModal
        open={disciplineStartModalOpen}
        selectedTarget={disciplineStartTarget}
        onSelectTarget={setDisciplineStartTarget}
        onClose={() => setDisciplineStartModalOpen(false)}
        onStart={startSelectedDisciplineChallenge}
      />
      <OneTradeManualJournalModal
        open={oneTradeJournalOpen}
        form={oneTradeJournalForm}
        onField={setOneTradeJournalField}
        onClose={() => {
          setOneTradeJournalOpen(false);
          setOneTradeJournalForm(emptyTrade());
        }}
        onSave={saveOneTradeManualJournalEntry}
      />
      <OneTradeMindsetWarningModal
        open={oneTradeMindsetWarningOpen}
        onCancel={handleOneTradeMindsetWarningCancel}
        onLogNoTradeDay={handleOneTradeMindsetWarningLogNoTradeDay}
        onContinueAnyway={handleOneTradeMindsetWarningContinue}
      />
      <ActionModal modal={actionModal} onResolve={resolveActionModal} />
    </div>
  );
}



