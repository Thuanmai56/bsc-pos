import { Env } from '../types/env';
import { resolveSecret } from '../utils/secrets';

const LINE_API_BASE = "https://api.line.me/v2/bot";
const LINE_DATA_BASE = "https://api-data.line.me/v2/bot";

// Pre-generated 2500x843 PNG banner base64 string
export const ALERT_BANNER_BASE64 = `iVBORw0KGgoAAAANSU5EUgAACbQAAANLQAYAAAA1lF8VAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAE0SURBVHhe7cExAQAAAMKg9U9tDC8gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgqwG8YgAB08/17AAAAABJRU5ErkJggg==`;

export async function getAlertRichMenuId(env: Env): Promise<string | null> {
  const fromEnv = await resolveSecret(env.ALERT_RICH_MENU_ID);
  if (fromEnv) return fromEnv;

  if (env.ORDER_STATE) {
    const fromKv = await env.ORDER_STATE.get("alert_rich_menu_id");
    if (fromKv) return fromKv;
  }
  return null;
}

export async function linkAlertRichMenuToUser(userId: string, env: Env): Promise<boolean> {
  const token = await resolveSecret(env.LINE_CHANNEL_TOKEN);
  if (!token || !userId) {
    console.error("[RichMenu] Missing LINE_CHANNEL_TOKEN or userId");
    return false;
  }

  let richMenuId = await getAlertRichMenuId(env);

  // If Rich Menu ID not found, attempt auto-setup
  if (!richMenuId) {
    console.log("[RichMenu] No ALERT_RICH_MENU_ID found, running setupAlertRichMenu...");
    richMenuId = await setupAlertRichMenu(env);
  }

  if (!richMenuId) {
    console.error("[RichMenu] Failed to obtain valid ALERT_RICH_MENU_ID");
    return false;
  }

  try {
    const res = await fetch(`${LINE_API_BASE}/user/${userId}/richmenu/${richMenuId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "(unreadable)");
      console.error(`[RichMenu] linkAlertRichMenuToUser FAILED: status=${res.status} body=${errText}`);
      return false;
    }

    console.log(`[RichMenu] Successfully linked Alert Rich Menu (${richMenuId}) to user ${userId}`);
    return true;
  } catch (e: any) {
    console.error(`[RichMenu] Exception linking Alert Rich Menu to user ${userId}:`, e);
    return false;
  }
}

export async function unlinkAlertRichMenuFromUser(userId: string, env: Env): Promise<boolean> {
  const token = await resolveSecret(env.LINE_CHANNEL_TOKEN);
  if (!token || !userId) return false;

  try {
    const res = await fetch(`${LINE_API_BASE}/user/${userId}/richmenu`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "(unreadable)");
      console.error(`[RichMenu] unlinkAlertRichMenuFromUser FAILED: status=${res.status} body=${errText}`);
      return false;
    }

    console.log(`[RichMenu] Successfully unlinked Alert Rich Menu from user ${userId}`);
    return true;
  } catch (e: any) {
    console.error(`[RichMenu] Exception unlinking Alert Rich Menu from user ${userId}:`, e);
    return false;
  }
}

export async function setupAlertRichMenu(env: Env): Promise<string | null> {
  const token = await resolveSecret(env.LINE_CHANNEL_TOKEN);
  if (!token) {
    console.error("[RichMenu Setup] Missing LINE_CHANNEL_TOKEN");
    return null;
  }

  const liffUrl = (await resolveSecret(env.LIFF_URL)) || "https://liff.line.me/";

  try {
    // 1. Create Rich Menu Object
    const menuBody = {
      size: { width: 2500, height: 843 },
      selected: true,
      name: "BSC Alert Banner",
      chatBarText: "⚠️ 訂單異動通知",
      areas: [
        {
          bounds: { x: 0, y: 0, width: 2500, height: 843 },
          action: {
            type: "uri",
            label: "Open Order Alert",
            uri: liffUrl.includes("?") ? `${liffUrl}&mode=alert` : `${liffUrl}?mode=alert`,
          },
        },
      ],
    };

    const createRes = await fetch(`${LINE_API_BASE}/richmenu`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(menuBody),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error(`[RichMenu Setup] Create richmenu failed: ${createRes.status} ${err}`);
      return null;
    }

    const { richMenuId } = (await createRes.json()) as { richMenuId: string };
    console.log(`[RichMenu Setup] Created Rich Menu ID: ${richMenuId}`);

    // 2. Upload Banner Image
    const pngBytes = Uint8Array.from(atob(ALERT_BANNER_BASE64), (c) => c.charCodeAt(0));

    const uploadRes = await fetch(`${LINE_DATA_BASE}/richmenu/${richMenuId}/content`, {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        Authorization: `Bearer ${token}`,
      },
      body: pngBytes,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error(`[RichMenu Setup] Upload banner image failed: ${uploadRes.status} ${err}`);
    } else {
      console.log(`[RichMenu Setup] Uploaded banner image successfully for ${richMenuId}`);
    }

    // 3. Save to KV
    if (env.ORDER_STATE) {
      await env.ORDER_STATE.put("alert_rich_menu_id", richMenuId);
    }

    return richMenuId;
  } catch (e: any) {
    console.error("[RichMenu Setup] Exception during setup:", e);
    return null;
  }
}
