import { Env } from '../types/env';
import { resolveSecret } from '../utils/secrets';

// Gọi Groq API (Kênh chính)
async function callGroq(prompt: string, env: Env, signal: AbortSignal): Promise<string | null> {
  const apiKey = await resolveSecret(env.GROQ_API_KEY);
  if (!apiKey) {
    console.warn("[BSC] callGroq: GROQ_API_KEY is missing");
    return null;
  }

  const model = env.GROQ_MODEL || "llama-3.1-8b-instant";
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 10
    }),
    signal
  });

  if (!resp.ok) {
    const errorBody = await resp.text().catch(() => "");
    console.error(`[BSC] callGroq FAILED: status=${resp.status} body=${errorBody}`);
    return null;
  }

  const result: any = await resp.json();
  return result?.choices?.[0]?.message?.content || null;
}

// Gọi OpenRouter API (Kênh Fallback)
async function callOpenRouterFallback(prompt: string, env: Env, signal: AbortSignal): Promise<string | null> {
  const apiKey = await resolveSecret(env.OPENROUTER_API_KEY);
  if (!apiKey) {
    console.warn("[BSC] callOpenRouterFallback: OPENROUTER_API_KEY is missing, no fallback possible");
    return null;
  }

  const model = env.OPENROUTER_MODEL || "google/gemini-2.5-flash:free";
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 10
    }),
    signal
  });

  if (!resp.ok) {
    const errorBody = await resp.text().catch(() => "");
    console.error(`[BSC] callOpenRouterFallback FAILED: status=${resp.status} body=${errorBody}`);
    return null;
  }

  const result: any = await resp.json();
  return result?.choices?.[0]?.message?.content || null;
}

// Hàm Call AI chính (Bao bọc cả hai kênh)
export async function callAI(prompt: string, env: Env, timeoutMs: number = 8000): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const startTime = Date.now();
    let result: string | null = null;

    // 1. Thử gọi Groq
    if (env.GROQ_API_KEY) {
      result = await callGroq(prompt, env, controller.signal);
    }
    
    // 2. Nếu Groq thất bại hoặc không có key, tự động chuyển vùng gọi sang OpenRouter
    if (!result) {
      if (env.GROQ_API_KEY) {
        console.warn(`[BSC] Groq failed. Falling back to OpenRouter...`);
      } else {
        console.log(`[BSC] GROQ_API_KEY is not configured. Using OpenRouter as primary...`);
      }
      result = await callOpenRouterFallback(prompt, env, controller.signal);
      console.log(`[BSC] OpenRouter fallback result in ${Date.now() - startTime}ms`);
    } else {
      console.log(`[BSC] Groq call success in ${Date.now() - startTime}ms`);
    }

    clearTimeout(timeoutId);
    return result;
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") {
      console.error(`[BSC] callAI TIMEOUT after ${timeoutMs}ms`);
    } else {
      console.error("[BSC] callAI EXCEPTION:", e.message);
    }
    return null;
  }
}
