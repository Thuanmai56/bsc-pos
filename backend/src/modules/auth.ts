import { Env } from '../types/env';
import { json } from '../utils/http';

export const DEFAULT_PASSWORD = "12345678";

export async function handleAuth(request: Request, env: Env, url?: URL): Promise<Response> {
  let password: string | null = null;
  if (request.method === "GET") {
    password = (url || new URL(request.url)).searchParams.get("pw");
  } else {
    const body: any = await request.json().catch(() => ({}));
    password = body.password;
  }
  if (!password) return json({ ok: false, error: "No password" });
  const stored = await env.ORDER_STATE.get("dashboard:password") || DEFAULT_PASSWORD;
  return json({ ok: password === stored });
}

export async function handleAuthChange(request: Request, env: Env): Promise<Response> {
  const { current, newPassword }: any = await request.json().catch(() => ({}));
  if (!current || !newPassword) return json({ ok: false, error: "Missing fields" });
  const stored = await env.ORDER_STATE.get("dashboard:password") || DEFAULT_PASSWORD;
  if (current !== stored) return json({ ok: false, error: "Wrong current password" });
  if (newPassword.length < 4) return json({ ok: false, error: "Password too short" });
  await env.ORDER_STATE.put("dashboard:password", newPassword);
  return json({ ok: true });
}

export async function handleCreateTempLink(request: Request, env: Env): Promise<Response> {
  const { password, hours = 24 }: any = await request.json().catch(() => ({}));
  const stored = await env.ORDER_STATE.get("dashboard:password") || DEFAULT_PASSWORD;
  if (password !== stored) return json({ ok: false, error: "Wrong password" });
  const ttl = Math.min(Math.max(parseInt(hours) || 24, 1), 168);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  await env.ORDER_STATE.put(`templink:${token}`, "1", { expirationTtl: ttl * 3600 });
  return json({ ok: true, token, hours: ttl });
}

export async function handleVerifyTempLink(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  if (!token) return json({ ok: false });
  const val = await env.ORDER_STATE.get(`templink:${token}`);
  return json({ ok: val === "1" });
}
