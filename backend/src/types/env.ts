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
  GOOGLE_SHEETS_URL?: any;
}
