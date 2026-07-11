import { Env } from '../types/env';
import { Menu } from '../types/index';
import { json } from '../utils/http';

export const DEFAULT_MENU: Menu = {
  small: { "燒肉": 56, "火腿": 56, "雞肉": 68, "烤肉": 72, "雙層烤肉": 78, "綜合": 79 },
  large: { "燒肉": 80, "火腿": 80, "雞肉": 100, "烤肉": 105, "雙層烤肉": 115, "綜合": 130 },
  combo: { 
    "1 大燒肉+飲料": 90, "2 大火腿+飲料": 90, "3 大雞肉+飲料": 118, "4 大烤肉+飲料": 128, 
    "5 大雙層烤肉+飲料": 135, "6 大綜合+飲料": 142, "7 小燒肉+飲料": 77, "8 小雞肉+飲料": 88,
    "9 小烤肉+飲料": 95, "10 小雙層烤肉+飲料": 99, "11 小綜合+飲料": 100
  },
  drinks: { "越南咖啡": 48, "豆漿": 37, "紅茶": 37, "可樂": 37, "雪碧": 37 },
  topping: { "起司": 15, "火腿": 20, "燒肉": 20, "烤肉": 25, "雞肉": 25 }
};

export async function getMenu(env: Env): Promise<Response> {
  try {
    const raw = await env.ORDER_STATE.get("menu:latest");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return json(parsed);
    }
  } catch (e) { }
  return json(DEFAULT_MENU);
}

export async function updateMenu(request: Request, env: Env): Promise<Response> {
  try {
    const data = await request.json();
    await env.ORDER_STATE.put("menu:latest", JSON.stringify(data));
    return json({ success: true });
  } catch (e) {
    return json({ error: "Invalid data" }, 400);
  }
}
