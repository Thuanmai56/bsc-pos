import { Env } from './types/env';
import { corsHeaders } from './utils/http';
import { handleLineWebhook } from './modules/line';
import { createOrder, updateOrder, getOrders } from './modules/orders';
import { getConfig, updateConfig } from './modules/config';
import { getMenu, updateMenu } from './modules/menu';
import { handleAuth, handleAuthChange, handleCreateTempLink, handleVerifyTempLink } from './modules/auth';
import { getImageList, getImage, updateImage, deleteImage } from './modules/image';
import { debugKV } from './modules/debug';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method === "POST" && (path === "/webhook" || path === "/")) {
      return handleLineWebhook(request, env, ctx);
    }
    if (request.method === "POST" && path === "/api/create") return createOrder(request, env);
    if (request.method === "POST" && path === "/api/update") return updateOrder(request, env, ctx);
    if (request.method === "GET" && path === "/api/orders") return getOrders(env);
    if (request.method === "GET" && path === "/api/config") return getConfig(env);
    if (request.method === "POST" && path === "/api/config") return updateConfig(request, env);
    if (request.method === "GET" && path === "/api/menu") return getMenu(env);
    if (request.method === "POST" && path === "/api/menu") return updateMenu(request, env);
    if (request.method === "GET" && path === "/api/image_list") return getImageList(env);
    if (request.method === "GET" && path === "/api/image") return getImage(request, env);
    if (request.method === "POST" && path === "/api/image") return updateImage(request, env);
    if (request.method === "DELETE" && path === "/api/image") return deleteImage(request, env);
    if ((request.method === "POST" || request.method === "GET") && path === "/api/auth") return handleAuth(request, env, url);
    if (request.method === "POST" && path === "/api/auth/change") return handleAuthChange(request, env);
    if (request.method === "POST" && path === "/api/auth/templink") return handleCreateTempLink(request, env);
    if (request.method === "GET" && path === "/api/auth/templink") return handleVerifyTempLink(request, env);
    if (request.method === "GET" && path === "/api/debug") return debugKV(env, url);

    return new Response("Not Found", { status: 404, headers: corsHeaders() });
  }
};
