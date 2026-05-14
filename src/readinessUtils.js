import { localDateValue } from "./journalUtils.js";

export const READINESS_STATUS = {
  NOT_CHECKED: "NOT_CHECKED",
  READY_TO_TRADE: "READY_TO_TRADE",
  CAUTION: "CAUTION",
  DO_NOT_TRADE: "DO_NOT_TRADE",
};

const STATUS_VISUAL = {
  [READINESS_STATUS.NOT_CHECKED]: {
    label: "Not Checked",
    color: "#64748b",
    bg: "#f1f5f9",
    border: "#cbd5e1",
  },
  [READINESS_STATUS.READY_TO_TRADE]: {
    label: "Ready To Trade",
    color: "#15803d",
    bg: "#f0fdf4",
    border: "#86efac",
  },
  [READINESS_STATUS.CAUTION]: {
    label: "Caution",
    color: "#b45309",
    bg: "#fffbeb",
    border: "#fcd34d",
  },
  [READINESS_STATUS.DO_NOT_TRADE]: {
    label: "Do Not Trade",
    color: "#b91c1c",
    bg: "#fef2f2",
    border: "#fca5a5",
  },
};

const EMOTION_SCORES = {
  Calm: 8,
  Focused: 8,
  Confident: 7,
  Neutral: 5,
  Anxious: 2,
  Angry: 0,
  Greedy: 2,
  FOMO: 0,
  "Revenge Mood": 0,
  Tired: 1,
  Distracted: 1,
};

const HARD_BLOCK_TEXT = {
  revengeRisk: "Revenge risk detected",
  financialPressure: "Financial pressure is high",
  previousResultBothering: "Previous result is affecting your mindset a lot",
  sleepQuality: "Sleep quality is very poor",
  sleepHours: "Sleep is less than 4 hours",
  stressLevel: "Stress level is too high",
  focusLevel: "Focus level is too low",
  currentEmotion: "Current emotion is not safe for live trading",
  planReviewed: "Trading plan is not reviewed",
  maxLossAccepted: "Max loss is not mentally accepted",
};

function sleepHoursFromQuality(sleepQuality) {
  if (sleepQuality === "Excellent") return "8h+";
  if (sleepQuality === "Good") return "6-8h";
  if (sleepQuality === "Average") return "4-6h";
  if (sleepQuality === "Poor") return "4-6h";
  if (sleepQuality === "Very Poor") return "Less than 4h";
  return "6-8h";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function textScore(value, scores, fallback = 0) {
  return Number.isFinite(scores[value]) ? scores[value] : fallback;
}

function scaledScore(value, maxPoints) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return (clamp(n, 1, 10) / 10) * maxPoints;
}

function reverseScaledScore(value, maxPoints) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return ((10 - clamp(n, 1, 10)) / 9) * maxPoints;
}

export function emptyReadinessForm(date = localDateValue()) {
  return {
    checkDate: date,
    sleepQuality: "Average",
    sleepHours: "6-8h",
    meditationDone: "No",
    showered: "No",
    foodAndWater: "Partially",
    energyLevel: 5,
    focusLevel: 5,
    deskClean: "Partially",
    roomClean: "Partially",
    phoneDistractionOff: "No",
    externalInfluence: "Slightly",
    currentEmotion: "Neutral",
    previousResultBothering: "Slightly",
    revengeRisk: "No",
    financialPressure: "Slightly",
    stressLevel: 5,
    confidenceLevel: 5,
    planReviewed: "No",
    newsChecked: "No",
    marketBias: "No clear bias",
    keyLevelsMarked: "No",
    maxLossAccepted: "No",
    aPlusSetupOnly: "No",
    maxTradesToday: 1,
    score: 0,
    status: READINESS_STATUS.NOT_CHECKED,
    hardBlock: false,
    reasons: [],
    noTradeDay: false,
    disciplineWin: false,
    id: "",
    createdAt: "",
    updatedAt: "",
  };
}

export function normalizeReadinessForm(value, date = localDateValue()) {
  const sanitizedValue =
    value && typeof value === "object"
      ? (() => {
          const {
            todayRule,
            ifThenPlan1,
            ifThenPlan2,
            ifThenPlan3,
            notes,
            today_rule,
            if_then_plan_1,
            if_then_plan_2,
            if_then_plan_3,
            ...rest
          } = value;
          void todayRule;
          void ifThenPlan1;
          void ifThenPlan2;
          void ifThenPlan3;
          void notes;
          void today_rule;
          void if_then_plan_1;
          void if_then_plan_2;
          void if_then_plan_3;
          return rest;
        })()
      : value;
  const base = emptyReadinessForm(date);
  return {
    ...base,
    ...(sanitizedValue || {}),
    checkDate: value?.checkDate || value?.check_date || date,
    energyLevel: Number(value?.energyLevel ?? value?.energy_level ?? base.energyLevel),
    focusLevel: Number(value?.focusLevel ?? value?.focus_level ?? base.focusLevel),
    stressLevel: Number(value?.stressLevel ?? value?.stress_level ?? base.stressLevel),
    confidenceLevel: Number(value?.confidenceLevel ?? value?.confidence_level ?? base.confidenceLevel),
    maxTradesToday: Number(value?.maxTradesToday ?? value?.max_trades_today ?? base.maxTradesToday),
    reasons: Array.isArray(value?.reasons) ? value.reasons : base.reasons,
    noTradeDay: Boolean(value?.noTradeDay ?? value?.no_trade_day),
    disciplineWin: Boolean(value?.disciplineWin ?? value?.discipline_win),
  };
}

export function evaluateReadiness(formInput) {
  const form = normalizeReadinessForm(formInput);
  const reasons = [];
  const effectiveSleepHours = sleepHoursFromQuality(form.sleepQuality);

  const bodyScore =
    textScore(form.sleepQuality, {
      Excellent: 5,
      Good: 4,
      Average: 3,
      Poor: 1.5,
      "Very Poor": 0,
    }) +
    textScore(effectiveSleepHours, {
      "8h+": 4,
      "6-8h": 3,
      "4-6h": 1.5,
      "Less than 4h": 0,
    }) +
    textScore(form.meditationDone, {
      "Yes, 10+ minutes": 3,
      "Yes, 5 minutes": 2,
      No: 0,
    }) +
    textScore(form.showered, { Yes: 2, No: 0 }) +
    textScore(form.foodAndWater, { Yes: 3, Partially: 1.5, No: 0 }) +
    scaledScore(form.energyLevel, 4) +
    scaledScore(form.focusLevel, 4);

  const environmentScore =
    textScore(form.deskClean, { Yes: 4, Partially: 2, No: 0 }) +
    textScore(form.roomClean, { Yes: 3, Partially: 1.5, No: 0 }) +
    textScore(form.phoneDistractionOff, { Yes: 4, No: 0 }) +
    textScore(form.externalInfluence, { No: 4, Slightly: 2, Yes: 0 });

  const emotionScore =
    textScore(form.currentEmotion, EMOTION_SCORES, 2) +
    textScore(form.previousResultBothering, { No: 6, Slightly: 3, "Yes, a lot": 0 }) +
    textScore(form.revengeRisk, { No: 6, Maybe: 3, Yes: 0 }) +
    textScore(form.financialPressure, { No: 5, Slightly: 2, Yes: 0 }) +
    reverseScaledScore(form.stressLevel, 5) +
    scaledScore(form.confidenceLevel, 5);

  const prepScore =
    textScore(form.planReviewed, { Yes: 6, No: 2 }) +
    textScore(form.newsChecked, { Yes: 4, No: 2 }) +
    textScore(form.marketBias, { Bullish: 4, Bearish: 4, Range: 3, "No clear bias": 3 }) +
    textScore(form.keyLevelsMarked, { Yes: 4, No: 2 }) +
    textScore(form.maxLossAccepted, { Yes: 4, No: 2 }) +
    textScore(form.aPlusSetupOnly, { Yes: 3, No: 1 }) +
    textScore(form.maxTradesToday, { 0: 2, 1: 2, 2: 1, 3: 0 });

  const score = Math.round(clamp(bodyScore + environmentScore + emotionScore + prepScore, 0, 100));

  const hardBlockReasons = [];
  if (form.revengeRisk === "Yes") hardBlockReasons.push(HARD_BLOCK_TEXT.revengeRisk);
  if (form.financialPressure === "Yes") hardBlockReasons.push(HARD_BLOCK_TEXT.financialPressure);
  if (["Angry", "Revenge Mood"].includes(form.currentEmotion)) hardBlockReasons.push(HARD_BLOCK_TEXT.currentEmotion);

  const hardBlock = hardBlockReasons.length > 0;
  reasons.push(...hardBlockReasons);

  let status = READINESS_STATUS.READY_TO_TRADE;
  if (score < 60) status = READINESS_STATUS.DO_NOT_TRADE;
  else if (score < 80) status = READINESS_STATUS.CAUTION;
  if (hardBlock) status = READINESS_STATUS.DO_NOT_TRADE;

  let message = "You are in a clean execution state. Trade only your plan and protect discipline.";
  let recommendedAction = "Follow your plan, keep risk controlled, and execute only A+ setups.";

  if (status === READINESS_STATUS.CAUTION) {
    message = "Conditions are not perfect. Reduce risk, take only A+ setups, and stop after one mistake.";
    recommendedAction = "Trade smaller, stay selective, and stop immediately after breaking one rule.";
  }

  if (status === READINESS_STATUS.DO_NOT_TRADE) {
    message = "Your mindset is not suitable for live trading today. Protect your account by staying out.";
    recommendedAction = "No live trading today. Backtest, review journal, take a walk, or observe only.";
  }

  return {
    ...form,
    score,
    status,
    hardBlock,
    reasons,
    message,
    recommendedAction,
  };
}

export function getReadinessVisual(status) {
  return STATUS_VISUAL[status] || STATUS_VISUAL[READINESS_STATUS.NOT_CHECKED];
}

export function badgeTextFromReadiness(readiness) {
  if (!readiness) return "Mindset: Not Checked";
  const visual = getReadinessVisual(readiness.status);
  return `Mindset: ${visual.label}`;
}

export function readinessFromRow(row) {
  if (!row) return null;
  return normalizeReadinessForm({
    ...row,
    id: row.id,
    checkDate: row.check_date,
    sleepQuality: row.sleep_quality,
    sleepHours: row.sleep_hours,
    meditationDone: row.meditation_done,
    showered: row.showered,
    foodAndWater: row.food_and_water,
    energyLevel: row.energy_level,
    focusLevel: row.focus_level,
    deskClean: row.desk_clean,
    roomClean: row.room_clean,
    phoneDistractionOff: row.phone_distraction_off,
    externalInfluence: row.external_influence,
    currentEmotion: row.current_emotion,
    previousResultBothering: row.previous_result_bothering,
    revengeRisk: row.revenge_risk,
    financialPressure: row.financial_pressure,
    stressLevel: row.stress_level,
    confidenceLevel: row.confidence_level,
    planReviewed: row.plan_reviewed,
    newsChecked: row.news_checked,
    marketBias: row.market_bias,
    keyLevelsMarked: row.key_levels_marked,
    maxLossAccepted: row.max_loss_accepted,
    aPlusSetupOnly: row.a_plus_setup_only,
    maxTradesToday: row.max_trades_today,
    score: row.score,
    status: row.status,
    hardBlock: row.hard_block,
    reasons: Array.isArray(row.reasons) ? row.reasons : [],
    noTradeDay: row.no_trade_day,
    disciplineWin: row.discipline_win,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function readinessRowPayload(readiness, userId) {
  return {
    user_id: userId,
    check_date: readiness.checkDate,
    sleep_quality: readiness.sleepQuality,
    sleep_hours: readiness.sleepHours,
    meditation_done: readiness.meditationDone,
    showered: readiness.showered,
    food_and_water: readiness.foodAndWater,
    energy_level: Number(readiness.energyLevel),
    focus_level: Number(readiness.focusLevel),
    desk_clean: readiness.deskClean,
    room_clean: readiness.roomClean,
    phone_distraction_off: readiness.phoneDistractionOff,
    external_influence: readiness.externalInfluence,
    current_emotion: readiness.currentEmotion,
    previous_result_bothering: readiness.previousResultBothering,
    revenge_risk: readiness.revengeRisk,
    financial_pressure: readiness.financialPressure,
    stress_level: Number(readiness.stressLevel),
    confidence_level: Number(readiness.confidenceLevel),
    plan_reviewed: readiness.planReviewed,
    news_checked: readiness.newsChecked,
    market_bias: readiness.marketBias,
    key_levels_marked: readiness.keyLevelsMarked,
    max_loss_accepted: readiness.maxLossAccepted,
    a_plus_setup_only: readiness.aPlusSetupOnly,
    max_trades_today: Number(readiness.maxTradesToday),
    score: readiness.score,
    status: readiness.status,
    hard_block: Boolean(readiness.hardBlock),
    reasons: readiness.reasons || [],
    no_trade_day: Boolean(readiness.noTradeDay),
    discipline_win: Boolean(readiness.disciplineWin),
    updated_at: new Date().toISOString(),
  };
}
