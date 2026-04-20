const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

async function trpcQuery<T>(path: string, input: unknown, token: string): Promise<T> {
  const encoded = encodeURIComponent(JSON.stringify({ json: input }));
  const res = await fetch(`${API_BASE_URL}/trpc/${path}?input=${encoded}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Admin API ${path} failed (${res.status}): ${body}`);
  }
  const json = await res.json();
  return json.result?.data?.json ?? json.result?.data ?? json;
}

async function trpcMutate<T>(path: string, input: unknown, token: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/trpc/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ json: input }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Admin API ${path} failed (${res.status}): ${body}`);
  }
  const json = await res.json();
  return json.result?.data?.json ?? json.result?.data ?? json;
}

// --- Types ---

export interface AdminMetrics {
  totalOrders: number;
  totalRevenue: number;
  monthlyRevenue: number;
  avgOrderValue: number;
  totalUsers: number;
}

export interface AdminOrder {
  id: string;
  user_id: string;
  model_id: string | null;
  status: string;
  total_price_krw: number | null;
  payment_provider: string | null;
  payment_status: string | null;
  customer_name: string | null;
  customer_email: string | null;
  created_at: string;
  users: { email: string; display_name: string | null } | null;
}

export interface AdminPrintOrder {
  id: string;
  user_id: string;
  model_id: string;
  provider_name: string;
  status: string;
  material: string;
  quantity: number;
  price_krw: number | null;
  customer_name: string | null;
  customer_email: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  created_at: string;
  users: { email: string; display_name: string | null } | null;
}

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  created_at: string;
  totalOrders: number;
}

// --- API Functions ---

export async function getAdminMetrics(token: string): Promise<AdminMetrics> {
  return trpcQuery("admin.getMetrics", undefined, token);
}

export async function listAdminOrders(
  token: string,
  opts: { limit?: number; offset?: number; status?: string }
): Promise<{ orders: AdminOrder[]; total: number }> {
  return trpcQuery("admin.listOrders", opts, token);
}

export async function listAdminPrintOrders(
  token: string,
  opts: { limit?: number; offset?: number; status?: string; providerName?: string }
): Promise<{ orders: AdminPrintOrder[]; total: number }> {
  return trpcQuery("admin.listPrintOrders", opts, token);
}

export async function updateAdminOrderStatus(
  token: string,
  orderId: string,
  status: string
): Promise<{ id: string; status: string }> {
  return trpcMutate("admin.updateOrderStatus", { orderId, status }, token);
}

export async function updateAdminPrintOrderStatus(
  token: string,
  printOrderId: string,
  data: { status: string; trackingNumber?: string; trackingUrl?: string }
): Promise<{ id: string; status: string }> {
  return trpcMutate("admin.updatePrintOrderStatus", { printOrderId, ...data }, token);
}

export async function listAdminUsers(
  token: string,
  opts: { limit?: number; offset?: number }
): Promise<{ users: AdminUser[]; total: number }> {
  return trpcQuery("admin.listUsers", opts, token);
}

export async function checkAdminRole(token: string): Promise<boolean> {
  try {
    await getAdminMetrics(token);
    return true;
  } catch {
    return false;
  }
}
