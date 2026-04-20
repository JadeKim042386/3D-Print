/** Supported print provider names */
export type PrintProviderName = "3dline" | "craftcloud" | "creatable3d" | "printon3d";

/** Materials available for 3D printing */
export type PrintMaterial =
  | "PLA"
  | "ABS"
  | "PETG"
  | "Resin"
  | "Nylon"
  | "TPU"
  | "Metal";

/** Print order status lifecycle */
export type PrintOrderStatus =
  | "quote_requested"
  | "quoted"
  | "order_placed"
  | "printing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "failed";

/** A quote from a single print provider */
export interface PrintQuote {
  providerName: PrintProviderName;
  /** Display name in Korean or English */
  providerDisplayName: string;
  priceKrw: number;
  estimatedDays: number;
  material: PrintMaterial;
  /** Whether provider was contacted via API or email fallback */
  quoteMethod: "api" | "email";
  /** Provider-specific quote reference */
  providerQuoteId: string | null;
  notes: string | null;
}

/** Request for quotes from print providers */
export interface PrintQuoteRequest {
  /** Public URL to the model file (STL/OBJ/GLB) */
  modelFileUrl: string;
  material: PrintMaterial;
  quantity: number;
  /** Shipping address for delivery cost estimation */
  shippingAddress?: {
    city: string;
    province: string;
    zipCode: string;
    country: string;
  };
}

/** Request to place a print order */
export interface PrintOrderRequest {
  userId: string;
  modelId: string;
  modelFileUrl: string;
  providerName: PrintProviderName;
  material: PrintMaterial;
  quantity: number;
  priceKrw: number;
  shippingAddress: {
    name: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    province: string;
    zipCode: string;
    country: string;
  };
  customerEmail: string;
  customerName: string;
}

/** Result of placing a print order */
export interface PrintOrderResult {
  providerOrderId: string;
  status: PrintOrderStatus;
  estimatedDeliveryDate: string | null;
}

/** Status update from a print provider */
export interface PrintOrderStatusResult {
  providerOrderId: string;
  status: PrintOrderStatus;
  trackingNumber: string | null;
  trackingUrl: string | null;
  updatedAt: string;
}

/** Webhook event from print provider */
export interface PrintWebhookEvent {
  providerName: PrintProviderName;
  providerOrderId: string;
  status: PrintOrderStatus;
  trackingNumber: string | null;
  trackingUrl: string | null;
}

/**
 * Abstract interface for 3D print providers.
 * Implement this to add Korean providers (3DLINE, etc.) or international fallbacks (Craftcloud).
 */
export interface PrintProvider {
  readonly name: PrintProviderName;
  readonly displayName: string;

  /** Get a quote for printing a model */
  getQuote(request: PrintQuoteRequest): Promise<PrintQuote>;

  /** Place a print order with this provider */
  createOrder(request: PrintOrderRequest): Promise<PrintOrderResult>;

  /** Check order status */
  getOrderStatus(providerOrderId: string): Promise<PrintOrderStatusResult>;

  /** Verify and parse a webhook payload (throws if not supported) */
  verifyWebhook(body: string, signature: string): PrintWebhookEvent;
}
