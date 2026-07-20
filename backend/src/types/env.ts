export interface Env {
  // Bindings
  ORDER_STATE: KVNamespace;
  DB: D1Database;

  // Secrets & Env Variables
  LINE_CHANNEL_TOKEN?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LIFF_ID?: string;
  LIFF_URL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  GOOGLE_SHEETS_URL?: string;
}
