import { Env } from '../types/env';

export async function callAI(prompt: string, env: Env): Promise<string | null> {
  try {
    if (!env.OPENROUTER_API_KEY) {
      return null;
    }

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL || "openrouter/auto",
        messages: [
          {
            role: "user",
            content: `請用繁體中文（台灣用語）回覆，語氣禮貌、簡短清楚。\n${prompt}`
          }
        ]
      })
    });

    const result: any = await resp.json();
    if (result.error) {
      return null;
    }

    return result?.choices?.[0]?.message?.content || null;
  } catch (e) {
    return null;
  }
}
