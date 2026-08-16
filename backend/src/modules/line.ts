import { Env } from '../types/env';
import { Order } from '../types/index';
import { corsHeaders } from '../utils/http';
import { saveOrder, getPendingMap, getOrder } from './orders';
import { callAI } from '../integrations/groq';
import { syncToGoogleSheets } from '../integrations/googleSheets';
import { resolveSecret } from '../utils/secrets';

export async function pushLineMessage(userId: string, text: string, env: Env, quickReplies?: Array<{ label: string; text: string }>): Promise<void> {
  const token = await resolveSecret(env.LINE_CHANNEL_TOKEN);
  if (!token) { console.error("[BSC] pushLineMessage: LINE_CHANNEL_TOKEN missing"); return; }
  if (!userId) { console.error("[BSC] pushLineMessage: userId is empty, cannot push"); return; }

  try {
    const messageObj: any = { type: "text", text };
    if (quickReplies && quickReplies.length > 0) {
      messageObj.quickReply = {
        items: quickReplies.map(qr => ({
          type: "action",
          action: {
            type: "message",
            label: qr.label,
            text: qr.text,
          }
        }))
      };
    }

    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [messageObj],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      console.error(`[BSC] pushLineMessage FAILED: status=${res.status} userId=${userId} body=${body}`);
    } else {
      console.log(`[BSC] pushLineMessage OK: userId=${userId}`);
    }
  } catch (e: any) {
    console.error(`[BSC] pushLineMessage EXCEPTION: userId=${userId} error=${e.message}`);
  }
}

export async function pushLineFlexMessage(userId: string, altText: string, flexContents: any, env: Env): Promise<void> {
  const token = await resolveSecret(env.LINE_CHANNEL_TOKEN);
  if (!token) { console.error("[BSC] pushLineFlexMessage: LINE_CHANNEL_TOKEN missing"); return; }
  if (!userId) { console.error("[BSC] pushLineFlexMessage: userId is empty, cannot push"); return; }

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [
          {
            type: "flex",
            altText,
            contents: flexContents,
          }
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      console.error(`[BSC] pushLineFlexMessage FAILED: status=${res.status} userId=${userId} body=${body}`);
    } else {
      console.log(`[BSC] pushLineFlexMessage OK: userId=${userId}`);
    }
  } catch (e: any) {
    console.error(`[BSC] pushLineFlexMessage EXCEPTION: userId=${userId} error=${e.message}`);
  }
}

export function createRejectFlexBubble(orderKey: string, reason: string): any {
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#DC2626",
      paddingAll: "18px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          alignItems: "center",
          contents: [
            { type: "text", text: "⚠️", size: "xxl", flex: 0 },
            {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: "無法接單通知", weight: "bold", size: "xl", color: "#ffffff" },
                { type: "text", text: "Order Cancel Request", size: "xs", color: "#FEE2E2" }
              ]
            }
          ]
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "訂單編號", size: "sm", color: "#888888", flex: 3 },
            { type: "text", text: `#${orderKey}`, size: "md", weight: "bold", color: "#111111", flex: 6 }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "取消原因", size: "sm", color: "#888888", flex: 3 },
            { type: "text", text: reason || "商品已售完 / 目前無法接單", size: "sm", weight: "bold", color: "#DC2626", flex: 6, wrap: true }
          ]
        },
        { type: "separator", margin: "md", color: "#EEEEEE" },
        {
          type: "text",
          text: "非常抱歉！店家目前無法為您製作餐點。請點擊下方按鈕確認是否同意取消訂單：",
          wrap: true,
          color: "#4B5563",
          size: "sm"
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#DC2626",
          height: "sm",
          action: {
            type: "postback",
            label: "🔴 同意取消訂單",
            data: `action=reject_agree&orderKey=${orderKey}`,
            displayText: "同意"
          }
        },
        {
          type: "button",
          style: "secondary",
          height: "sm",
          action: {
            type: "postback",
            label: "⚪ 不同意",
            data: `action=reject_disagree&orderKey=${orderKey}`,
            displayText: "不同意"
          }
        }
      ]
    }
  };
}

export async function replyText(replyToken: string, text: string, env: Env): Promise<void> {
  const token = await resolveSecret(env.LINE_CHANNEL_TOKEN);
  if (!token || !replyToken) return;

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "(unreadable)");
      console.error(`[Benmi] replyText FAILED: status=${res.status} body=${errBody}`);
    }
  } catch (e: any) {
    console.error(`[Benmi] replyText EXCEPTION: error=${e.message}`);
  }
}

export function handleQuickReply(text: string): string | null {
  const msg = String(text || "").toLowerCase();
  if (msg.includes("營業時間"))
    return "我們的營業時間：11:00-21:00（一到五），7:30-21:00（六日）。";
  if (msg.includes("地址") || msg.includes("在哪"))
    return "新北市土城區中央路二段135號";
  if (msg.includes("外送嗎"))
    return "土城區金額滿$2000可以外送的";
  return null;
}

export function normalizeCustomerReply(text: string) {
  const t = String(text || "").trim().toLowerCase();
  const hasAgree =
    t.includes("同意") || t.includes("agree") || t === "ok" || t === "okay" || t === "yes" || t === "好";
  const hasCancel =
    t.includes("取消") || t.includes("cancel") || t.includes("不要了") || t.includes("不用了");
  const hasDifferent =
    t.includes("不同意") || t.includes("disagree") || t === "no" || t === "not" || t.includes("不要");
  return { hasAgree, hasCancel, hasDifferent };
}

export async function handleLineWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body: any = await request.json().catch(() => ({}));
  const events = Array.isArray(body.events) ? body.events : [];

  for (const event of events) {
    if (!event) continue;

    const replyToken = event.replyToken;
    const source = event.source || {};
    const userId = source.userId;
    if (!userId) continue;

    // A) Handle LINE Postback Events (e.g. from Reject Flex Bubble)
    if (event.type === "postback") {
      const postbackData = event.postback?.data || "";
      console.log(`[LINE Postback] userId=${userId} data=${postbackData}`);
      const params = new URLSearchParams(postbackData);
      let action = params.get("action")?.trim() || "";
      let orderKey = params.get("orderKey")?.trim() || "";

      // 1. Fallback JSON parsing
      if (!action || !orderKey) {
        try {
          const jsonObj = JSON.parse(postbackData);
          if (jsonObj.action) action = jsonObj.action;
          if (jsonObj.orderKey) orderKey = jsonObj.orderKey;
        } catch { }
      }

      // 2. Fallback substring extraction
      if (!action) {
        if (postbackData.includes("reject_agree") || postbackData.includes("agree") || postbackData.includes("同意")) {
          action = "reject_agree";
        } else if (postbackData.includes("reject_disagree") || postbackData.includes("disagree") || postbackData.includes("不同意")) {
          action = "reject_disagree";
        }
      }
      if (!orderKey && postbackData.includes("orderKey=")) {
        const match = postbackData.match(/orderKey=([A-Za-z0-9_-]+)/);
        if (match) orderKey = match[1];
      }

      // 3. Fallback: Lookup latest pending or waiting order for this userId
      if (!orderKey && env.DB) {
        try {
          const pRow = await env.DB.prepare(
            "SELECT order_key FROM pending_actions WHERE tenant_id = 'bsc' AND user_id = ? ORDER BY created_at DESC LIMIT 1"
          ).bind(userId).first<{ order_key: string }>();
          if (pRow?.order_key) {
            orderKey = pRow.order_key;
          } else {
            const wRow = await env.DB.prepare(
              "SELECT key FROM orders WHERE tenant_id = 'bsc' AND user_id = ? AND status IN ('WAITING_CUSTOMER_REJECT', 'WAITING_CUSTOMER_CHANGE') ORDER BY updated_at DESC LIMIT 1"
            ).bind(userId).first<{ key: string }>();
            if (wRow?.key) orderKey = wRow.key;
          }
        } catch (e) {
          console.error("[postback fallback orderKey error]:", e);
        }
      }

      if (action && orderKey) {
        if (action === "reject_agree") {
          if (env.DB) {
            try {
              await env.DB.prepare(
                "UPDATE orders SET status = 'REJECTED', updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE tenant_id = 'bsc' AND key = ?"
              ).bind(orderKey).run();
              await env.DB.prepare(
                "DELETE FROM pending_actions WHERE tenant_id = 'bsc' AND (order_key = ? OR user_id = ?)"
              ).bind(orderKey, userId).run();
            } catch (e) {
              console.error("[postback reject_agree DB error]:", e);
            }
          }
          if (replyToken) {
            await replyText(
              replyToken,
              `好的，干城鹹水雞 已收到您的確認，訂單 #${orderKey} 已為您取消。\n非常抱歉造成您的不便，感謝您的體諒，期待下次再為您服務！`,
              env
            );
          }
          const updatedOrder = await getOrder(env, orderKey);
          if (updatedOrder) {
            if (ctx && ctx.waitUntil) ctx.waitUntil(syncToGoogleSheets(updatedOrder, env));
            else await syncToGoogleSheets(updatedOrder, env);
          }
          continue;
        }

        if (action === "reject_disagree") {
          if (env.DB) {
            try {
              await env.DB.prepare(
                "UPDATE orders SET status = 'NEW', updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE tenant_id = 'bsc' AND key = ?"
              ).bind(orderKey).run();
              await env.DB.prepare(
                "DELETE FROM pending_actions WHERE tenant_id = 'bsc' AND (order_key = ? OR user_id = ?)"
              ).bind(orderKey, userId).run();
            } catch (e) {
              console.error("[postback reject_disagree DB error]:", e);
            }
          }
          if (replyToken) {
            await replyText(
              replyToken,
              `謝謝您的回覆！我已將訂單 #${orderKey} 回到「等待店家接單」狀態，店家會再為您確認。`,
              env
            );
          }
          continue;
        }
      }
      continue;
    }

    // B) Handle LINE Text Message Events
    if (event.type !== "message") continue;
    const message = event.message || {};
    if (message.type !== "text") continue;

    const userText = message.text || "";

    // 0) Priority Catch new order from LIFF text message (Bypasses pending states)
    if (userText.includes("訂單編號：") && userText.includes("📦 訂單內容：")) {
      // If it is a receipt message from successful API creation, skip parsing/saving to avoid overwriting due to KV latency
      if (userText.includes("[已收到]") || userText.includes("[Đã nhận]")) {
        console.log(`[Benmi] Webhook received receipt message. Skipping to avoid overwrite.`);
        try {
          await env.DB.prepare(
            "DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ?"
          ).bind("bsc", userId).run();
        } catch { }
        continue;
      }

      const lines = userText.split("\n");
      const keyLine = lines.find((l: string) => l.includes("訂單編號："));
      const timeLine = lines.find((l: string) => l.includes("🕒 取餐日期：") || l.includes("🕒 取餐時間："));
      const totalLine = lines.find((l: string) => l.includes("💰 總金額："));

      const nowTaiwan = new Date(Date.now() + 8 * 3600000);
      const mm = String(nowTaiwan.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(nowTaiwan.getUTCDate()).padStart(2, "0");
      const hh = String(nowTaiwan.getUTCHours()).padStart(2, "0");
      const min = String(nowTaiwan.getUTCMinutes()).padStart(2, "0");
      const todayKey = mm + dd;
      const timeKey = hh + min;
      const tempRandomId = Math.floor(1000 + Math.random() * 9000);
      const orderKey = keyLine ? keyLine.replace("訂單編號：", "").trim() : `BD${todayKey}-${timeKey}-${tempRandomId}`;
      const timeStr = timeLine ? timeLine.replace("🕒 取餐日期：", "").replace("🕒 取餐時間：", "").trim() : "Unknown";
      const totalStr = totalLine ? totalLine.replace("💰 總金額：", "").replace("$", "").trim() : "0";

      // Robust note extraction using absolute string indexing to handle multi-line notes perfectly
      let noteStr = "";
      const noteStart = userText.indexOf("總備註");
      const totalStartIdx = userText.indexOf("💰 總金額");

      if (noteStart !== -1) {
        let colonIdx = userText.indexOf("：", noteStart);
        if (colonIdx === -1) colonIdx = userText.indexOf(":", noteStart);
        if (colonIdx === -1) colonIdx = noteStart + 3; // fallback if no colon found

        if (totalStartIdx !== -1 && totalStartIdx > colonIdx) {
          noteStr = userText.substring(colonIdx + 1, totalStartIdx).trim();
        } else {
          noteStr = userText.substring(colonIdx + 1).trim();
        }
      }

      let custName = "顧客 (Web)";

      // Check if order already exists to preserve customer name
      const existingOrder = await getOrder(env, orderKey);
      if (existingOrder && existingOrder.customer && existingOrder.customer !== "顧客 (Web)" && existingOrder.customer !== "Khách (Web)") {
        custName = existingOrder.customer;
      }

      const contentStart = userText.indexOf("📦 訂單內容：");
      let contentEnd = userText.indexOf("🕒 取餐日期：");
      if (contentEnd === -1) {
        contentEnd = userText.indexOf("🕒 取餐時間：");
      }
      let extractedContent = userText;
      if (contentStart > -1 && contentEnd > contentStart) {
        extractedContent = userText.substring(contentStart + 8, contentEnd).replace("📦 訂單內容：", "").trim();
      }

      const orderData: Order = {
        key: orderKey,
        customer: custName,
        time: timeStr,
        content: extractedContent,
        status: "NEW",
        createdAt: Date.now(),
        userId: userId,
        total: parseInt(totalStr, 10) || 0,
        reason: "",
        note: noteStr
      };

      await saveOrder(env, orderData);

      if (!existingOrder && replyToken) {
        try {
          await replyText(replyToken, "感謝您的訂單！餐點製作完成後，我們會再次通知您前來取餐，謝謝！", env);
        } catch (e) {
          console.error("[Benmi] Failed to send webhook reply message:", e);
        }
      }

      // Fetch real LINE name in background and update KV
      if (ctx && ctx.waitUntil) {
        ctx.waitUntil((async () => {
          try {
            const token = await resolveSecret(env.LINE_CHANNEL_TOKEN);
            const profUrl = `https://api.line.me/v2/bot/profile/${userId}`;
            const resp = await fetch(profUrl, { headers: { Authorization: `Bearer ${token}` } });
            if (resp.ok) {
              const p: any = await resp.json();
              if (p && p.displayName) {
                orderData.customer = p.displayName;
                await saveOrder(env, orderData);
              }
            } else {
              const errBody = await resp.text().catch(() => "(unreadable)");
              console.error(`[Benmi] Background profile fetch FAILED: status=${resp.status} userId=${userId} body=${errBody}`);
            }
          } catch (e: any) {
            console.error("[Benmi] Background profile fetch EXCEPTION:", e);
          }
        })());
      }

      try {
        await env.DB.prepare(
          "DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ?"
        ).bind("bsc", userId).run();
      } catch { }

      continue;
    }

    // 1) Pending flow priority (Always check pending questions/orders BEFORE draft to prevent draft hijacking)
    const pMap = await getPendingMap(env, userId);
    let pKeys = Object.keys(pMap).sort((a, b) => (pMap[b].createdAt || 0) - (pMap[a].createdAt || 0));

    // Filter out stale pending keys whose orders are already in a final or active state
    const activeKeys: string[] = [];
    for (const key of pKeys) {
      const order = await getOrder(env, key);
      if (order) {
        if (order.status === "REJECTED" || order.status === "ACCEPTED" || order.status === "DONE" || order.status === "PICKED_UP") {
          if (env.DB) {
            try {
              await env.DB.prepare(
                "DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ? AND order_key = ?"
              ).bind("bsc", userId, key).run();
            } catch { }
          }
          continue;
        }
        activeKeys.push(key);
      }
    }

    pKeys = activeKeys;

    let targetOrder: Order | null = null;
    let pendingType = "";
    let questionText = "";
    let currentReason = "";
    let currentNote = "";
    let orderKey = "";

    if (pKeys.length > 0) {
      orderKey = pKeys[0];
      const pending = pMap[orderKey];
      pendingType = pending?.type || "";
      questionText = pending?.questionText || "";
      currentReason = pending?.reason || "";
      currentNote = pending?.note || "";
      targetOrder = await getOrder(env, orderKey);
    } else {
      // Fallback: Query directly from orders table for any waiting orders for this user
      try {
        if (env.DB) {
          const waitingRow = await env.DB.prepare(
            `SELECT key, status, reason, note FROM orders 
             WHERE tenant_id = 'bsc' AND user_id = ? AND status IN ('WAITING_CUSTOMER_REJECT', 'WAITING_CUSTOMER_CHANGE') 
             ORDER BY updated_at DESC LIMIT 1`
          ).bind(userId).first<any>();
          if (waitingRow) {
            orderKey = waitingRow.key;
            pendingType = waitingRow.status === "WAITING_CUSTOMER_REJECT" ? "REJECT" : "CHANGE";
            currentReason = waitingRow.reason || "";
            currentNote = waitingRow.note || "";
            targetOrder = await getOrder(env, orderKey);
          }
        }
      } catch (e) {
        console.error("[LINE Webhook] Fallback waiting order lookup error:", e);
      }
    }

    if (targetOrder && orderKey) {
      const order = targetOrder;
      const lowerText = userText.trim().toLowerCase();

      const finishPending = async () => {
        if (env.DB) {
          try {
            await env.DB.prepare(
              "DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ? AND order_key = ?"
            ).bind("bsc", userId, orderKey).run();
          } catch (e) {
            console.error("[finishPending] failed:", e);
          }
        }
      };

      if (!currentReason) currentReason = order.reason || "";
      if (!currentNote) currentNote = order.note || "";

      // TÁCH RIÊNG TRƯỜNG HỢP "ĐỔI GIỜ NHẬN HÀNG" KHÔNG DÙNG AI
      if (pendingType === "CHANGE" && currentReason === "時間需調整") {
        const exactMatch = lowerText === "好" || lowerText === "同意" || lowerText === "ok" || lowerText === "可以" || lowerText === "好的";
        const isCancel = lowerText.includes("不要") || lowerText.includes("取消") || lowerText.includes("不用");

        if (isCancel) {
          order.status = "REJECTED"; // Tự động huỷ
          await saveOrder(env, order);
          await finishPending();
          await replyText(replyToken, `收到，謝謝您！`, env);
          if (ctx && ctx.waitUntil) ctx.waitUntil(syncToGoogleSheets(order, env));
          else await syncToGoogleSheets(order, env);
        }
        else if (exactMatch) {
          const timeParts = (order.time || "").split(" ");
          const oldDate = timeParts[0] || "";
          const newSuggestedTime = currentNote;

          if (oldDate && oldDate.includes("-")) {
            order.time = `${oldDate} ${newSuggestedTime}`;
          } else {
            order.time = newSuggestedTime;
          }
          order.reason = "";
          order.note = "";
          order.status = "NEW"; // Tái xuất hiện thông báo đơn mới trên Dashboard
          await saveOrder(env, order);
          await finishPending();
          await replyText(replyToken, `收到您的同意！取餐時間已為您更改為 ${newSuggestedTime}`, env);
        }
        else {
          await replyText(replyToken, `請簡單回覆「好 / 同意」以確認，或回覆「不要了 / 取消」取消訂單。`, env);
        }
        continue;
      }

      if (pendingType === "CHANGE") {
        const isCancel = lowerText.includes("不要了") || lowerText.includes("取消") || lowerText.includes("不用了") || lowerText === "不要";

        if (isCancel) {
          order.status = "REJECTED"; // Tự động huỷ
          await saveOrder(env, order);
          await finishPending();
          await replyText(replyToken, `好的，已為您取消訂單 #${orderKey}。`, env);
          if (ctx && ctx.waitUntil) ctx.waitUntil(syncToGoogleSheets(order, env));
          else await syncToGoogleSheets(order, env);
          continue;
        }

        // DÙNG AI XÁC NHẬN: Phân tích tin nhắn của khách dựa trên câu hỏi của quán
        let aiSaysYes = false;
        const isExplicitSwapKeyword = lowerText.includes("換") || lowerText.includes("改");

        if (isExplicitSwapKeyword) {
          aiSaysYes = true;
        } else if (questionText) {
          let menuItemNames: string[] = [];
          try {
            if (env.DB) {
              const { results } = await env.DB.prepare(
                "SELECT name FROM menu_items WHERE tenant_id = ? ORDER BY sort_order ASC"
              ).bind("bsc").all<{ name: string }>();
              menuItemNames = (results || []).map(r => r.name);
            }
          } catch (e) {
            console.error("[LINE] Failed to fetch menu items for AI prompt:", e);
          }

          const menuContext = menuItemNames.length > 0
            ? `\n本店目前的菜單品項有：${menuItemNames.join("、")}。\n`
            : "";

          const prompt = `店家剛才詢問顧客：「${questionText}」\n顧客的回覆是：「${userText}」\n${menuContext}\n請分析顧客的回覆是否在回答店家的問題（例如：選擇替換的餐點/食材/口味、直接回答食材名稱、表達更換意願或確認決定）？\n- 如果顧客給出了餐點/食材/口味選擇、指定了替換品項、或表達同意 → 請嚴格回覆 YES。\n- 如果顧客是在發問無關事項、純聊天或離題 → 請回覆 NO。\n請只回覆 YES 或 NO。`;
          const aiRes = await callAI(prompt, env);
          if (aiRes && aiRes.toUpperCase().includes("YES")) {
            aiSaysYes = true;
          } else if (!aiRes) {
            aiSaysYes = true;
          }
        } else {
          aiSaysYes = true;
        }

        if (!aiSaysYes) {
          await replyText(replyToken, `請您明確告訴我們想換什麼品項，或者回覆「取消」直接取消訂單。`, env);
          continue;
        }

        // AI xác nhận YES -> Thực hiện đổi món
        const isItemSwap = currentReason === "口味售完" || currentReason === "品項售完" || currentReason === "今日已售完" || isExplicitSwapKeyword || aiSaysYes;
        if (isItemSwap) {
          order.content = `【顧客換單】：${userText}\n----原本訂單 👇----\n${order.content}`;
          order.reason = "";
          order.note = "";
          order.status = "NEW";
          await saveOrder(env, order);
          await finishPending();
          await replyText(replyToken, `收到您的回覆！我們會依您的需求修改訂單。`, env);
          continue;
        }

        // Fallback for explicitly agreed non-flavor changes
        const isAgree = (lowerText.includes("同意") && !lowerText.includes("不同意")) || lowerText === "好" || lowerText === "ok" || lowerText === "可以" || lowerText === "好的";
        if (isAgree) {
          order.status = "ACCEPTED";
          await saveOrder(env, order);
          await finishPending();
          await replyText(replyToken, `干城鹹水雞 收到您的同意！我們會開始準備您的訂單 #${orderKey}。`, env);
          continue;
        }

        await replyText(replyToken, `請再明確回覆您的決定。`, env);
        continue;
      }

      if (pendingType === "REJECT") {
        const isExplicitDisagree =
          lowerText.includes("不同意") ||
          lowerText.includes("不要取消") ||
          lowerText.includes("不想取消") ||
          lowerText.includes("請勿取消") ||
          lowerText.includes("請不要取消") ||
          lowerText.includes("別取消") ||
          lowerText.includes("disagree");

        if (isExplicitDisagree) {
          if (env.DB) {
            try {
              await env.DB.prepare(
                "UPDATE orders SET status = 'NEW', updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE tenant_id = 'bsc' AND key = ?"
              ).bind(orderKey).run();
              await env.DB.prepare(
                "DELETE FROM pending_actions WHERE tenant_id = 'bsc' AND (order_key = ? OR user_id = ?)"
              ).bind(orderKey, userId).run();
            } catch (e) {
              console.error("[text reject_disagree DB error]:", e);
            }
          }
          await replyText(
            replyToken,
            `謝謝您的回覆！我已將訂單 #${orderKey} 回到「等待店家接單」狀態，店家會再為您確認。`,
            env
          );
          continue;
        }

        const isAgree =
          lowerText.includes("同意") ||
          lowerText.includes("好") ||
          lowerText.includes("ok") ||
          lowerText.includes("可以") ||
          lowerText.includes("行") ||
          lowerText.includes("取消") ||
          lowerText.includes("不要了") ||
          lowerText.includes("不用了") ||
          lowerText.includes("不要") ||
          lowerText.includes("不用") ||
          lowerText.includes("算了吧") ||
          lowerText.includes("算了") ||
          lowerText.includes("沒關係") ||
          lowerText.includes("沒事") ||
          lowerText.includes("收到") ||
          lowerText.includes("知道") ||
          lowerText.includes("了解") ||
          lowerText.includes("謝") ||
          lowerText.includes("辛苦") ||
          lowerText.includes("yes");

        let aiSaysAgree = false;
        if (!isAgree) {
          const aiPrompt = `店家剛才通知顧客因故無法接單並詢問是否同意取消訂單：「${questionText}」\n顧客的回覆是：「${userText}」\n請分析顧客是否同意/理解並接受取消訂單？\n- 如果顧客表達同意、取消、沒關係、理解、感謝或接受取消 → 請回覆 YES。\n- 如果顧客明確反對取消或要求繼續做餐 → 請回覆 NO。\n請只回覆 YES 或 NO。`;
          const aiRes = await callAI(aiPrompt, env);
          if (aiRes && aiRes.toUpperCase().includes("YES")) {
            aiSaysAgree = true;
          }
        }

        if (isAgree || aiSaysAgree) {
          if (env.DB) {
            try {
              await env.DB.prepare(
                "UPDATE orders SET status = 'REJECTED', updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE tenant_id = 'bsc' AND key = ?"
              ).bind(orderKey).run();
              await env.DB.prepare(
                "DELETE FROM pending_actions WHERE tenant_id = 'bsc' AND (order_key = ? OR user_id = ?)"
              ).bind(orderKey, userId).run();
            } catch (e) {
              console.error("[text reject_agree DB error]:", e);
            }
          }
          await replyText(
            replyToken,
            `好的，干城鹹水雞 已收到您的確認，訂單 #${orderKey} 已為您取消。\n非常抱歉造成您的不便，感謝您的體諒，期待下次再為您服務！`,
            env
          );
          const updated = await getOrder(env, orderKey);
          if (updated) {
            if (ctx && ctx.waitUntil) ctx.waitUntil(syncToGoogleSheets(updated, env));
            else await syncToGoogleSheets(updated, env);
          }
          continue;
        }

        await replyText(replyToken, `請點選按鈕或回覆「同意」取消訂單，或回覆「不同意」。`, env);
        continue;
      }
    }

    // 2) Quick reply
    const quick = handleQuickReply(userText);
    if (quick) {
      await replyText(replyToken, quick, env);
      continue;
    }
  }

  return new Response("OK", { status: 200, headers: corsHeaders() });
}