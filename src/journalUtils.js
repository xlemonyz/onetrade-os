import {
  BACKUP_VERSION,
  CHALLENGE_TRADE_LIMIT,
  G,
  PHASES,
  PROP_FIRM_PRESETS,
  XAUUSD_CONTRACT_SIZE,
} from "./journalConfig.js";

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localTimeValue(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function fmtMoney(value, signed = false) {
  const n = asNumber(value);
  const prefix = signed ? (n >= 0 ? "+" : "-") : n < 0 ? "-" : "";
  return `${prefix}$${Math.abs(n).toFixed(2)}`;
}

export function formatNumberInput(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function getOutcomePrice(trade) {
  if (trade.outcome === "TP") return trade.tpPrice;
  if (trade.outcome === "SL") return trade.slPrice;
  if (trade.outcome === "Breakeven") return trade.entryPrice;
  return trade.closePrice;
}

export function calculateTradePnl(trade) {
  const entry = Number(trade.entryPrice);
  const exit = Number(getOutcomePrice(trade));
  const lots = Number(trade.lotSize);

  if (!Number.isFinite(entry) || !Number.isFinite(exit) || !Number.isFinite(lots) || lots <= 0) {
    return "";
  }

  const directionMultiplier = trade.direction === "SELL" ? -1 : 1;
  return (exit - entry) * directionMultiplier * lots * XAUUSD_CONTRACT_SIZE;
}

export function calculateRiskReward(trade) {
  const entry = Number(trade.entryPrice);
  const stop = Number(trade.slPrice);
  const exit = Number(getOutcomePrice(trade));

  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(exit)) {
    return "";
  }

  const risk = Math.abs(entry - stop);
  if (risk <= 0) return "";

  const directionMultiplier = trade.direction === "SELL" ? -1 : 1;
  const reward = (exit - entry) * directionMultiplier;
  return reward / risk;
}

export function formatRiskReward(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value || "--";
  return n < 0 ? `${n.toFixed(2)}R` : `1:${n.toFixed(2)}`;
}

export function ratioText(total, value) {
  const whole = Math.max(0, asNumber(total));
  const part = Math.max(0, asNumber(value));
  if (!whole || !part) return "";
  return `${((part / whole) * 100).toFixed(1)}% of balance`;
}

export function formatDateLabel(value) {
  if (!value) return "--";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function buildBackupPayload(projects) {
  return {
    app: "trade-plan-journal",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    projects: projects.map((project, index) => normalizeProject(project, index)),
  };
}

export function snapshotProjects(projects) {
  return JSON.stringify({
    projects: projects.map((project, index) => normalizeProject(project, index)),
  });
}

export function backupFileName() {
  return `trade-plan-journal-backup-${localDateValue()}.json`;
}

export function readBackupProjects(text) {
  const parsed = JSON.parse(text);
  const importedProjects = migrateStorage(parsed);
  if (!importedProjects.length) {
    throw new Error("Backup file does not include any projects.");
  }
  return importedProjects;
}

export function projectDataForCloud(project) {
  const data = { ...normalizeProject(project) };
  delete data.trades;
  return data;
}

export function buildProjectsFromCloud(projectRows = [], tradeRows = []) {
  const tradesByProjectId = tradeRows.reduce((acc, row) => {
    if (!row.project_id) return acc;
    acc[row.project_id] = acc[row.project_id] || [];
    acc[row.project_id].push(
      normalizeTrade({
        ...(row.data || {}),
        brokerTicket: row.broker_ticket || row.data?.brokerTicket || "",
        brokerAccountNumber: row.broker_account_number || row.data?.brokerAccountNumber || "",
        brokerSource: row.broker_source || row.data?.brokerSource || "",
        importedAt: row.imported_at || row.data?.importedAt || "",
      })
    );
    return acc;
  }, {});

  return projectRows.map((row, index) =>
    normalizeProject(
      {
        ...(row.data || {}),
        name: row.name || row.data?.name || "Cloud Project",
        trades: tradesByProjectId[row.id] || [],
      },
      index
    )
  );
}

export function emptyTrade() {
  return {
    id: createId("trade"),
    date: localDateValue(),
    time: localTimeValue(),
    phase: "phase1",
    pair: "XAUUSD",
    session: "London",
    direction: "BUY",
    preScreenshot: "",
    setup: "Trend Follow",
    entryPrice: "",
    lotSize: "0.01",
    slPrice: "",
    tpPrice: "",
    riskReward: "",
    tradePlan: "",
    postScreenshot: "",
    outcome: "",
    closePrice: "",
    pnl: "",
    mindsetBefore: [],
    mindsetDuring: [],
    mindsetAfter: [],
    whatWentWell: "",
    whatWentWrong: "",
    lesson: "",
    rating: 0,
    brokerTicket: "",
    brokerAccountNumber: "",
    brokerSource: "",
    importedAt: "",
    readinessStatusAtEntry: "NOT_CHECKED",
    readinessScoreAtEntry: null,
    readinessOverride: false,
    readinessCheckId: "",
    readinessReasonsAtEntry: [],
    readinessStateAtTrade: "NOT_CHECKED",
    readinessBreach: false,
  };
}

export function emptyProject() {
  return {
    id: createId("project"),
    name: "Main Project",
    presetId: "custom",
    balance: "5000",
    dailyDrawdown: "",
    maxDrawdown: "",
    profitTarget: "",
    phase2Balance: "5000",
    phase2DailyDrawdown: "",
    phase2MaxDrawdown: "",
    phase2ProfitTarget: "",
    createdAt: new Date().toISOString(),
    trades: [],
    disciplineJournalTrades: [],
    disciplineMarketSettings: {},
    disciplineChallenges: [],
    disciplineDays: [],
    disciplineTradeEvents: [],
    dailyCommitments: [],
    disciplineChallengeCounter: 0,
    disciplineNotices: [],
  };
}

export function applyPresetToProject(project, presetId) {
  const preset = PROP_FIRM_PRESETS.find((item) => item.id === presetId);
  if (!preset?.rules) return { ...project, presetId };
  return { ...project, presetId, ...preset.rules };
}

export function normalizeTrade(trade = {}) {
  const base = emptyTrade();
  return {
    ...base,
    ...trade,
    id: trade.id ? String(trade.id) : base.id,
    phase: PHASES.some((phase) => phase.id === trade.phase) ? trade.phase : "phase1",
    mindsetBefore: Array.isArray(trade.mindsetBefore) ? trade.mindsetBefore : [],
    mindsetDuring: Array.isArray(trade.mindsetDuring) ? trade.mindsetDuring : [],
    mindsetAfter: Array.isArray(trade.mindsetAfter) ? trade.mindsetAfter : [],
    readinessReasonsAtEntry: Array.isArray(trade.readinessReasonsAtEntry) ? trade.readinessReasonsAtEntry : [],
    readinessOverride: Boolean(trade.readinessOverride),
    readinessStateAtTrade: String(
      trade.readinessStateAtTrade || trade.readiness_state_at_trade || base.readinessStateAtTrade
    ),
    readinessBreach: Boolean(trade.readinessBreach ?? trade.readiness_breach),
  };
}

export function normalizeProject(project = {}, index = 0) {
  const base = emptyProject();
  return {
    ...base,
    ...project,
    id: project.id ? String(project.id) : `${base.id}-${index}`,
    createdAt: project.createdAt || base.createdAt,
    trades: Array.isArray(project.trades) ? project.trades.map(normalizeTrade) : [],
    disciplineJournalTrades: Array.isArray(project.disciplineJournalTrades)
      ? project.disciplineJournalTrades.map(normalizeTrade)
      : [],
    disciplineMarketSettings:
      project.disciplineMarketSettings && typeof project.disciplineMarketSettings === "object"
        ? project.disciplineMarketSettings
        : {},
    disciplineChallenges: Array.isArray(project.disciplineChallenges) ? project.disciplineChallenges : [],
    disciplineDays: Array.isArray(project.disciplineDays) ? project.disciplineDays : [],
    disciplineTradeEvents: Array.isArray(project.disciplineTradeEvents) ? project.disciplineTradeEvents : [],
    dailyCommitments: Array.isArray(project.dailyCommitments) ? project.dailyCommitments : [],
    disciplineChallengeCounter: Number.isFinite(Number(project.disciplineChallengeCounter))
      ? Number(project.disciplineChallengeCounter)
      : 0,
    disciplineNotices: Array.isArray(project.disciplineNotices) ? project.disciplineNotices : [],
  };
}

export function migrateStorage(raw) {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return [normalizeProject({ name: "Main Project", trades: raw })];
  }

  if (raw && typeof raw === "object") {
    if (Array.isArray(raw.projects)) {
      return raw.projects.map(normalizeProject);
    }

    if (raw.project || raw.trades) {
      return [normalizeProject({ ...(raw.project || {}), trades: raw.trades || [] })];
    }

    if (Array.isArray(raw.trades)) {
      return [normalizeProject(raw)];
    }
  }

  return [];
}

function getPhaseRules(project, phaseId) {
  if (phaseId === "phase2") {
    return {
      balance: project?.phase2Balance,
      dailyDrawdown: project?.phase2DailyDrawdown,
      maxDrawdown: project?.phase2MaxDrawdown,
      profitTarget: project?.phase2ProfitTarget,
    };
  }

  return {
    balance: project?.balance,
    dailyDrawdown: project?.dailyDrawdown,
    maxDrawdown: project?.maxDrawdown,
    profitTarget: project?.profitTarget,
  };
}

export function getProjectStats(project, phaseId = "phase1") {
  const rules = getPhaseRules(project, phaseId);
  const trades = Array.isArray(project?.trades)
    ? project.trades.filter((trade) => (trade.phase || "phase1") === phaseId)
    : [];
  const balance = Math.max(0, asNumber(rules.balance));
  const dailyDrawdown = Math.max(0, asNumber(rules.dailyDrawdown));
  const maxDrawdown = Math.max(0, asNumber(rules.maxDrawdown));
  const profitTarget = Math.max(0, asNumber(rules.profitTarget));
  const totalPnl = trades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0);
  const wins = trades.filter((trade) => trade.outcome === "TP").length;
  const losses = trades.filter((trade) => trade.outcome === "SL").length;
  const ratedTrades = trades.filter((trade) => trade.rating > 0);
  const avgRating = ratedTrades.length
    ? (ratedTrades.reduce((sum, trade) => sum + trade.rating, 0) / ratedTrades.length).toFixed(1)
    : null;
  const currentBalance = balance + totalPnl;
  const targetBalance = profitTarget > 0 ? balance + profitTarget : 0;
  const accountFloor = maxDrawdown > 0 ? balance - maxDrawdown : 0;
  const targetRemaining = profitTarget > 0 ? Math.max(0, profitTarget - totalPnl) : 0;
  const targetProgress = profitTarget > 0 ? Math.min(100, Math.max(0, (totalPnl / profitTarget) * 100)) : 0;

  const orderedTrades = [...trades].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  let runningPnl = 0;
  let lowestPnl = 0;
  orderedTrades.forEach((trade) => {
    runningPnl += Number(trade.pnl) || 0;
    lowestPnl = Math.min(lowestPnl, runningPnl);
  });

  const lowestBalance = balance + lowestPnl;
  const lowestBuffer = maxDrawdown > 0 ? lowestBalance - accountFloor : 0;
  const maxRemaining = maxDrawdown > 0 ? currentBalance - accountFloor : 0;
  const maxUsage = maxDrawdown > 0 ? Math.min(100, (Math.abs(lowestPnl) / maxDrawdown) * 100) : 0;

  const dailyMap = trades.reduce((acc, trade) => {
    if (!trade.date) return acc;
    acc[trade.date] = (acc[trade.date] || 0) + (Number(trade.pnl) || 0);
    return acc;
  }, {});

  const todayKey = localDateValue();
  const todayPnl = dailyMap[todayKey] || 0;
  const dailyValues = Object.values(dailyMap);
  const worstDayPnl = dailyValues.length ? Math.min(...dailyValues) : 0;
  const todayLossUsed = Math.abs(Math.min(todayPnl, 0));
  const dailyRemaining = dailyDrawdown > 0 ? dailyDrawdown - todayLossUsed : 0;
  const dailyUsage = dailyDrawdown > 0 ? Math.min(100, (todayLossUsed / dailyDrawdown) * 100) : 0;

  const dailyBreached = dailyDrawdown > 0 && worstDayPnl < -dailyDrawdown;
  const maxBreached = maxDrawdown > 0 && lowestBuffer < 0;
  const targetHit = profitTarget > 0 && totalPnl >= profitTarget;
  const rulesReady = balance > 0 || dailyDrawdown > 0 || maxDrawdown > 0 || profitTarget > 0;

  const status = maxBreached
    ? { label: "Max DD Breached", color: G.loss, bg: G.lossBg }
    : dailyBreached
      ? { label: "Daily DD Breached", color: G.loss, bg: G.lossBg }
      : targetHit
        ? { label: "Passed", color: G.win, bg: G.winBg }
        : rulesReady
          ? { label: "In Progress", color: G.goldLight, bg: G.goldGlow2 }
          : { label: "Set Rules", color: G.textSub, bg: G.bgCard2 };

  return {
    phaseId,
    phaseLabel: PHASES.find((phase) => phase.id === phaseId)?.label || "Phase",
    trades,
    balance,
    dailyDrawdown,
    maxDrawdown,
    profitTarget,
    totalPnl,
    wins,
    losses,
    avgRating,
    currentBalance,
    targetBalance,
    accountFloor,
    targetRemaining,
    targetProgress,
    lowestBalance,
    maxRemaining,
    maxUsage,
    todayPnl,
    worstDayPnl,
    dailyRemaining,
    dailyUsage,
    targetHit,
    dailyBreached,
    maxBreached,
    status,
  };
}

function projectWithTrade(project, trade) {
  const exists = project.trades.some((item) => item.id === trade.id);
  return {
    ...project,
    trades: exists
      ? project.trades.map((item) => (item.id === trade.id ? trade : item))
      : [trade, ...project.trades],
  };
}

export function getRiskGuardMessages(project, trade) {
  const beforeStats = getProjectStats(project, trade.phase);
  const afterStats = getProjectStats(projectWithTrade(project, trade), trade.phase);
  const messages = [];

  if (afterStats.dailyBreached && !beforeStats.dailyBreached) {
    messages.push(
      `${afterStats.phaseLabel} daily drawdown will be breached. Worst day becomes ${fmtMoney(afterStats.worstDayPnl, true)} against a ${fmtMoney(afterStats.dailyDrawdown)} limit.`
    );
  }

  if (afterStats.maxBreached && !beforeStats.maxBreached) {
    messages.push(
      `${afterStats.phaseLabel} max drawdown will be breached. Lowest balance becomes ${fmtMoney(afterStats.lowestBalance)} while the floor is ${fmtMoney(afterStats.accountFloor)}.`
    );
  }

  if (afterStats.targetHit && !beforeStats.targetHit) {
    messages.push(`${afterStats.phaseLabel} will be marked as Passed after this trade.`);
  }

  return messages;
}

export function getChallengeStats(project) {
  const trades = Array.isArray(project?.trades) ? project.trades : [];
  const completed = Math.min(trades.length, CHALLENGE_TRADE_LIMIT);
  const dateCounts = trades.reduce((acc, trade) => {
    if (!trade.date) return acc;
    acc[trade.date] = (acc[trade.date] || 0) + 1;
    return acc;
  }, {});
  const daysWithMultipleEntries = Object.values(dateCounts).filter((count) => count > 1).length;

  return {
    total: CHALLENGE_TRADE_LIMIT,
    completed,
    remaining: Math.max(0, CHALLENGE_TRADE_LIMIT - trades.length),
    progress: (completed / CHALLENGE_TRADE_LIMIT) * 100,
    todayEntries: dateCounts[localDateValue()] || 0,
    daysWithMultipleEntries,
    complete: trades.length >= CHALLENGE_TRADE_LIMIT,
  };
}
