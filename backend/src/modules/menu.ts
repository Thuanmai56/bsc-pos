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

// Helper để trích xuất Tenant ID từ Request
export function getTenantId(request: Request): string {
  const url = new URL(request.url);
  
  // 1. Ưu tiên query parameter ?tenant_id=...
  const queryTenant = url.searchParams.get("tenant_id");
  if (queryTenant) {
    console.log("[Tenant] Found in query param:", queryTenant);
    return queryTenant;
  }

  // 2. Kiểm tra Header X-Tenant-ID
  const headerTenant = request.headers.get("X-Tenant-ID");
  if (headerTenant) {
    console.log("[Tenant] Found in header:", headerTenant);
    return headerTenant;
  }

  // 3. Phân tích Subdomain từ URL hostname
  const hostname = url.hostname || "";
  const parts = hostname.split(".");
  
  console.log("[Tenant] Analyzing hostname:", hostname, "parts length:", parts.length);

  if (hostname.endsWith("workers.dev")) {
    if (parts.length >= 5 && parts[0] !== "www") {
      console.log("[Tenant] Found worker subdomain tenant:", parts[0]);
      return parts[0];
    }
  } else {
    if (parts.length > 2 && parts[0] !== "www" && !parts[0].includes("localhost") && !parts[0].includes("127")) {
      console.log("[Tenant] Found custom domain tenant:", parts[0]);
      return parts[0];
    }
  }

  // 4. Mặc định là bsc (vì đây là worker chuyên dụng của bsc)
  console.log("[Tenant] Using default fallback tenant: bsc");
  return "bsc";
}

// GET /api/menu
export async function getMenu(request: Request, env: Env): Promise<Response> {
  const tenantId = getTenantId(request);
  const cacheKey = `tenant:${tenantId}:menu`;

  try {
    // 1. Kiểm tra bộ nhớ đệm KV trước
    const cachedMenu = await env.ORDER_STATE.get(cacheKey);
    if (cachedMenu) {
      return json(JSON.parse(cachedMenu));
    }
  } catch (e) {
    console.error("KV read failed:", e);
  }

  try {
    // 2. Cache Miss: Truy vấn từ D1 Database nếu có liên kết DB
    if (!env.DB) {
      return json(DEFAULT_MENU);
    }

    // Sử dụng batch queries để giảm thiểu số vòng kết nối mạng
    const [categoriesRes, itemsRes] = await env.DB.batch([
      env.DB.prepare("SELECT id, name, slug FROM menu_categories WHERE tenant_id = ? ORDER BY sort_order ASC").bind(tenantId),
      env.DB.prepare("SELECT id, category_id, name, price, description, out_of_stock_until FROM menu_items WHERE tenant_id = ? ORDER BY sort_order ASC").bind(tenantId)
    ]);

    const categories = categoriesRes.results as Array<{ id: string; name: string; slug: string }>;
    const items = itemsRes.results as Array<{
      id: string;
      category_id: string;
      name: string;
      price: number;
      description: string | null;
      out_of_stock_until: string | null;
    }>;

    // Nếu không có dữ liệu nào trong D1 cho Tenant này, trả về DEFAULT_MENU
    if (categories.length === 0 || items.length === 0) {
      return json(DEFAULT_MENU);
    }

    // 3. Xây dựng cấu trúc JSON Menu tương thích ngược
    const menuData: Menu = {
      out_of_stock: []
    };

    // Tạo các mảng danh mục rỗng
    const catMap = new Map<string, string>(); // category_id -> slug
    for (const cat of categories) {
      menuData[cat.slug] = {};
      catMap.set(cat.id, cat.slug);
    }

    const now = new Date();
    let nextExpirationTime: Date | null = null;

    for (const item of items) {
      const categorySlug = catMap.get(item.category_id);
      if (!categorySlug) continue;

      // Nạp giá sản phẩm vào category tương ứng
      menuData[categorySlug][item.name] = item.price;

      // Xử lý trạng thái hết hàng tạm thời
      if (item.out_of_stock_until) {
        const oosUntil = new Date(item.out_of_stock_until);
        if (oosUntil > now) {
          // Món đang thực sự hết hàng
          menuData.out_of_stock!.push(`${categorySlug}:${item.name}`);

          // Tìm thời điểm phục hồi sớm nhất của món hết hàng tạm thời
          if (oosUntil.getFullYear() < 9000) { // Không tính vô thời hạn (9999)
            if (!nextExpirationTime || oosUntil < nextExpirationTime) {
              nextExpirationTime = oosUntil;
            }
          }
        }
      }
    }

    // 4. Tính toán TTL tối ưu cho KV Cache
    let ttl = 3600; // Mặc định là 1 giờ
    if (nextExpirationTime) {
      const secondsToExpiration = Math.ceil((nextExpirationTime.getTime() - now.getTime()) / 1000);
      // Giới hạn TTL tối thiểu 60 giây và tối đa 3600 giây
      ttl = Math.max(60, Math.min(3600, secondsToExpiration));
    }

    // 5. Ghi đè vào KV cache để phục vụ các request tiếp theo
    try {
      await env.ORDER_STATE.put(cacheKey, JSON.stringify(menuData), { expirationTtl: ttl });
    } catch (e) {
      console.error("KV write failed:", e);
    }

    return json(menuData);

  } catch (err: any) {
    console.error("D1 read failed, falling back to KV/Default:", err);
    
    // Fallback: Trong trường hợp D1 lỗi, đọc từ KV key cũ hoặc trả về DEFAULT_MENU
    try {
      const raw = await env.ORDER_STATE.get("menu:latest");
      if (raw) return json(JSON.parse(raw));
    } catch (e) {}

    return json(DEFAULT_MENU);
  }
}

// Helper sync menu to D1
async function syncMenuToD1(tenantId: string, menuData: any, env: Env): Promise<void> {
  if (!env.DB) return;

  // 1. Nạp danh mục và món ăn hiện có để ánh xạ ID tránh xung đột unique
  const { results: existingCats } = await env.DB.prepare(
    "SELECT id, slug FROM menu_categories WHERE tenant_id = ?"
  ).bind(tenantId).all();

  const { results: existingItems } = await env.DB.prepare(
    "SELECT id, category_id, name FROM menu_items WHERE tenant_id = ?"
  ).bind(tenantId).all();

  const catIdMap = new Map<string, string>();
  for (const cat of (existingCats || [])) {
    catIdMap.set(cat.slug as string, cat.id as string);
  }

  const itemIdMap = new Map<string, string>();
  for (const item of (existingItems || [])) {
    itemIdMap.set(`${item.category_id}:${item.name}`, item.id as string);
  }

  const statements: any[] = [];
  const defaultCategoryNames: Record<string, string> = {
    small: "Kích thước Nhỏ",
    large: "Kích thước Lớn",
    combo: "Set Combo",
    drinks: "Đồ uống",
    topping: "Topping thêm"
  };

  const activeCategoryIds: string[] = [];
  const activeItemIds: string[] = [];

  let catSortOrder = 1;
  for (const slug of Object.keys(menuData)) {
    if (slug === "out_of_stock") continue;

    let catId = catIdMap.get(slug);
    if (!catId) {
      catId = `${tenantId}_${slug}`;
    }
    activeCategoryIds.push(catId);

    const catName = defaultCategoryNames[slug] || (slug.charAt(0).toUpperCase() + slug.slice(1));
    statements.push(
      env.DB.prepare(
        `INSERT INTO menu_categories (id, tenant_id, name, slug, sort_order)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order`
      ).bind(catId, tenantId, catName, slug, catSortOrder++)
    );

    const itemsMap = menuData[slug];
    if (itemsMap && typeof itemsMap === "object") {
      let itemSortOrder = 1;
      for (const itemName of Object.keys(itemsMap)) {
        const price = Number(itemsMap[itemName]);
        if (isNaN(price)) continue;

        let itemId = itemIdMap.get(`${catId}:${itemName}`);
        if (!itemId) {
          itemId = `${tenantId}_${slug}_${itemName}`;
        }
        activeItemIds.push(itemId);

        statements.push(
          env.DB.prepare(
            `INSERT INTO menu_items (id, tenant_id, category_id, name, price, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET price = excluded.price, sort_order = excluded.sort_order`
          ).bind(itemId, tenantId, catId, itemName, price, itemSortOrder++)
        );
      }
    }
  }

  // Deletion queries for cleanup
  if (activeItemIds.length > 0) {
    const placeholders = activeItemIds.map(() => "?").join(",");
    statements.push(
      env.DB.prepare(
        `DELETE FROM menu_items WHERE tenant_id = ? AND id NOT IN (${placeholders})`
      ).bind(tenantId, ...activeItemIds)
    );
  } else {
    statements.push(
      env.DB.prepare("DELETE FROM menu_items WHERE tenant_id = ?").bind(tenantId)
    );
  }

  if (activeCategoryIds.length > 0) {
    const placeholders = activeCategoryIds.map(() => "?").join(",");
    statements.push(
      env.DB.prepare(
        `DELETE FROM menu_categories WHERE tenant_id = ? AND id NOT IN (${placeholders})`
      ).bind(tenantId, ...activeCategoryIds)
    );
  } else {
    statements.push(
      env.DB.prepare("DELETE FROM menu_categories WHERE tenant_id = ?").bind(tenantId)
    );
  }

  // Run all statements in a single batch
  await env.DB.batch(statements);
}

// POST /api/menu
export async function updateMenu(request: Request, env: Env): Promise<Response> {
  try {
    const tenantId = getTenantId(request);
    const data = await request.json();

    // 1. Đồng bộ vào D1 Database nếu có liên kết DB
    if (env.DB) {
      await syncMenuToD1(tenantId, data, env);
    }

    // 2. Ghi KV fallback cho tenant bsc
    if (tenantId === "bsc") {
      await env.ORDER_STATE.put("menu:latest", JSON.stringify(data));
    }

    // 3. Xóa cache đa hộ thuê để force reload ở lượt đọc sau
    const cacheKey = `tenant:${tenantId}:menu`;
    await env.ORDER_STATE.delete(cacheKey);

    return json({ success: true });
  } catch (e: any) {
    console.error("Update menu failed:", e);
    return json({ error: e.message || "Invalid data" }, 400);
  }
}

// POST /api/menu/stock-status
export async function updateStockStatus(request: Request, env: Env): Promise<Response> {
  try {
    const { category_slug, name, status, duration, until_date } = (await request.json()) as any;

    if (!category_slug || !name || !status) {
      return json({ error: "Missing category_slug, name, or status" }, 400);
    }

    const tenantId = getTenantId(request);
    let outOfStockUntil: string | null = null;

    if (status === "out_of_stock") {
      if (duration === "today") {
        // Tự động khôi phục lúc 04:00 AM ngày hôm sau (theo múi giờ GMT+7)
        const nowGmt7 = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
        const tomorrow4AmGmt7 = new Date(nowGmt7);
        tomorrow4AmGmt7.setDate(nowGmt7.getDate() + 1);
        tomorrow4AmGmt7.setHours(4, 0, 0, 0);
        // Chuyển ngược lại UTC để lưu DB
        outOfStockUntil = new Date(tomorrow4AmGmt7.getTime() - 7 * 60 * 60 * 1000).toISOString();
      } else if (duration === "multiple_days") {
        if (!until_date) {
          return json({ error: "Missing until_date for multiple_days duration" }, 400);
        }
        outOfStockUntil = new Date(until_date).toISOString();
      } else {
        // Vô thời hạn: Đặt mốc xa năm 9999
        outOfStockUntil = "9999-12-31T23:59:59.000Z";
      }
    }

    if (!env.DB) {
      return json({ error: "Database binding missing" }, 500);
    }

    // 1. Cập nhật trạng thái trong D1 Database
    const dbRes = await env.DB.prepare(
      `UPDATE menu_items 
       SET out_of_stock_until = ?, updated_at = datetime('now') 
       WHERE tenant_id = ? 
         AND name = ? 
         AND category_id = (SELECT id FROM menu_categories WHERE tenant_id = ? AND slug = ?)`
    ).bind(outOfStockUntil, tenantId, name, tenantId, category_slug).run();

    if (dbRes.meta.changes === 0) {
      return json({ error: "Menu item not found or unauthorized" }, 404);
    }

    // 2. Invalidate bộ nhớ đệm KV của tenant
    const cacheKey = `tenant:${tenantId}:menu`;
    await env.ORDER_STATE.delete(cacheKey);

    return json({ success: true, message: "Stock status updated and cache invalidated." });

  } catch (err: any) {
    console.error("Update stock status failed:", err);
    return json({ error: err.message || "Internal Server Error" }, 500);
  }
}
