import type {
  PrintProvider,
  PrintQuote,
  PrintQuoteRequest,
  PrintOrderRequest,
  PrintOrderResult,
  PrintOrderStatusResult,
  PrintWebhookEvent,
} from "../types/print.js";

/**
 * Creatable3D (크리에이터블3D) — Seoul-based Korean 3D printing marketplace.
 * Supports REST API for quotes, order placement, and webhook status updates.
 * https://creatable3d.com
 */

const MATERIAL_PRICE_MULTIPLIER_KRW: Record<string, number> = {
  PLA: 12000,
  ABS: 16000,
  PETG: 18000,
  Resin: 30000,
  Nylon: 38000,
  TPU: 22000,
  Metal: 130000,
};

const MATERIAL_LEAD_DAYS: Record<string, number> = {
  PLA: 2,
  ABS: 3,
  PETG: 3,
  Resin: 4,
  Nylon: 4,
  TPU: 3,
  Metal: 8,
};

interface Creatable3DConfig {
  apiKey: string;
  baseUrl?: string;
}

interface Creatable3DQuoteResponse {
  quote_id: string;
  price_krw: number;
  estimated_days: number;
  material: string;
  available: boolean;
}

interface Creatable3DOrderResponse {
  order_id: string;
  status: string;
  estimated_delivery: string;
}

interface Creatable3DStatusResponse {
  order_id: string;
  status: string;
  tracking_number: string | null;
  tracking_url: string | null;
  updated_at: string;
}

export class Creatable3DProvider implements PrintProvider {
  readonly name = "creatable3d" as const;
  readonly displayName = "크리에이터블3D";
  private readonly config: Creatable3DConfig;
  private readonly baseUrl: string;

  constructor(config: Creatable3DConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl ?? "https://api.creatable3d.com/v1";
  }

  async getQuote(request: PrintQuoteRequest): Promise<PrintQuote> {
    const response = await fetch(`${this.baseUrl}/quotes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        file_url: request.modelFileUrl,
        material: request.material.toLowerCase(),
        quantity: request.quantity,
        shipping_city: request.shippingAddress?.city,
        shipping_zip: request.shippingAddress?.zipCode,
      }),
    });

    if (!response.ok) {
      // Fallback to estimate pricing if API is unreachable
      return this.estimateQuote(request);
    }

    const data = (await response.json()) as Creatable3DQuoteResponse;

    return {
      providerName: "creatable3d",
      providerDisplayName: this.displayName,
      priceKrw: data.price_krw,
      estimatedDays: data.estimated_days,
      material: request.material,
      quoteMethod: "api",
      providerQuoteId: data.quote_id,
      notes: null,
    };
  }

  async createOrder(request: PrintOrderRequest): Promise<PrintOrderResult> {
    const response = await fetch(`${this.baseUrl}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        file_url: request.modelFileUrl,
        material: request.material.toLowerCase(),
        quantity: request.quantity,
        price_krw: request.priceKrw,
        shipping: {
          name: request.shippingAddress.name,
          phone: request.shippingAddress.phone,
          address1: request.shippingAddress.addressLine1,
          address2: request.shippingAddress.addressLine2 ?? "",
          city: request.shippingAddress.city,
          province: request.shippingAddress.province,
          zip_code: request.shippingAddress.zipCode,
        },
        customer_email: request.customerEmail,
        customer_name: request.customerName,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Creatable3D order failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as Creatable3DOrderResponse;

    return {
      providerOrderId: data.order_id,
      status: "order_placed",
      estimatedDeliveryDate: data.estimated_delivery,
    };
  }

  async getOrderStatus(providerOrderId: string): Promise<PrintOrderStatusResult> {
    const response = await fetch(`${this.baseUrl}/orders/${providerOrderId}`, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    });

    if (!response.ok) {
      return {
        providerOrderId,
        status: "order_placed",
        trackingNumber: null,
        trackingUrl: null,
        updatedAt: new Date().toISOString(),
      };
    }

    const data = (await response.json()) as Creatable3DStatusResponse;

    return {
      providerOrderId: data.order_id,
      status: this.mapStatus(data.status),
      trackingNumber: data.tracking_number,
      trackingUrl: data.tracking_url,
      updatedAt: data.updated_at,
    };
  }

  verifyWebhook(body: string, signature: string): PrintWebhookEvent {
    // HMAC-SHA256 verification
    const crypto = require("crypto") as typeof import("crypto");
    const expected = crypto
      .createHmac("sha256", this.config.apiKey)
      .update(body)
      .digest("hex");

    if (signature !== expected) {
      throw new Error("Invalid Creatable3D webhook signature");
    }

    const payload = JSON.parse(body) as {
      order_id: string;
      status: string;
      tracking_number?: string;
      tracking_url?: string;
    };

    return {
      providerName: "creatable3d",
      providerOrderId: payload.order_id,
      status: this.mapStatus(payload.status),
      trackingNumber: payload.tracking_number ?? null,
      trackingUrl: payload.tracking_url ?? null,
    };
  }

  private mapStatus(
    apiStatus: string
  ): PrintOrderStatusResult["status"] {
    const mapping: Record<string, PrintOrderStatusResult["status"]> = {
      pending: "order_placed",
      confirmed: "order_placed",
      printing: "printing",
      shipped: "shipped",
      delivered: "delivered",
      cancelled: "cancelled",
      failed: "failed",
    };
    return mapping[apiStatus] ?? "order_placed";
  }

  private estimateQuote(request: PrintQuoteRequest): PrintQuote {
    const basePrice = MATERIAL_PRICE_MULTIPLIER_KRW[request.material] ?? 18000;
    const estimatedDays = MATERIAL_LEAD_DAYS[request.material] ?? 4;

    return {
      providerName: "creatable3d",
      providerDisplayName: this.displayName,
      priceKrw: basePrice * request.quantity,
      estimatedDays,
      material: request.material,
      quoteMethod: "api",
      providerQuoteId: null,
      notes: "예상 견적 (API 연결 실패 시 추정치)",
    };
  }
}
