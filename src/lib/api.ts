const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export class CreditsExhaustedError extends Error {
  constructor() {
    super("Credits exhausted");
    this.name = "CreditsExhaustedError";
  }
}

export interface GenerateRequest {
  prompt: string;
}

export interface GenerateResponse {
  id: string;
  status: "pending" | "processing" | "ready" | "error";
}

export interface MeshQuality {
  triangleCount: number;
  printabilityScore: number | null;
  volume_mm3: number | null;
  surfaceArea_mm2: number | null;
}

export interface ModelResponse {
  id: string;
  status: "pending" | "processing" | "ready" | "error";
  prompt: string;
  stlUrl?: string;
  sourceImageUrl?: string | null;
  isPublic?: boolean;
  createdAt: string;
  meshQuality?: MeshQuality | null;
  printQualityScore?: number | null;
  printReady?: boolean | null;
}

export interface ImageGenerateRequest {
  imageUrl: string;
  dimensions: {
    width_mm: number;
    height_mm: number;
    depth_mm: number;
    mode?: "proportional" | "exact";
  };
}

export interface ImageGenerateResponse {
  modelId: string;
  jobId: string;
  status: "queued";
  queueName: string;
}

export async function generateModelFromImage(
  data: ImageGenerateRequest,
  token: string
): Promise<ImageGenerateResponse> {
  const res = await fetch(`${API_BASE_URL}/trpc/dimensionGenerate.generateFromImage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ json: data }),
  });

  if (!res.ok) {
    throw new Error(`Image generate failed: ${res.status}`);
  }

  const json = await res.json();
  return json.result?.data?.json ?? json.result?.data ?? json;
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

  if (res.status === 402) {
    throw new CreditsExhaustedError();
  }

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

// --- Model Export Types ---

export type ExportFormat = "stl" | "obj" | "glb" | "gltf" | "3mf";
export type ExportStatus = "pending" | "converting" | "ready" | "failed";

export interface ExportRequestResponse {
  exportId: string | null;
  status: ExportStatus;
  format: ExportFormat;
  fileUrl: string | null;
}

export interface ModelExportsResponse {
  modelId: string;
  sourceFormat: string;
  sourceFileUrl: string | null;
  exports: Array<{
    id: string;
    format: string;
    status: string;
    file_url: string | null;
    file_size_bytes: number | null;
  }>;
}

export async function requestModelExport(
  modelId: string,
  format: ExportFormat,
  token: string
): Promise<ExportRequestResponse> {
  const res = await fetch(`${API_BASE_URL}/models/${modelId}/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ format }),
  });
  if (!res.ok) throw new Error(`Export request failed: ${res.status}`);
  return res.json();
}

export async function getModelExports(
  modelId: string,
  token: string
): Promise<ModelExportsResponse> {
  const res = await fetch(`${API_BASE_URL}/models/${modelId}/exports`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get exports failed: ${res.status}`);
  return res.json();
}

// --- Credits & Subscription Types ---

export type SubscriptionPlan = "free" | "pro" | "business";
export type SubscriptionStatus = "active" | "cancelled" | "expired";

export interface CreditsBalance {
  used: number;
  total: number;
  remaining: number;
  plan: SubscriptionPlan;
  resetAt: string;
}

export interface SubscriptionInfo {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  tossCustomerId: string | null;
}

export interface GenerationHistoryEntry {
  id: string;
  prompt: string | null;
  sourceImageUrl: string | null;
  status: "pending" | "processing" | "ready" | "error";
  creditsUsed: number;
  createdAt: string;
}

export interface GenerationHistoryResponse {
  generations: GenerationHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CheckoutSessionResponse {
  checkoutUrl: string;
  orderId: string;
}

// --- Credits & Subscription API ---

export async function getCreditsBalance(token: string): Promise<CreditsBalance> {
  const res = await fetch(`${API_BASE_URL}/credits/balance`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get credits failed: ${res.status}`);
  return res.json();
}

export async function getSubscription(token: string): Promise<SubscriptionInfo | null> {
  const res = await fetch(`${API_BASE_URL}/subscription`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Get subscription failed: ${res.status}`);
  return res.json();
}

export async function createCheckoutSession(
  plan: Exclude<SubscriptionPlan, "free">,
  token: string
): Promise<CheckoutSessionResponse> {
  const res = await fetch(`${API_BASE_URL}/subscription/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan }),
  });
  if (!res.ok) throw new Error(`Checkout failed: ${res.status}`);
  return res.json();
}

export async function createCreditTopupSession(
  credits: number,
  token: string
): Promise<CheckoutSessionResponse> {
  const res = await fetch(`${API_BASE_URL}/credits/topup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ credits }),
  });
  if (!res.ok) throw new Error(`Topup checkout failed: ${res.status}`);
  return res.json();
}

export async function cancelSubscription(token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/subscription/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Cancel subscription failed: ${res.status}`);
}

export async function listGenerationHistory(
  token: string,
  page: number = 1,
  pageSize: number = 20
): Promise<GenerationHistoryResponse> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const res = await fetch(`${API_BASE_URL}/generations?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List history failed: ${res.status}`);
  return res.json();
}
