import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeDirection(value: unknown) {
  const text = String(value || "").toUpperCase().trim();
  if (text === "BUY" || text === "SELL") return text;
  return "";
}

function asFiniteNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asPriceText(value: number | null) {
  if (value === null) return "";
  return String(value);
}

function toDateAndTime(isoLike: string) {
  const parsed = new Date(isoLike);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" };

  const date = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  const time = `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { ok: false, error: "Server secrets are missing" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { ok: false, error: "Invalid JSON body" });
  }

  const apiKey = String(payload.apiKey || "").trim();
  const accountNumber = String(payload.accountNumber || "").trim();
  const ticket = String(payload.ticket || "").trim();
  const symbol = String(payload.symbol || "").trim();
  const direction = normalizeDirection(payload.direction);
  const openTime = String(payload.openTime || "").trim();
  const closeTime = String(payload.closeTime || "").trim();
  const entryPrice = asFiniteNumber(payload.entryPrice);
  const closePrice = asFiniteNumber(payload.closePrice);
  const lotSize = asFiniteNumber(payload.lotSize);
  const profit = asFiniteNumber(payload.profit) ?? 0;
  const commission = asFiniteNumber(payload.commission) ?? 0;
  const swap = asFiniteNumber(payload.swap) ?? 0;
  const comment = String(payload.comment || "").trim();

  const requiredMissing = [];
  if (!apiKey) requiredMissing.push("apiKey");
  if (!accountNumber) requiredMissing.push("accountNumber");
  if (!ticket) requiredMissing.push("ticket");
  if (!symbol) requiredMissing.push("symbol");
  if (!direction) requiredMissing.push("direction");
  if (!openTime) requiredMissing.push("openTime");
  if (!closeTime) requiredMissing.push("closeTime");
  if (entryPrice === null) requiredMissing.push("entryPrice");
  if (closePrice === null) requiredMissing.push("closePrice");
  if (lotSize === null) requiredMissing.push("lotSize");

  if (requiredMissing.length) {
    return jsonResponse(400, {
      ok: false,
      error: `Missing or invalid fields: ${requiredMissing.join(", ")}`,
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: connection, error: connectionError } = await supabase
    .from("broker_connections")
    .select("id, user_id, account_number, broker_name, platform")
    .eq("api_key", apiKey)
    .maybeSingle();

  if (connectionError) {
    return jsonResponse(500, { ok: false, error: connectionError.message });
  }

  if (!connection) {
    return jsonResponse(401, { ok: false, error: "Invalid API key" });
  }

  const userId = connection.user_id;
  if (!userId) {
    return jsonResponse(401, { ok: false, error: "Connection has no user" });
  }

  const existingAccountNumber = String(connection.account_number || "").trim();
  if (existingAccountNumber && existingAccountNumber !== accountNumber) {
    return jsonResponse(403, { ok: false, error: "Account number mismatch for this API key" });
  }

  if (!existingAccountNumber) {
    const { error: setAccountError } = await supabase
      .from("broker_connections")
      .update({ account_number: accountNumber })
      .eq("id", connection.id);
    if (setAccountError) {
      return jsonResponse(500, { ok: false, error: setAccountError.message });
    }
  }

  const { data: duplicateRow, error: duplicateCheckError } = await supabase
    .from("trades")
    .select("id")
    .eq("user_id", userId)
    .eq("broker_account_number", accountNumber)
    .eq("broker_ticket", ticket)
    .limit(1)
    .maybeSingle();

  if (duplicateCheckError) {
    return jsonResponse(500, { ok: false, error: duplicateCheckError.message });
  }

  if (duplicateRow) {
    await supabase.from("broker_connections").update({ last_sync_at: new Date().toISOString() }).eq("id", connection.id);
    return jsonResponse(200, { ok: true, status: "duplicate" });
  }

  const { data: existingProjectRows, error: projectLookupError } = await supabase
    .from("projects")
    .select("id, name, data")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (projectLookupError) {
    return jsonResponse(500, { ok: false, error: projectLookupError.message });
  }

  let projectId = existingProjectRows?.[0]?.id || "";
  if (!projectId) {
    const nowIso = new Date().toISOString();
    const localProjectId = `project-mt5-${Date.now()}`;
    const defaultProjectData = {
      id: localProjectId,
      name: "MT5 Auto Sync",
      presetId: "custom",
      balance: "5000",
      dailyDrawdown: "",
      maxDrawdown: "",
      profitTarget: "",
      phase2Balance: "5000",
      phase2DailyDrawdown: "",
      phase2MaxDrawdown: "",
      phase2ProfitTarget: "",
      createdAt: nowIso,
      trades: [],
    };

    const { data: insertedProject, error: createProjectError } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        name: "MT5 Auto Sync",
        data: defaultProjectData,
      })
      .select("id")
      .single();

    if (createProjectError) {
      return jsonResponse(500, { ok: false, error: createProjectError.message });
    }

    projectId = insertedProject.id;
  }

  const { date, time } = toDateAndTime(closeTime);
  if (!date || !time) {
    return jsonResponse(400, { ok: false, error: "Invalid closeTime format" });
  }

  const netPnl = profit + commission + swap;
  const tradeId = `trade-mt5-${accountNumber}-${ticket}`;
  const tradeData = {
    id: tradeId,
    date,
    time,
    phase: "phase1",
    pair: symbol,
    session: "Broker Import",
    direction,
    preScreenshot: "",
    setup: "MT5 Auto Sync",
    entryPrice: asPriceText(entryPrice),
    lotSize: String(lotSize),
    slPrice: "",
    tpPrice: "",
    riskReward: "",
    tradePlan: comment ? `Imported from MT5 EA\nComment: ${comment}` : "Imported from MT5 EA",
    postScreenshot: "",
    outcome: "Manual",
    closePrice: asPriceText(closePrice),
    pnl: netPnl.toFixed(2),
    mindsetBefore: [],
    mindsetDuring: [],
    mindsetAfter: [],
    whatWentWell: "",
    whatWentWrong: "",
    lesson: "",
    rating: 0,
    brokerTicket: ticket,
    brokerAccountNumber: accountNumber,
    brokerSource: "MT5",
    importedAt: new Date().toISOString(),
    mt5OpenTime: openTime,
    mt5CloseTime: closeTime,
    mt5Profit: profit,
    mt5Commission: commission,
    mt5Swap: swap,
    mt5Comment: comment,
  };

  const { error: insertTradeError } = await supabase.from("trades").insert({
    user_id: userId,
    project_id: projectId,
    data: tradeData,
    broker_ticket: ticket,
    broker_account_number: accountNumber,
    broker_source: "MT5",
    imported_at: new Date().toISOString(),
  });

  if (insertTradeError) {
    const lower = String(insertTradeError.message || "").toLowerCase();
    if (insertTradeError.code === "23505" || lower.includes("duplicate")) {
      await supabase.from("broker_connections").update({ last_sync_at: new Date().toISOString() }).eq("id", connection.id);
      return jsonResponse(200, { ok: true, status: "duplicate" });
    }
    return jsonResponse(500, { ok: false, error: insertTradeError.message });
  }

  const { error: syncUpdateError } = await supabase
    .from("broker_connections")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", connection.id);

  if (syncUpdateError) {
    return jsonResponse(500, { ok: false, error: syncUpdateError.message });
  }

  return jsonResponse(200, { ok: true, status: "inserted" });
});
