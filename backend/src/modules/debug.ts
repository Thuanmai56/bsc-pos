import { Env } from '../types/env';
import { json, corsHeaders } from '../utils/http';
import { ORDER_INDEX_LATEST, MAX_INDEX } from './orders';

export async function debugKV(env: Env, url: URL): Promise<Response> {
  const targetKey = url.searchParams.get("key");
  if (targetKey) {
    const val = await env.ORDER_STATE.get(targetKey);
    return new Response(val || "Not found", { headers: corsHeaders() });
  }

  const rebuild = url.searchParams.get("rebuild");
  if (rebuild === "1") {
    try {
      // 1. List all keys in KV with prefix "order:"
      let allKeys: string[] = [];
      let cursor = "";
      while (true) {
        const listRes = await env.ORDER_STATE.list({ prefix: "order:", cursor });
        allKeys.push(...listRes.keys.map(k => k.name.replace("order:", "")));
        if (listRes.list_complete || !listRes.cursor) break;
        cursor = listRes.cursor;
      }

      // 2. Sort keys descending so newest are first
      allKeys.sort((a, b) => {
        const matchA = a.match(/^B(?:D)?(\d{4})(?:-(\d{4}))?/);
        const matchB = b.match(/^B(?:D)?(\d{4})(?:-(\d{4}))?/);
        if (matchA && matchB) {
          const dateA = matchA[1];
          const dateB = matchB[1];
          if (dateA !== dateB) return dateB.localeCompare(dateA);
          const timeA = matchA[2] || "";
          const timeB = matchB[2] || "";
          return timeB.localeCompare(timeA);
        }
        return b.localeCompare(a);
      });

      // Keep only up to MAX_INDEX (200)
      const newIndex = allKeys.slice(0, MAX_INDEX);

      // 3. Write new index to ORDER_INDEX_LATEST
      await env.ORDER_STATE.put(ORDER_INDEX_LATEST, JSON.stringify(newIndex));

      // 4. Fetch the first 30 orders to rebuild the cache
      const maxRebuild = 30;
      const keysToFetch = newIndex.slice(0, maxRebuild);
      const promises = keysToFetch.map(k => env.ORDER_STATE.get(`order:${k}`).then(raw => {
        if (raw) { try { return JSON.parse(raw); } catch { } }
        return null;
      }));
      const results = await Promise.all(promises);
      const rebuiltOrders = results.filter(Boolean);
      rebuiltOrders.sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));

      // Write to cache
      await env.ORDER_STATE.put("order_view:cache", JSON.stringify(rebuiltOrders));

      return json({
        success: true,
        message: `Successfully rebuilt index and cache with ${newIndex.length} keys.`,
        index: newIndex.slice(0, 10),
        cache: rebuiltOrders.map(o => o.key)
      });
    } catch (err: any) {
      return json({ success: false, error: err.message }, 500);
    }
  }

  let list: any = { keys: [], list_complete: true };
  try {
    list = await env.ORDER_STATE.list({ prefix: "order:" });
  } catch (e) {
    console.error("KV List Error in Debug", e);
  }

  const index = await env.ORDER_STATE.get(ORDER_INDEX_LATEST);
  const cache = await env.ORDER_STATE.get("order_view:cache");
  const lastSaveError = await env.ORDER_STATE.get("last_save_error");

  return json({
    total_orders_in_first_1000: list.keys.length,
    list_complete: list.list_complete,
    cursor: list.cursor,
    keys: list.keys.map((k: any) => k.name),
    index: index ? JSON.parse(index) : null,
    cache: cache ? JSON.parse(cache).map((o: any) => o.key) : null,
    last_save_error: lastSaveError ? JSON.parse(lastSaveError) : null,
    error: list.keys.length === 0 ? "KV list() limit exceeded for the day" : null
  });
}
