import test from "node:test";
import assert from "node:assert/strict";
import {
  closeOneTradeRuleDay,
  DISCIPLINE_DAY_STATUS,
  addDailyCommitment,
  evaluateDisciplineState,
  exitDisciplineChallenge,
  getChallengeChecklist,
  getGoldTradingDay,
  prepareNextDisciplineRun,
  startDisciplineChallenge,
} from "./disciplineUtils.js";

function emptyProject() {
  return {
    id: "project-test",
    name: "Test",
    trades: [],
    disciplineJournalTrades: [],
    disciplineMarketSettings: {
      close_time: "17:00",
      close_timezone: "America/New_York",
      auto_finalize_enabled: true,
    },
    disciplineChallenges: [],
    disciplineDays: [],
    disciplineTradeEvents: [],
    dailyCommitments: [],
  };
}

function tradeFor({ id, date, time = "10:00", outcome = "TP", challengeId = "" }) {
  return {
    id,
    date,
    time,
    outcome,
    pair: "XAUUSD",
    direction: "BUY",
    discipline_challenge_id: challengeId,
    readinessStatusAtEntry: "READY_TO_TRADE",
  };
}

function forceChallengeStartDate(project, startDate = "2026-04-28") {
  return {
    ...project,
    disciplineChallenges: project.disciplineChallenges.map((item) => ({
      ...item,
      start_date: startDate,
    })),
  };
}

test("active challenge with no trades stays waiting even with a commitment record", () => {
  const started = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5));
  const challenge = started.disciplineChallenges[0];
  const withCommitment = addDailyCommitment(started, challenge, { date: "2026-04-28" });

  const result = evaluateDisciplineState(withCommitment, { now: "2026-04-28T18:00:00Z" }); // 2:00 PM NY
  assert.equal(result.todayTradesCount, 0);
  assert.equal(result.todayDay?.status, DISCIPLINE_DAY_STATUS.WAITING);
});

test("first closed trade stays pending before New York close", () => {
  const started = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5));
  const challenge = started.disciplineChallenges[0];
  const withCommitment = addDailyCommitment(started, challenge, { date: "2026-04-28" });
  const withTrade = {
    ...withCommitment,
    disciplineJournalTrades: [tradeFor({ id: "t1", date: "2026-04-28", time: "10:00", outcome: "SL", challengeId: challenge.id })],
  };

  const result = evaluateDisciplineState(withTrade, { now: "2026-04-28T18:00:00Z" }); // 2:00 PM NY
  const active = result.project.disciplineChallenges.find((item) => item.status === "ACTIVE");
  assert.equal(result.todayTradesCount, 1);
  assert.equal(result.todayDay?.status, DISCIPLINE_DAY_STATUS.PENDING_CLEAN);
  assert.equal(active?.completed_clean_days, 0);
  assert.equal(active?.current_streak, 0);
});

test("single closed trade finalizes clean after New York close", () => {
  const started = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5));
  const challenge = started.disciplineChallenges[0];
  const withCommitment = addDailyCommitment(started, challenge, { date: "2026-04-28" });
  const withTrade = {
    ...withCommitment,
    disciplineJournalTrades: [tradeFor({ id: "t1", date: "2026-04-28", time: "10:00", outcome: "TP", challengeId: challenge.id })],
  };

  const result = evaluateDisciplineState(withTrade, { now: "2026-04-28T22:30:00Z" }); // 6:30 PM NY
  const active = result.project.disciplineChallenges.find((item) => item.status === "ACTIVE");
  const tradeDay = result.project.disciplineDays.find((day) => day.trading_day_key === "2026-04-28");
  assert.equal(tradeDay?.status, DISCIPLINE_DAY_STATUS.CLEAN);
  assert.equal(active?.completed_clean_days, 1);
  assert.equal(active?.current_streak, 1);
});

test("zero trades finalizes as no trade day after New York close", () => {
  const started = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5));

  const result = evaluateDisciplineState(started, { now: "2026-04-28T22:30:00Z" }); // 6:30 PM NY
  const active = result.project.disciplineChallenges.find((item) => item.status === "ACTIVE");
  const tradeDay = result.project.disciplineDays.find((day) => day.trading_day_key === "2026-04-28");

  assert.equal(tradeDay?.status, DISCIPLINE_DAY_STATUS.NO_TRADE);
  assert.equal(active?.completed_clean_days, 1);
  assert.equal(active?.current_streak, 1);
});

test("five clean days complete a five day challenge", () => {
  let project = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5), "2026-04-28");
  const challenge = project.disciplineChallenges[0];

  for (let index = 0; index < 5; index += 1) {
    const date = `2026-05-${String(index + 1).padStart(2, "0")}`;
    project = {
      ...project,
      disciplineJournalTrades: [
        ...(project.disciplineJournalTrades || []),
        tradeFor({ id: `clean-${index + 1}`, date, time: "10:00", outcome: "TP", challengeId: challenge.id }),
      ],
    };
    project = evaluateDisciplineState(project, { now: `${date}T22:30:00Z` }).project;
  }

  const completed = project.disciplineChallenges.find((item) => item.id === challenge.id);
  assert.equal(completed?.status, "COMPLETED");
  assert.equal(completed?.completed_clean_days, 5);
  assert.equal(completed?.current_streak, 5);
});

test("completion remains visible as current challenge when no active challenge exists", () => {
  let project = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5), "2026-04-28");
  const challenge = project.disciplineChallenges[0];

  for (let index = 0; index < 5; index += 1) {
    const date = `2026-05-${String(index + 1).padStart(2, "0")}`;
    project.disciplineJournalTrades = [
      ...(project.disciplineJournalTrades || []),
      tradeFor({ id: `visible-${index + 1}`, date, challengeId: challenge.id }),
    ];
    project = evaluateDisciplineState(project, { now: `${date}T22:30:00Z` }).project;
  }

  const result = evaluateDisciplineState(project, { now: "2026-05-06T14:00:00Z" });
  assert.equal(result.activeChallenge, null);
  assert.equal(result.currentChallenge?.status, "COMPLETED");
  assert.equal(result.currentChallenge?.completed_clean_days, 5);
});

test("second trade before close marks broken and does not increment progress", () => {
  const started = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5));
  const challenge = started.disciplineChallenges[0];
  const withCommitment = addDailyCommitment(started, challenge, { date: "2026-04-28" });
  const withTrades = {
    ...withCommitment,
    disciplineJournalTrades: [
      tradeFor({ id: "t1", date: "2026-04-28", time: "09:00", outcome: "SL", challengeId: challenge.id }),
      tradeFor({ id: "t2", date: "2026-04-28", time: "11:00", outcome: "TP", challengeId: challenge.id }),
    ],
  };

  const result = evaluateDisciplineState(withTrades, { now: "2026-04-28T19:00:00Z" }); // 3:00 PM NY
  const frozen = result.project.disciplineChallenges.find((item) => item.status === "BROKEN_FROZEN");
  assert.equal(result.todayDay?.status, DISCIPLINE_DAY_STATUS.BROKEN);
  assert.equal(frozen?.completed_clean_days, 0);
  assert.equal(frozen?.current_streak, 0);
  assert.equal(frozen?.rule_breaks, 1);
});

test("saved auto finalize off still closes the day at gold market close", () => {
  const started = forceChallengeStartDate(
    startDisciplineChallenge(
      {
        ...emptyProject(),
        disciplineMarketSettings: {
          close_time: "17:00",
          close_timezone: "America/New_York",
          auto_finalize_enabled: false,
        },
      },
      5
    )
  );
  const challenge = started.disciplineChallenges[0];
  const withCommitment = addDailyCommitment(started, challenge, { date: "2026-04-28" });
  const withTrade = {
    ...withCommitment,
    disciplineJournalTrades: [tradeFor({ id: "t1", date: "2026-04-28", time: "10:00", outcome: "TP", challengeId: challenge.id })],
  };

  const result = evaluateDisciplineState(withTrade, {
    now: "2026-04-28T22:30:00Z",
  });
  const active = result.project.disciplineChallenges.find((item) => item.status === "ACTIVE");
  const day = result.project.disciplineDays.find((item) => item.trading_day_key === "2026-04-28");
  assert.equal(day?.status, DISCIPLINE_DAY_STATUS.CLEAN);
  assert.equal(active?.completed_clean_days, 1);
});

test("finalization remains idempotent (no duplicate increments)", () => {
  const started = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5));
  const challenge = started.disciplineChallenges[0];
  const withCommitment = addDailyCommitment(started, challenge, { date: "2026-04-28" });
  const withTrade = {
    ...withCommitment,
    disciplineJournalTrades: [tradeFor({ id: "t1", date: "2026-04-28", time: "10:00", outcome: "TP", challengeId: challenge.id })],
  };

  const once = evaluateDisciplineState(withTrade, { now: "2026-04-28T22:30:00Z" });
  const twice = evaluateDisciplineState(once.project, { now: "2026-04-28T22:35:00Z" });
  const activeOnce = once.project.disciplineChallenges.find((item) => item.status === "ACTIVE");
  const activeTwice = twice.project.disciplineChallenges.find((item) => item.status === "ACTIVE");

  assert.equal(activeOnce?.completed_clean_days, 1);
  assert.equal(activeTwice?.completed_clean_days, 1);
});

test("trade exactly at 17:00 New York belongs to next gold trading day", () => {
  const started = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5));
  const challenge = started.disciplineChallenges[0];
  const withTrade = {
    ...started,
    disciplineJournalTrades: [
      tradeFor({ id: "t1700", date: "2026-04-28", time: "17:00:00", outcome: "TP", challengeId: challenge.id }),
    ],
  };

  const result = evaluateDisciplineState(withTrade, { now: "2026-04-28T21:05:00Z" }); // 5:05 PM NY
  const tradeDay = result.project.disciplineDays.find((day) => day.trading_day_key === "2026-04-29");
  assert.equal(tradeDay?.status, DISCIPLINE_DAY_STATUS.PENDING_CLEAN);

  const dayKey = getGoldTradingDay(new Date("2026-04-28T21:00:00Z"), {
    close_time: "17:00",
    close_timezone: "America/New_York",
  }).tradingDayKey;
  assert.equal(dayKey, "2026-04-29");
});

test("NO_TRADE day is shown in main checklist sequence", () => {
  const challenge = {
    id: "c-no-trade",
    target_clean_days: 5,
    start_date: "2026-04-28",
  };
  const allDays = [
    { challenge_id: "c-no-trade", trading_day_key: "2026-04-28", status: "CLEAN" },
    { challenge_id: "c-no-trade", trading_day_key: "2026-04-29", status: "NO_TRADE" },
  ];
  const checklist = getChallengeChecklist(challenge, allDays);

  assert.equal(checklist[0].label, "Clean Trade Day");
  assert.equal(checklist[1].label, "No Trade Day");
});

test("NO_TRADE day counts as successful discipline day for progress and streak", () => {
  const started = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5), "2026-04-28");
  const challenge = started.disciplineChallenges[0];
  const withDays = {
    ...started,
    disciplineDays: [
      {
        challenge_id: challenge.id,
        trading_day_key: "2026-04-28",
        status: "NO_TRADE",
        finalized_at: "2026-04-28T22:00:00Z",
      },
      {
        challenge_id: challenge.id,
        trading_day_key: "2026-04-29",
        status: "CLEAN",
        finalized_at: "2026-04-29T22:00:00Z",
      },
    ],
  };

  const result = evaluateDisciplineState(withDays, { now: "2026-04-29T22:10:00Z" });
  const active = result.project.disciplineChallenges.find((item) => item.id === challenge.id);

  assert.equal(active?.completed_clean_days, 2);
  assert.equal(active?.current_streak, 2);
});

test("recent days are scoped to the current challenge start date", () => {
  let oldProject = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5), "2026-04-20");
  const oldChallenge = oldProject.disciplineChallenges[0];
  oldProject = {
    ...oldProject,
    disciplineJournalTrades: [
      tradeFor({ id: "old-clean", date: "2026-04-20", challengeId: oldChallenge.id }),
    ],
  };
  oldProject = evaluateDisciplineState(oldProject, { now: "2026-04-20T22:30:00Z" }).project;

  const newProject = forceChallengeStartDate(startDisciplineChallenge(oldProject, 5), "2026-05-01");
  const result = evaluateDisciplineState(newProject, { now: "2026-05-01T14:00:00Z" });

  assert.equal(result.recentDays[0]?.tradingDayKey, "2026-05-01");
  assert.equal(result.recentDays.some((day) => day.tradingDayKey === "2026-04-20"), false);
});

test("prepare next run is idempotent (no duplicate scheduled attempts)", () => {
  const started = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5));
  const active = started.disciplineChallenges[0];
  const brokenState = {
    ...started,
    disciplineDays: [
      {
        id: "day-broken",
        project_id: "project-test",
        challenge_id: active.id,
        trade_date: "2026-04-28",
        trading_day_key: "2026-04-28",
        status: "BROKEN",
        trades_count: 2,
        finalized_at: "2026-04-28T18:00:00Z",
      },
    ],
  };

  const first = prepareNextDisciplineRun(brokenState, {
    challengeId: active.id,
    now: "2026-04-28T19:00:00Z", // before NY close
  });
  const second = prepareNextDisciplineRun(first.project, {
    challengeId: active.id,
    now: "2026-04-28T19:01:00Z",
  });

  const prepared = second.project.disciplineChallenges.filter(
    (item) => item.prepared_from_challenge_id === active.id
  );
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].status, "SCHEDULED");
  assert.equal(second.reused, true);
});

test("broken frozen attempt auto-prepares next active run after next gold day starts", () => {
  const started = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5));
  const challenge = started.disciplineChallenges[0];
  const brokenState = {
    ...started,
    disciplineChallenges: [{ ...challenge, status: "BROKEN_FROZEN" }],
    disciplineDays: [
      {
        id: "day-broken-auto",
        project_id: "project-test",
        challenge_id: challenge.id,
        trade_date: "2026-04-28",
        trading_day_key: "2026-04-28",
        status: "BROKEN",
        trades_count: 2,
        finalized_at: "2026-04-28T18:00:00Z",
      },
    ],
  };

  const result = evaluateDisciplineState(brokenState, { now: "2026-04-29T14:00:00Z" }); // 10:00 AM NY, next gold day
  const active = result.project.disciplineChallenges.find((item) => item.status === "ACTIVE");
  const archivedSource = result.project.disciplineChallenges.find(
    (item) => item.id === challenge.id && item.status === "ARCHIVED"
  );
  assert.ok(active);
  assert.ok(archivedSource);
  assert.equal(active?.completed_clean_days, 0);
  assert.equal(active?.current_streak, 0);
});

test("exit challenge archives scheduled, broken frozen, and completed attempts for testing", () => {
  const started = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5));
  const challenge = started.disciplineChallenges[0];

  const scheduledExit = exitDisciplineChallenge({
    ...started,
    disciplineChallenges: [{ ...challenge, status: "SCHEDULED" }],
  });
  assert.equal(scheduledExit.disciplineChallenges[0].status, "ARCHIVED");

  const frozenExit = exitDisciplineChallenge({
    ...started,
    disciplineChallenges: [{ ...challenge, status: "BROKEN_FROZEN" }],
  });
  assert.equal(frozenExit.disciplineChallenges[0].status, "ARCHIVED");

  const completedExit = exitDisciplineChallenge({
    ...started,
    disciplineChallenges: [{ ...challenge, status: "COMPLETED" }],
  });
  assert.equal(completedExit.disciplineChallenges[0].status, "ARCHIVED");
});

test("closeOneTradeRuleDay finalizes NO_TRADE for zero-trade day and increments protected progress", () => {
  const started = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5), "2026-04-28");
  const challenge = started.disciplineChallenges[0];
  const withCommitment = addDailyCommitment(started, challenge, { date: "2026-04-28" });

  const result = closeOneTradeRuleDay(withCommitment, {
    now: "2026-04-28T22:30:00Z",
    closeTradingDayKey: "2026-04-28",
  });

  const closedDay = result.project.disciplineDays.find((day) => day.trading_day_key === "2026-04-28");
  const active = result.project.disciplineChallenges.find((item) => item.status === "ACTIVE");
  assert.equal(closedDay?.status, DISCIPLINE_DAY_STATUS.NO_TRADE);
  assert.equal(active?.completed_clean_days, 1);
  assert.equal(active?.current_streak, 1);
  assert.equal(result.closeDebug?.mode, "auto");
});

test("closeOneTradeRuleDay finalizes CLEAN for exactly one MT5 trade and increments protected progress", () => {
  const started = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5), "2026-04-28");
  const challenge = started.disciplineChallenges[0];
  const withTrade = {
    ...started,
    disciplineJournalTrades: [
      {
        ...tradeFor({
          id: "mt5-clean-1",
          date: "2026-04-28",
          time: "10:00",
          outcome: "Manual",
          challengeId: challenge.id,
        }),
        source: "MT5",
        broker_ticket: "1001",
      },
    ],
  };

  const result = closeOneTradeRuleDay(withTrade, {
    now: "2026-04-28T22:30:00Z",
    closeTradingDayKey: "2026-04-28",
  });

  const closedDay = result.project.disciplineDays.find((day) => day.trading_day_key === "2026-04-28");
  const active = result.project.disciplineChallenges.find((item) => item.status === "ACTIVE");
  assert.equal(closedDay?.status, DISCIPLINE_DAY_STATUS.CLEAN);
  assert.equal(active?.completed_clean_days, 1);
  assert.equal(active?.current_streak, 1);
  assert.equal(result.closeDebug?.normalizedTradeCount, 1);
});

test("closeOneTradeRuleDay finalizes BROKEN for 2+ MT5 trades and does not count protected progress", () => {
  const started = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5), "2026-04-28");
  const challenge = started.disciplineChallenges[0];
  const withTrades = {
    ...started,
    disciplineJournalTrades: [
      {
        ...tradeFor({
          id: "mt5-broken-1",
          date: "2026-04-28",
          time: "10:00",
          outcome: "Manual",
          challengeId: challenge.id,
        }),
        source: "MT5",
        broker_ticket: "2001",
      },
      {
        ...tradeFor({
          id: "mt5-broken-2",
          date: "2026-04-28",
          time: "10:02",
          outcome: "Manual",
          challengeId: challenge.id,
        }),
        source: "MT5",
        broker_ticket: "2002",
      },
    ],
  };

  const result = closeOneTradeRuleDay(withTrades, {
    now: "2026-04-28T22:30:00Z",
    closeTradingDayKey: "2026-04-28",
  });

  const closedDay = result.project.disciplineDays.find((day) => day.trading_day_key === "2026-04-28");
  const frozen = result.project.disciplineChallenges.find((item) => item.status === "BROKEN_FROZEN");
  assert.equal(closedDay?.status, DISCIPLINE_DAY_STATUS.BROKEN);
  assert.equal(frozen?.completed_clean_days, 0);
  assert.equal(frozen?.current_streak, 0);
  assert.equal(result.closeDebug?.normalizedTradeCount >= 2, true);
});

test("closeOneTradeRuleDay is idempotent when run multiple times for the same day", () => {
  const started = forceChallengeStartDate(startDisciplineChallenge(emptyProject(), 5), "2026-04-28");
  const challenge = started.disciplineChallenges[0];
  const withTrade = {
    ...started,
    disciplineJournalTrades: [tradeFor({ id: "idem-1", date: "2026-04-28", time: "10:00", outcome: "TP", challengeId: challenge.id })],
  };

  const once = closeOneTradeRuleDay(withTrade, {
    now: "2026-04-28T22:30:00Z",
    closeTradingDayKey: "2026-04-28",
  });
  const twice = closeOneTradeRuleDay(once.project, {
    now: "2026-04-28T22:35:00Z",
    closeTradingDayKey: "2026-04-28",
  });

  const days = twice.project.disciplineDays.filter((day) => day.trading_day_key === "2026-04-28");
  const active = twice.project.disciplineChallenges.find((item) => item.status === "ACTIVE");
  assert.equal(days.length, 1);
  assert.equal(active?.completed_clean_days, 1);
  assert.equal(active?.current_streak, 1);
});
