#property strict

input string ApiUrl = "https://afimhpcikalyeamarmlu.supabase.co/functions/v1/mt5-import";
input string ApiKey = "";
input int SyncEverySeconds = 60;
input int DaysBack = 30;

string g_keyPrefix = "";

string EscapeJson(string text)
{
   StringReplace(text, "\\", "\\\\");
   StringReplace(text, "\"", "\\\"");
   StringReplace(text, "\n", "\\n");
   StringReplace(text, "\r", "\\r");
   StringReplace(text, "\t", "\\t");
   return text;
}

string ToIso8601(datetime ts)
{
   string s = TimeToString(ts, TIME_DATE | TIME_SECONDS); // yyyy.mm.dd hh:mm:ss
   StringReplace(s, ".", "-");
   StringReplace(s, " ", "T");
   return s + "Z";
}

bool IsSent(string ticket)
{
   string key = g_keyPrefix + ticket;
   return GlobalVariableCheck(key);
}

void MarkSent(string ticket)
{
   string key = g_keyPrefix + ticket;
   GlobalVariableSet(key, (double)TimeCurrent());
}

bool FindOpenDeal(long positionId, datetime closeTime, datetime &openTime, double &openPrice, string &openDirection)
{
   int total = HistoryDealsTotal();
   datetime bestTime = 0;
   bool found = false;

   for(int i = 0; i < total; i++)
   {
      ulong dTicket = HistoryDealGetTicket(i);
      if(dTicket == 0) continue;

      long posId = (long)HistoryDealGetInteger(dTicket, DEAL_POSITION_ID);
      if(posId != positionId) continue;

      long entryType = (long)HistoryDealGetInteger(dTicket, DEAL_ENTRY);
      if(entryType != DEAL_ENTRY_IN) continue;

      datetime t = (datetime)HistoryDealGetInteger(dTicket, DEAL_TIME);
      if(t > closeTime) continue;

      if(!found || t < bestTime)
      {
         found = true;
         bestTime = t;
         openTime = t;
         openPrice = HistoryDealGetDouble(dTicket, DEAL_PRICE);
         long dealType = (long)HistoryDealGetInteger(dTicket, DEAL_TYPE);
         openDirection = (dealType == DEAL_TYPE_BUY) ? "BUY" : "SELL";
      }
   }

   return found;
}

bool SendTradeJson(string payload)
{
   char postData[];
   char result[];
   string responseHeaders;
   string headers = "Content-Type: application/json\r\n";

   int payloadLen = StringToCharArray(payload, postData, 0, StringLen(payload), CP_UTF8);
   if(payloadLen <= 0)
      return false;

   ResetLastError();
   int code = WebRequest("POST", ApiUrl, headers, 10000, postData, result, responseHeaders);
   int err = GetLastError();

   if(code == -1)
   {
      Print("MT5 Auto Sync: WebRequest failed. Error=", err, ". Check allowed URL and internet access.");
      return false;
   }

   string body = CharArrayToString(result, 0, -1, CP_UTF8);
   Print("MT5 Auto Sync: HTTP=", code, " Response=", body);

   if(code >= 200 && code < 300)
   {
      if(StringFind(body, "\"status\":\"inserted\"") >= 0 || StringFind(body, "\"status\":\"duplicate\"") >= 0)
         return true;
   }

   return false;
}

void SyncClosedDeals()
{
   if(StringLen(ApiKey) == 0)
   {
      Print("MT5 Auto Sync: ApiKey is empty.");
      return;
   }

   datetime toTime = TimeCurrent();
   datetime fromTime = toTime - (DaysBack * 86400);

   if(!HistorySelect(fromTime, toTime))
   {
      Print("MT5 Auto Sync: HistorySelect failed.");
      return;
   }

   string accountNumber = (string)AccountInfoInteger(ACCOUNT_LOGIN);
   int total = HistoryDealsTotal();

   for(int i = 0; i < total; i++)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket == 0) continue;

      string ticket = (string)dealTicket;
      if(IsSent(ticket)) continue;

      long entryType = (long)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      if(entryType != DEAL_ENTRY_OUT) continue; // closed deals only

      long dealType = (long)HistoryDealGetInteger(dealTicket, DEAL_TYPE);
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue; // skip balance/deposit/credit

      string symbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
      if(StringLen(symbol) == 0) continue;

      datetime closeTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
      double closePrice = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
      double lotSize = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
      double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
      double commission = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
      double swap = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
      string comment = HistoryDealGetString(dealTicket, DEAL_COMMENT);
      long positionId = (long)HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);

      datetime openTime = closeTime;
      double entryPrice = closePrice;
      string direction = (dealType == DEAL_TYPE_BUY) ? "BUY" : "SELL";

      datetime foundOpenTime;
      double foundEntryPrice;
      string foundDirection;
      if(FindOpenDeal(positionId, closeTime, foundOpenTime, foundEntryPrice, foundDirection))
      {
         openTime = foundOpenTime;
         entryPrice = foundEntryPrice;
         direction = foundDirection;
      }

      string payload = "{"
         "\"apiKey\":\"" + EscapeJson(ApiKey) + "\","
         "\"accountNumber\":\"" + EscapeJson(accountNumber) + "\","
         "\"ticket\":\"" + EscapeJson(ticket) + "\","
         "\"symbol\":\"" + EscapeJson(symbol) + "\","
         "\"direction\":\"" + EscapeJson(direction) + "\","
         "\"openTime\":\"" + EscapeJson(ToIso8601(openTime)) + "\","
         "\"closeTime\":\"" + EscapeJson(ToIso8601(closeTime)) + "\","
         "\"entryPrice\":" + DoubleToString(entryPrice, 8) + ","
         "\"closePrice\":" + DoubleToString(closePrice, 8) + ","
         "\"lotSize\":" + DoubleToString(lotSize, 2) + ","
         "\"profit\":" + DoubleToString(profit, 2) + ","
         "\"commission\":" + DoubleToString(commission, 2) + ","
         "\"swap\":" + DoubleToString(swap, 2) + ","
         "\"comment\":\"" + EscapeJson(comment) + "\""
      "}";

      if(SendTradeJson(payload))
      {
         MarkSent(ticket);
      }
   }
}

int OnInit()
{
   g_keyPrefix = "MT5SYNC_" + (string)AccountInfoInteger(ACCOUNT_LOGIN) + "_";
   EventSetTimer(MathMax(5, SyncEverySeconds));

   Print("MT5 Auto Sync initialized.");
   Print("Remember: MT5 -> Tools -> Options -> Expert Advisors -> Allow WebRequest for: ", ApiUrl);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
{
   SyncClosedDeals();
}
