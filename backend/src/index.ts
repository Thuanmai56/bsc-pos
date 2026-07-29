import { Env } from './types/env';
import { corsHeaders, json } from './utils/http';
import { handleLineWebhook } from './modules/line';
import { createOrder, updateOrder, getOrders, handleOrdersMigration, getPendingActionsApi, cleanupExpiredPendingActions } from './modules/orders';
import { setupAlertRichMenu } from './modules/lineRichMenu';
import { getConfig, updateConfig } from './modules/config';
import { getMenu, updateMenu, updateStockStatus } from './modules/menu';
import { handleAuth, handleAuthChange, handleCreateTempLink, handleVerifyTempLink } from './modules/auth';
import { getImageList, getImage, updateImage, deleteImage } from './modules/image';
import { debugKV } from './modules/debug';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (ctx && ctx.waitUntil) {
        ctx.waitUntil(cleanupExpiredPendingActions(env));
      }

      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }

      if (request.method === "POST" && (path === "/webhook" || path === "/")) {
        return await handleLineWebhook(request, env, ctx);
      }
      if (request.method === "POST" && path === "/api/create") return await createOrder(request, env, ctx);
      if (request.method === "POST" && path === "/api/update") return await updateOrder(request, env, ctx);
      if (request.method === "GET" && path === "/api/orders") return await getOrders(env);
      if (request.method === "GET" && path === "/api/pending-actions") return await getPendingActionsApi(request, env);
      if (request.method === "POST" && path === "/api/setup-alert-richmenu") {
        const richMenuId = await setupAlertRichMenu(env);
        return json({ success: !!richMenuId, richMenuId });
      }
      if (request.method === "GET" && path === "/api/migrate-orders") return await handleOrdersMigration(request, env);
      if (request.method === "GET" && path === "/api/config") return await getConfig(env);
      if (request.method === "POST" && path === "/api/config") return await updateConfig(request, env);
      if (request.method === "GET" && path === "/api/menu") return await getMenu(request, env);
      if (request.method === "POST" && path === "/api/menu") return await updateMenu(request, env);
      if (request.method === "POST" && path === "/api/menu/stock-status") return await updateStockStatus(request, env);
      if (request.method === "GET" && path === "/api/image_list") return await getImageList(env);
      if (request.method === "GET" && path === "/api/image") return await getImage(request, env);
      if (request.method === "POST" && path === "/api/image") return await updateImage(request, env);
      if (request.method === "DELETE" && path === "/api/image") return await deleteImage(request, env);
      if ((request.method === "POST" || request.method === "GET") && path === "/api/auth") return await handleAuth(request, env, url);
      if (request.method === "POST" && path === "/api/auth/change") return await handleAuthChange(request, env);
      if (request.method === "POST" && path === "/api/auth/templink") return await handleCreateTempLink(request, env);
      if (request.method === "GET" && path === "/api/auth/templink") return await handleVerifyTempLink(request, env);
      if (request.method === "GET" && path === "/api/debug") return await debugKV(env, url);

      return new Response("Not Found", { status: 404, headers: corsHeaders() });
    } catch (err: any) {
      console.error("[BSC Worker Unhandled Exception]", err);
      return json({ error: err.message || "Internal Server Error" }, 500);
    }
  }
};
