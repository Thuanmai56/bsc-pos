import { Env } from '../types/env';
import { json } from '../utils/http';

export async function getConfig(env: Env): Promise<Response> {
  let stored: any = {};
  try {
    const raw = await env.ORDER_STATE.get("store_config");
    if (raw) stored = JSON.parse(raw);
  } catch (e) {}
  
  return json({ 
    liffId: env.LIFF_ID || null,
    operatingHours: stored.operatingHours || null
  });
}

export async function updateConfig(request: Request, env: Env): Promise<Response> {
  try {
    const payload: any = await request.json();
    let stored: any = {};
    const raw = await env.ORDER_STATE.get("store_config");
    if (raw) stored = JSON.parse(raw);
    
    if (payload.operatingHours !== undefined) {
      stored.operatingHours = payload.operatingHours;
    }
    
    await env.ORDER_STATE.put("store_config", JSON.stringify(stored));
    return json({ success: true });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
}
