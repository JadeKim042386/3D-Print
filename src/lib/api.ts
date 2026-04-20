const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface GenerateRequest {
  prompt: string;
}

export interface GenerateResponse {
  id: string;
  status: "pending" | "processing" | "ready" | "error";
}

export interface ModelResponse {
  id: string;
  status: "pending" | "processing" | "ready" | "error";
  prompt: string;
  stlUrl?: string;
  createdAt: string;
}

export async function generateModel(
  data: GenerateRequest,
  token: string
): Promise<GenerateResponse> {
  const res = await fetch(`${API_BASE_URL}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(`Generate failed: ${res.status}`);
  }

  return res.json();
}

export async function getModel(
  id: string,
  token: string
): Promise<ModelResponse> {
  const res = await fetch(`${API_BASE_URL}/models/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Get model failed: ${res.status}`);
  }

  return res.json();
}

// --- Print Provider Types ---

export interface PrintProvider {
  id: string;
  name: string;
  materials: PrintMaterial[];
  estimatedDays: number;
  available: boolean;
}

export interface PrintMaterial {
  id: string;
  name: string;
  priceKrw: number;
}

export interface PrintQuotesResponse {
  providers: PrintProvider[];
}

export async function getProviderQuotes(
  modelId: string,
  token: string
): Promise<PrintQuotesResponse> {
  const res = await fetch(`${API_BASE_URL}/models/${modelId}/quotes`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Get quotes failed: ${res.status}`);
  }

  return res.json();
}

// --- Order Types ---

export type OrderStatus =
  | "pending"
  | "paid"
  | "printing"
  | "shipped"
  | "delivered"
  | "failed";

export type PaymentMethod = "card" | "kakaopay";

export interface CreateOrderRequest {
  modelId: string;
  providerId: string;
  materialId: string;
  paymentMethod: PaymentMethod;
}

export interface OrderResponse {
  id: string;
  status: OrderStatus;
  modelId: string;
  providerId: string;
  providerName: string;
  materialName: string;
  priceKrw: number;
  estimatedDays: number;
  paymentMethod: PaymentMethod;
  tossPaymentKey?: string;
  createdAt: string;
}

export async function createOrder(
  data: CreateOrderRequest,
  token: string
): Promise<OrderResponse> {
  const res = await fetch(`${API_BASE_URL}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(`Create order failed: ${res.status}`);
  }

  return res.json();
}

export async function getOrder(
  orderId: string,
  token: string
): Promise<OrderResponse> {
  const res = await fetch(`${API_BASE_URL}/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Get order failed: ${res.status}`);
  }

  return res.json();
}

export async function listModels(
  token: string
): Promise<ModelResponse[]> {
  const res = await fetch(`${API_BASE_URL}/models`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`List models failed: ${res.status}`);
  }

  return res.json();
}

export async function listOrders(
  token: string
): Promise<OrderResponse[]> {
  const res = await fetch(`${API_BASE_URL}/orders`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`List orders failed: ${res.status}`);
  }

  return res.json();
}

export async function confirmPayment(
  orderId: string,
  paymentKey: string,
  token: string
): Promise<OrderResponse> {
  const res = await fetch(`${API_BASE_URL}/orders/${orderId}/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ paymentKey }),
  });

  if (!res.ok) {
    throw new Error(`Confirm payment failed: ${res.status}`);
  }

  return res.json();
}
