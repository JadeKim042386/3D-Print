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
  isPublic?: boolean;
  createdAt: string;
}

export interface PublicModelResponse {
  id: string;
  prompt: string;
  stlUrl: string;
  isPublic: boolean;
  createdAt: string;
  ownerName?: string;
}

export interface GalleryResponse {
  models: PublicModelResponse[];
  total: number;
  page: number;
  pageSize: number;
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

export interface PrintProviderInfo {
  name: string;
  displayName: string;
  displayNameKo: string;
  description: string | null;
  descriptionKo: string | null;
  location: string;
  supportsApi: boolean;
  supportsWebhook: boolean;
  materials: string[];
  minLeadDays: number;
  active: boolean;
}

export interface PrintProvidersResponse {
  providers: PrintProviderInfo[];
}

export interface PrintQuote {
  providerName: string;
  providerDisplayName: string;
  priceKrw: number;
  estimatedDays: number;
  material: string;
  quoteMethod: "api" | "email";
  providerQuoteId: string | null;
  notes: string | null;
}

export interface PrintQuotesResponse {
  modelId: string;
  material: string;
  quantity: number;
  quotes: PrintQuote[];
}

/** Legacy compat type used by the print page */
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

export async function getPrintProviders(): Promise<PrintProvidersResponse> {
  const res = await fetch(`${API_BASE_URL}/print-providers`);
  if (!res.ok) throw new Error(`Get providers failed: ${res.status}`);
  return res.json();
}

export async function getProviderQuotes(
  modelId: string,
  token: string,
  material: string = "PLA",
  quantity: number = 1
): Promise<PrintQuotesResponse> {
  const params = new URLSearchParams({ material, quantity: String(quantity) });
  const res = await fetch(`${API_BASE_URL}/models/${modelId}/quotes?${params}`, {
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

// --- Public / Gallery ---

export async function getPublicModel(id: string): Promise<PublicModelResponse> {
  const res = await fetch(`${API_BASE_URL}/models/${id}/public`);

  if (!res.ok) {
    throw new Error(`Get public model failed: ${res.status}`);
  }

  return res.json();
}

export async function getGalleryModels(
  page: number = 1,
  pageSize: number = 12
): Promise<GalleryResponse> {
  const res = await fetch(
    `${API_BASE_URL}/gallery?page=${page}&pageSize=${pageSize}`
  );

  if (!res.ok) {
    throw new Error(`Get gallery failed: ${res.status}`);
  }

  return res.json();
}

export async function updateModelVisibility(
  modelId: string,
  isPublic: boolean,
  token: string
): Promise<ModelResponse> {
  const res = await fetch(`${API_BASE_URL}/models/${modelId}/visibility`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ isPublic }),
  });

  if (!res.ok) {
    throw new Error(`Update visibility failed: ${res.status}`);
  }

  return res.json();
}
