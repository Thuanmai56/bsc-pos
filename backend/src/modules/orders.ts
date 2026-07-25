import { Env } from '../types/env';
import { Order } from '../types/index';
import { json } from '../utils/http';
import { syncToGoogleSheets } from '../integrations/googleSheets';
import { pushLineMessage } from './line';

export const MAX_INDEX = 200;

export async function createOrder(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
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

  // Push confirmation message to LINE user asynchronously
  if (order.userId) {
    let confirmText = `✅ [已收到] 訂單編號：${order.key}\n📦 訂單內容：\n${order.content}\n\n🕒 取餐時間：${order.time}`;
    if (order.note) confirmText += `\n📝 總備註：${order.note}`;
    confirmText += `\n💰 總金額：$${order.total}`;

    const sendPush = async () => {
      try {
        await pushLineMessage(order.userId!, confirmText, env);
      } catch (e) {
        console.error(`[BSC] createOrder pushLineMessage Error:`, e);
      }
    };

    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(sendPush());
    } else {
      await sendPush();
    }
  }

  return json({ success: true, key: orderKey });
}

// Logic help for pending states: Stores as object { [orderKey]: question } to avoid overwriting
export async function getPendingMap(env: Env, userId: string): Promise<Record<string, any>> {
  if (!env.DB) return {};
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM pending_actions WHERE tenant_id = ? AND user_id = ?"
    ).bind("bsc", userId).all<any>();

    const map: Record<string, any> = {};
    if (results && Array.isArray(results)) {
      for (const row of results as any[]) {
        map[row.order_key] = {
          orderKey: row.order_key,
          type: row.action_type,
          createdAt: row.created_at ? new Date(row.created_at + "Z").getTime() : Date.now(),
          questionText: row.question_text,
          reason: row.reason || "",
          note: row.note || ""
        };
      }
    }
    return map;
  } catch (e) {
    console.error("[getPendingMap] failed:", e);
    return {};
  }
}

export async function getOrder(env: Env, orderKey: string): Promise<Order | null> {
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare(
      "SELECT * FROM orders WHERE key = ?"
    ).bind(orderKey).first<any>();
    if (!row) return null;
    return {
      key: row.key,
      customer: row.customer_name,
      time: row.pickup_time,
      content: row.order_content,
      status: row.status,
      createdAt: new Date(row.created_at + "Z").getTime(),
      userId: row.user_id || undefined,
      total: row.total_amount,
      reason: row.reason || "",
      note: row.note || ""
    };
  } catch (e) {
    console.error("[getOrder] D1 error:", e);
    return null;
  }
}

export async function updateOrder(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const data: any = await request.json();
  const order = await getOrder(env, data.key);
  if (!order) return json({ error: "order not found" }, 404);

  const incoming = data.status;

  if (data.reason !== undefined) order.reason = data.reason;
  if (data.note !== undefined) order.note = data.note;

  // Employee 接單
  if (incoming === "ACCEPTED") {
    if (order.status === "ACCEPTED" || order.status === "DONE" || order.status === "PICKED_UP") {
      await saveOrder(env, order);
      return json({ success: true });
    }
    const wasWaiting = order.status && order.status.startsWith("WAITING");
    order.status = "ACCEPTED";
    await saveOrder(env, order);

    if (order.userId) {
      if (env.DB) {
        try {
          await env.DB.prepare(
            "DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ? AND order_key = ?"
          ).bind("bsc", order.userId, order.key).run();
        } catch { }
      }
      if (!wasWaiting) {
        await pushLineMessage(order.userId, `干城鹹水雞 已收到您的訂單 #${order.key}，謝謝您！`, env);
      }
    }
    return json({ success: true });
  }

  // Employee 準備好了
  if (incoming === "DONE") {
    if (order.status === "DONE" || order.status === "PICKED_UP") {
      await saveOrder(env, order);
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

      if (env.DB) {
        await env.DB.prepare(
          `INSERT INTO pending_actions (tenant_id, user_id, order_key, action_type, question_text, reason, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(tenant_id, user_id, order_key) DO UPDATE SET
             action_type = excluded.action_type,
             question_text = excluded.question_text,
             reason = excluded.reason,
             note = excluded.note,
             created_at = CURRENT_TIMESTAMP`
        ).bind("bsc", order.userId, order.key, "CHANGE", notifyText, order.reason || "", order.note || "").run();
      }

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

      // Clean up pending action when rejecting
      if (order.userId && env.DB) {
        try {
          await env.DB.prepare(
            "DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ? AND order_key = ?"
          ).bind("bsc", order.userId, order.key).run();
        } catch { }
      }

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

      if (env.DB) {
        await env.DB.prepare(
          `INSERT INTO pending_actions (tenant_id, user_id, order_key, action_type, question_text, reason, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(tenant_id, user_id, order_key) DO UPDATE SET
             action_type = excluded.action_type,
             question_text = excluded.question_text,
             reason = excluded.reason,
             note = excluded.note,
             created_at = CURRENT_TIMESTAMP`
        ).bind("bsc", order.userId, order.key, "REJECT", notifyText, order.reason || "", order.note || "").run();
      }

      await pushLineMessage(order.userId, notifyText, env);
    }

    return json({ success: true });
  }

  // Employee 強制取消 (Quá lâu khách không rep -> Nhấn Hủy trực tiếp)
  if (incoming === "FORCE_REJECT") {
    order.status = "REJECTED";
    await saveOrder(env, order);

    if (order.userId) {
      if (env.DB) {
        try {
          await env.DB.prepare(
            "DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ? AND order_key = ?"
          ).bind("bsc", order.userId, order.key).run();
        } catch { }
      }
      await pushLineMessage(order.userId, `干城鹹水雞：由於未收到您的回覆，訂單 #${order.key} 已自動取消。期待下次為您服務！`, env);
    }

    if (ctx && ctx.waitUntil) ctx.waitUntil(syncToGoogleSheets(order, env));
    return json({ success: true });
  }

  // Employee 已取餐 (Không gửi thêm thông báo để tiết kiệm LINE API quota)
  if (incoming === "PICKED_UP") {
    if (order.status === "PICKED_UP") {
      await saveOrder(env, order);
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
  if (!env.DB) return json([]);
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM orders WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200"
    ).bind("bsc").all<any>();

    const orders: Order[] = (results || []).map(row => ({
      key: row.key,
      customer: row.customer_name,
      time: row.pickup_time,
      content: row.order_content,
      status: row.status,
      createdAt: new Date(row.created_at + "Z").getTime(),
      userId: row.user_id || undefined,
      total: row.total_amount,
      reason: row.reason || "",
      note: row.note || ""
    }));

    return json(orders);
  } catch (e) {
    console.error("[getOrders] D1 error:", e);
    return json([]);
  }
}

export async function saveOrder(env: Env, order: Order): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT INTO orders (key, tenant_id, user_id, customer_name, pickup_time, status, total_amount, order_content, reason, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'), datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       status = excluded.status,
       total_amount = excluded.total_amount,
       order_content = excluded.order_content,
       reason = excluded.reason,
       note = excluded.note,
       updated_at = datetime('now')`
  ).bind(
    order.key,
    "bsc",
    order.userId || null,
    order.customer,
    order.time,
    order.status,
    order.total,
    order.content,
    order.reason || "",
    order.note || "",
    Math.floor((order.createdAt || Date.now()) / 1000)
  ).run();
}

export async function handleOrdersMigration(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== "bsc_migrate_2026") {
    return new Response("Unauthorized", { status: 401 });
  }

  const batchSize = parseInt(url.searchParams.get("limit") || "40", 10);
  const reqCursor = url.searchParams.get("cursor") || "";

  const logs: string[] = [];
  let migratedCount = 0;

  try {
    const listRes = await env.ORDER_STATE.list({
      prefix: "order:",
      cursor: reqCursor,
      limit: batchSize
    });

    for (const keyObj of listRes.keys) {
      const key = keyObj.name;
      if (key === "order_index:latest" || key === "order_view:cache") continue;

      const raw = await env.ORDER_STATE.get(key);
      if (!raw) continue;

      try {
        const order = JSON.parse(raw);

        await env.DB.prepare(
          `INSERT OR IGNORE INTO orders (key, tenant_id, user_id, customer_name, pickup_time, status, total_amount, order_content, reason, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'), datetime('now'))`
        ).bind(
          order.key,
          "bsc",
          order.userId || null,
          order.customer,
          order.time,
          order.status || "NEW",
          order.total || 0,
          order.content,
          order.reason || "",
          order.note || "",
          Math.floor((order.createdAt || Date.now()) / 1000)
        ).run();
        migratedCount++;
      } catch (e: any) {
        logs.push(`Failed to migrate order ${key}: ${e.message}`);
      }
    }

    const nextCursor = ("cursor" in listRes) ? (listRes.cursor || "") : "";
    const isComplete = listRes.list_complete || nextCursor === "";

    return json({
      success: true,
      migrated_count: migratedCount,
      completed: isComplete,
      next_cursor: nextCursor,
      logs
    });
  } catch (err: any) {
    return json({ success: false, error: err.message, logs }, 500);
  }
}
