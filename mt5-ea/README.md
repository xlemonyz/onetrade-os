# MT5 Auto Sync EA

This EA sends **closed MT5 trades** to your Supabase Edge Function (`mt5-import`) on a timer.

## Files

- `MT5AutoSyncEA.mq5`

## EA Inputs

- `ApiUrl` (example: `https://YOUR_PROJECT.functions.supabase.co/mt5-import`)
- `ApiKey` (from your web app Account Settings -> MT5 Auto Sync)
- `SyncEverySeconds` (default 60)
- `DaysBack` (default 30)

## Setup Steps

1. Open MetaEditor and compile `MT5AutoSyncEA.mq5`.
2. Attach EA to any chart.
3. Fill `ApiUrl` and `ApiKey`.
4. Enable **Algo Trading**.
5. In MT5: `Tools > Options > Expert Advisors > Allow WebRequest for listed URL`.
6. Add your function URL (`https://<project-ref>.functions.supabase.co/mt5-import`).
7. Keep MT5 running (or run MT5 on VPS for 24/7 sync).

## Notes

- EA only sends **closed trade deals** (`DEAL_ENTRY_OUT`), not deposit/withdrawal records.
- Duplicate tickets are avoided by:
  - Local sent-ticket memory (`GlobalVariable`)
  - Backend duplicate guard (`user_id + account_number + ticket`)
