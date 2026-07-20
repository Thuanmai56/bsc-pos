import { Env } from '../types/env';
import { Order } from '../types/index';
import { json } from '../utils/http';
import { syncToGoogleSheets } from '../integrations/googleSheets';
import { pushLineMessage } from './line';

export const ORDER_INDEX_LATEST = "order_index:latest";
export const MAX_INDEX = 200;

export async function createOrder(request: Request, env: Env): Promise<Response> {
  const data: any = await request.json();

  // Taiwan time UTC+8
  const nowTaiwan = new Date(Date.now() + 8 * 3600000);
  const mm = String(nowTaiwan.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(nowTaiwan.getUTCDate()).padStart(2, "0");
  const dateStr = `${mm}${dd}`; // MMDD

  const tempRandomId = Math.floor(1000 + Math.random() * 9000);
  const orderKey = data.orderId || data.key || `B${dateStr}-${tempRandomId}`;

  const order: Order = {
    key: orderKey,
    customer: data.customer || "顧客",
    time: data.time,
    content: data.content,
    status: "NEW",
    createdAt: Date.now(),
    userId: data.userId,
    total: data.total,
    reason: data.reason || "",
    note: data.note || ""
  };

  await saveOrder(env, order);

  if (order.userId) {
    try {
      await pushLineMessage(order.userId, "感謝您的訂單！餐點製作完成後，我們會再次通知您前來取餐，謝謝！", env);
    } catch (e) {
      console.error("[Benmi] Failed to send order creation message:", e);
    }
  }

  return json({ success: true, key: orderKey });
}

// Logic help for pending states: Stores as object { [orderKey]: question } to avoid overwriting
export async function getPendingMap(env: Env, userId: string): Promise<Record<string, any>> {
  const raw = await env.ORDER_STATE.get(`pending:${userId}`);
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    // Compatibility: If it's an old style single object, convert it
    if (data.orderKey && !data[data.orderKey]) {
      return { [data.orderKey]: data };
    }
    return data;
  } catch { return {}; }
}

export async function updateOrder(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const data: any = await request.json();
  const raw = await env.ORDER_STATE.get(`order:${data.key}`);
  if (!raw) return json({ error: "order not found" }, 404);

  const order: Order = JSON.parse(raw);
  const incoming = data.status;

  if (data.reason !== undefined) order.reason = data.reason;
  if (data.note !== undefined) order.note = data.note;

  // Employee 接單
  if (incoming === "ACCEPTED") {
    if (order.status === "ACCEPTED" || order.status === "DONE" || order.status === "PICKED_UP") {
      await saveOrder(env, order); // Sync cache
      return json({ success: true });
    }
    const wasWaiting = order.status && order.status.startsWith("WAITING");
    order.status = "ACCEPTED";
    await saveOrder(env, order);

    if (order.userId) {
      try {
        const pMap = await getPendingMap(env, order.userId);
        if (pMap[order.key]) {
          delete pMap[order.key];
          await env.ORDER_STATE.put(`pending:${order.userId}`, JSON.stringify(pMap));
        }
      } catch { }
      if (!wasWaiting) {
        await pushLineMessage(order.userId, `干城鹹水雞 已收到您的訂單 #${order.key}，謝謝您！`, env);
      }
    }
    return json({ success: true });
  }

  // Employee 準備好了
  if (incoming === "DONE") {
    if (order.status === "DONE" || order.status === "PICKED_UP") {
      await saveOrder(env, order); // Sync cache
      return json({ success: true });
    }
    order.status = "DONE";
    await saveOrder(env, order);

    if (order.userId) {
      try {
        await pushLineMessage(order.userId, "您的餐點已準備完成，請至櫃檯取餐，謝謝！", env);
      } catch (e) {
        console.error("[BSC] Failed to send order ready message:", e);
      }
    }

    return json({ success: true });
  }

  // Employee 需要更改 -> 等客戶「同意/取消」
  if (incoming === "CHANGED") {
    order.status = "WAITING_CUSTOMER_CHANGE";
    await saveOrder(env, order);

    if (order.userId) {
      let notifyText = "";
      if (order.reason === "時間需調整") {
        const t = order.note || "稍後";
        notifyText = `時間有點趕，請問可以改成${t}嗎？\n\n(回覆「好 / 同意」以確認，或回覆「不要了」取消訂單)`;
      } else if (order.reason === "口味售完") {
        const items = (order.note || "").split(",");
        let joinedItems = items[0] || "";
        if (items.length === 2) {
          joinedItems = items.join("跟");
        } else if (items.length > 2) {
          joinedItems = items.slice(0, -1).join("、") + "跟" + items[items.length - 1];
        }
        notifyText = `不好意思 ${joinedItems}我們現在賣完了，請問可以幫您換別的嗎？`;
      } else {
        const reason = order.reason || "未提供原因";
        const note = order.note || "";
        notifyText =
          `干城鹹水雞 已收到您的訂單 #${order.key}，需要做小幅調整。\n` +
          `原因：${reason}\n` +
          (note ? `備註：${note}\n` : "") +
          `\n請回覆「同意」以接受變更，或回覆「取消 / 不要了」以取消訂單。`;
      }

      const pMap = await getPendingMap(env, order.userId);
      pMap[order.key] = { orderKey: order.key, type: "CHANGE", createdAt: Date.now(), questionText: notifyText, reason: order.reason, note: order.note };
      await env.ORDER_STATE.put(`pending:${order.userId}`, JSON.stringify(pMap));

      await pushLineMessage(order.userId, notifyText, env);
    }

    return json({ success: true });
  }

  // Employee 無法接單 -> 等客戶「同意/不同意」
  if (incoming === "REJECTED") {
    const isAlreadyAccepted = order.status === "ACCEPTED" || order.status === "DONE" || order.status === "PICKED_UP";
    const isNoReplyReason = order.reason === "取消並不回復客戶" || order.reason === "取消並不回覆客戶";

    if (isAlreadyAccepted || isNoReplyReason) {
      order.status = "REJECTED";
      await saveOrder(env, order);
      if (ctx && ctx.waitUntil) ctx.waitUntil(syncToGoogleSheets(order, env));
      return json({ success: true });
    }

    order.status = "WAITING_CUSTOMER_REJECT";
    await saveOrder(env, order);

    if (order.userId) {
      const reason = order.reason || "未提供原因";
      const notifyText =
        `非常抱歉！干城鹹水雞 目前無法接下您的訂單 #${order.key}。\n` +
        `原因：${reason}\n` +
        `\n請回覆「同意」以取消訂單，或回覆「不同意」以重新確認。`;

      const pMap = await getPendingMap(env, order.userId);
      pMap[order.key] = { orderKey: order.key, type: "REJECT", createdAt: Date.now(), questionText: notifyText, reason: order.reason, note: order.note };
      await env.ORDER_STATE.put(`pending:${order.userId}`, JSON.stringify(pMap));

      await pushLineMessage(order.userId, notifyText, env);
    }

    return json({ success: true });
  }

  // Employee 強制取消 (Quá lâu khách không rep -> Nhấn Hủy trực tiếp)
  if (incoming === "FORCE_REJECT") {
    order.status = "REJECTED";
    await saveOrder(env, order);

    if (order.userId) {
      try {
        const pMap = await getPendingMap(env, order.userId);
        if (pMap[order.key]) {
          delete pMap[order.key];
          await env.ORDER_STATE.put(`pending:${order.userId}`, JSON.stringify(pMap));
        }
      } catch { }
      await pushLineMessage(order.userId, `干城鹹水雞：由於未收到您的回覆，訂單 #${order.key} 已自動取消。期待下次為您服務！`, env);
    }

    if (ctx && ctx.waitUntil) ctx.waitUntil(syncToGoogleSheets(order, env));
    return json({ success: true });
  }

  // Employee 已取餐 (Không gửi thêm thông báo để tiết kiệm LINE API quota)
  if (incoming === "PICKED_UP") {
    if (order.status === "PICKED_UP") {
      await saveOrder(env, order); // Sync cache
      return json({ success: true });
    }
    order.status = "PICKED_UP";
    await saveOrder(env, order);

    if (ctx && ctx.waitUntil) ctx.waitUntil(syncToGoogleSheets(order, env));
    return json({ success: true });
  }

  // Các trạng thái kết thúc khác
  order.status = incoming;
  await saveOrder(env, order);

  return json({ success: true });
}

export async function getOrders(env: Env): Promise<Response> {
  const cacheRaw = await env.ORDER_STATE.get("order_view:cache");
  let orders: Order[] = [];
  try { orders = cacheRaw ? JSON.parse(cacheRaw) : []; } catch { orders = []; }

  if (orders.length > 0) {
    return json(orders);
  }

  // Fallback: Rebuild Cache if empty
  const indexRaw = await env.ORDER_STATE.get(ORDER_INDEX_LATEST);
  let keys: string[] = [];
  try { keys = indexRaw ? JSON.parse(indexRaw) : []; } catch { keys = []; }

  if (!Array.isArray(keys) || keys.length === 0) return json([]);

  const promises = keys.map(k => env.ORDER_STATE.get(`order:${k}`).then(raw => {
    if (raw) { try { return JSON.parse(raw) as Order; } catch { } }
    return null;
  }));

  const results = await Promise.all(promises);
  orders = results.filter(Boolean) as Order[];
  orders.sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));

  if (orders.length > 0) {
    await env.ORDER_STATE.put("order_view:cache", JSON.stringify(orders));
  }

  return json(orders);
}

export async function saveOrder(env: Env, order: Order): Promise<void> {
  // 1. Single source of truth
  await env.ORDER_STATE.put(`order:${order.key}`, JSON.stringify(order));

  // 2. Index Keys
  const indexRaw = await env.ORDER_STATE.get(ORDER_INDEX_LATEST);
  let keys: string[] = [];
  try { keys = indexRaw ? JSON.parse(indexRaw) : []; } catch { keys = []; }
  if (!Array.isArray(keys)) keys = [];
  if (!keys.includes(order.key)) keys.unshift(order.key);
  keys = keys.filter(Boolean);
  keys = [...new Set(keys)].slice(0, MAX_INDEX);
  await env.ORDER_STATE.put(ORDER_INDEX_LATEST, JSON.stringify(keys));

  // 3. Cache latest View Data (Safe merge)
  const cacheRaw = await env.ORDER_STATE.get("order_view:cache");
  let orders: Order[] = [];
  try { orders = cacheRaw ? JSON.parse(cacheRaw) : []; } catch { orders = []; }

  if (!cacheRaw || orders.length === 0) {
    await env.ORDER_STATE.delete("order_view:cache");
    return;
  }

  const idx = orders.findIndex(o => o.key === order.key);
  if (idx >= 0) {
    orders[idx] = order;
  } else {
    orders.unshift(order);
  }

  orders = orders.filter(Boolean).slice(0, MAX_INDEX);
  orders.sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));
  await env.ORDER_STATE.put("order_view:cache", JSON.stringify(orders));
}
