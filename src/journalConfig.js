export const STORAGE_KEY = "trade-plan-journal-v1";
export const BACKUP_VERSION = 1;

export const G = {
  bg: "#F6F8FC",
  bgCard: "#ffffff",
  bgCard2: "#F3F6FA",
  border: "#DDE5F0",
  borderHover: "#c5ccd8",
  gold: "#2563eb",
  goldLight: "#1e40af",
  goldDim: "#3b82f6",
  goldGlow: "#2563eb14",
  goldGlow2: "#2563eb28",
  text: "#0F172A",
  textMuted: "#64748B",
  textSub: "#5a6a85",
  win: "#16a34a",
  loss: "#dc2626",
  winBg: "#f0fdf4",
  lossBg: "#fef2f2",
  purple: "#7c3aed",
};

export const MINDSETS = [
  "Focused",
  "Confident",
  "Calm",
  "Nervous",
  "FOMO",
  "Revenge",
  "Patient",
  "Greedy",
  "Tired",
  "Uncertain",
];

export const PAIRS = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "BTCUSD", "Other"];
export const SESSIONS = ["London", "New York", "Asian", "London+NY Overlap"];
export const SETUPS = [
  "Trend Follow",
  "Breakout",
  "Reversal",
  "Support/Resistance",
  "Liquidity Grab",
  "Fair Value Gap",
  "Range",
  "News Play",
  "Other",
];

export const PHASES = [
  { id: "phase1", label: "Phase 1" },
  { id: "phase2", label: "Phase 2" },
];

export const PROP_FIRM_PRESETS = [
  { id: "custom", name: "Custom / Manual", rules: null },
  {
    id: "ftmo-style-5k",
    name: "FTMO Style 5K",
    rules: {
      balance: "5000",
      dailyDrawdown: "250",
      maxDrawdown: "500",
      profitTarget: "500",
      phase2Balance: "5000",
      phase2DailyDrawdown: "250",
      phase2MaxDrawdown: "500",
      phase2ProfitTarget: "250",
    },
  },
  {
    id: "fundingpips-style-5k",
    name: "FundingPips Style 5K",
    rules: {
      balance: "5000",
      dailyDrawdown: "250",
      maxDrawdown: "500",
      profitTarget: "400",
      phase2Balance: "5000",
      phase2DailyDrawdown: "250",
      phase2MaxDrawdown: "500",
      phase2ProfitTarget: "250",
    },
  },
  {
    id: "the5ers-style-5k",
    name: "The5ers Style 5K",
    rules: {
      balance: "5000",
      dailyDrawdown: "250",
      maxDrawdown: "500",
      profitTarget: "400",
      phase2Balance: "5000",
      phase2DailyDrawdown: "250",
      phase2MaxDrawdown: "500",
      phase2ProfitTarget: "250",
    },
  },
];

export const XAUUSD_CONTRACT_SIZE = 100;
export const CHALLENGE_TRADE_LIMIT = 20;
export const CHALLENGE_MIN_RR = 2;
export const CHALLENGE_RULES = [
  {
    tag: "01",
    title: "No Overtrading",
    detail: "Only 20 planned trades count in this challenge.",
  },
  {
    tag: "02",
    title: "Maximum 1 Entry Per Day",
    detail: "If a trade is already logged today, wait for the next trading day.",
  },
  {
    tag: "03",
    title: "Do Not Trail Stop Loss",
    detail: "Keep the original SL. No moving stop loss after entry.",
  },
  {
    tag: "04",
    title: "Do Not Exit Below 1:2 RR",
    detail: "Manual exits and TP closes must respect minimum 2R.",
  },
  {
    tag: "05",
    title: "Follow The Plan For All 20 Trades",
    detail: "Execute the setup, review, and lesson before moving on.",
  },
];
