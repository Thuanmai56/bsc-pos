import { Env } from '../types/env';
import { json, corsHeaders } from '../utils/http';

export async function debugKV(env: Env, url: URL): Promise<Response> {
  const targetKey = url.searchParams.get("key");
  if (targetKey) {
    const val = await env.ORDER_STATE.get(targetKey);
    return new Response(val || "Not found", { headers: corsHeaders() });
  }

  const d1OrdersCount = await env.DB ? await env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE tenant_id = ?").bind("bsc").first<{ count: number }>().catch(() => ({ count: 0 })) : { count: 0 };

  let list: any = { keys: [], list_complete: true };
  try {
    list = await env.ORDER_STATE.list({ prefix: "order:" });
  } catch (e) {
    console.error("KV List Error in Debug", e);
  }

  return json({
    d1_bsc_orders_count: d1OrdersCount?.count || 0,
    total_orders_in_first_1000_kv: list.keys.length,
    list_complete_kv: list.list_complete,
    keys_kv: list.keys.map((k: any) => k.name)
  });
}
