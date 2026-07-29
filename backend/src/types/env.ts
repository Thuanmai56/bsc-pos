export interface Env {
  // Bindings
  ORDER_STATE: KVNamespace;
  DB: D1Database;

  // Secrets & Env Variables
  LINE_CHANNEL_TOKEN?: any;
  LINE_CHANNEL_ACCESS_TOKEN?: any;
  LIFF_ID?: any;
  LIFF_URL?: any;
  OPENROUTER_API_KEY?: any;
  OPENROUTER_MODEL?: any;
  GROQ_API_KEY?: any;
  GROQ_MODEL?: string;
  GOOGLE_SHEETS_URL?: any;
  ALERT_RICH_MENU_ID?: any;
}
