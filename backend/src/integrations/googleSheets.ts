import { Env } from '../types/env';
import { Order } from '../types/index';

export async function syncToGoogleSheets(order: Order, env: Env): Promise<void> {
  const sheetUrl = env.GOOGLE_SHEETS_URL || "https://script.google.com/macros/s/AKfycbw2zpueE7DmkcrHU0fMgfHWhWhhMsEFprJJEo4-kfirRrcDY7NZNeRMduy_aAf-AX0few/exec";
  try {
    await fetch(sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: order.key,
        customer: order.customer || "Unknown",
        status: order.status,
        content: order.content,
        total: order.total,
        time: order.time,
        reason: order.reason || "",
        note: order.note || ""
      })
    });
  } catch (e) {
    console.error("Failed to sync to Google Sheets:", e);
  }
}
