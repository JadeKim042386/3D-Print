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
 * PrintOn3D (프린트온) — Korean 3D printing service based in Incheon.
 * REST API for instant quoting and order management.
 * Specializes in rapid prototyping with fast turnaround for Seoul metro area.
 * https://printon3d.co.kr
 */

const MATERIAL_PRICE_KRW: Record<string, number> = {
  PLA: 13000,
  ABS: 17000,
  PETG: 19000,
  Resin: 32000,
  Nylon: 36000,
  TPU: 24000,
  Metal: 140000,
};

const MATERIAL_DAYS: Record<string, number> = {
  PLA: 2,
  ABS: 2,
  PETG: 3,
  Resin: 4,
  Nylon: 5,
  TPU: 3,
  Metal: 9,
};

interface PrintOn3DConfig {
  apiKey: string;
  baseUrl?: string;
}

interface PrintOn3DQuoteResponse {
  id: string;
  total_price: number;
  lead_time_days: number;
  expires_at: string;
}

interface PrintOn3DOrderResponse {
  order_id: string;
  status: string;
  expected_delivery: string;
}

interface PrintOn3DStatusResponse {
  order_id: string;
  state: string;
  courier: string | null;
  tracking_no: string | null;
  updated: string;
}

export class PrintOn3DProvider implements PrintProvider {
  readonly name = "printon3d" as const;
  readonly displayName = "프린트온3D";
  private readonly config: PrintOn3DConfig;
  private readonly baseUrl: string;

  constructor(config: PrintOn3DConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl ?? "https://api.printon3d.co.kr/v2";
  }

  async getQuote(request: PrintQuoteRequest): Promise<PrintQuote> {
    const response = await fetch(`${this.baseUrl}/quote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.config.apiKey,
      },
      body: JSON.stringify({
        model_url: request.modelFileUrl,
        material: request.material,
        qty: request.quantity,
        dest_zip: request.shippingAddress?.zipCode,
      }),
    });

    if (!response.ok) {
      return this.estimateQuote(request);
    }

    const data = (await response.json()) as PrintOn3DQuoteResponse;

    return {
      providerName: "printon3d",
      providerDisplayName: this.displayName,
      priceKrw: data.total_price,
      estimatedDays: data.lead_time_days,
      material: request.material,
      quoteMethod: "api",
      providerQuoteId: data.id,
      notes: null,
    };
  }

  async createOrder(request: PrintOrderRequest): Promise<PrintOrderResult> {
    const response = await fetch(`${this.baseUrl}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.config.apiKey,
      },
      body: JSON.stringify({
        model_url: request.modelFileUrl,
        material: request.material,
        qty: request.quantity,
        amount_krw: request.priceKrw,
        recipient: {
          name: request.shippingAddress.name,
          phone: request.shippingAddress.phone,
          addr1: request.shippingAddress.addressLine1,
          addr2: request.shippingAddress.addressLine2 ?? "",
          city: request.shippingAddress.city,
          province: request.shippingAddress.province,
          postal_code: request.shippingAddress.zipCode,
        },
        buyer_email: request.customerEmail,
        buyer_name: request.customerName,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PrintOn3D order failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as PrintOn3DOrderResponse;

    return {
      providerOrderId: data.order_id,
      status: "order_placed",
      estimatedDeliveryDate: data.expected_delivery,
    };
  }

  async getOrderStatus(providerOrderId: string): Promise<PrintOrderStatusResult> {
    const response = await fetch(`${this.baseUrl}/orders/${providerOrderId}`, {
      headers: { "X-Api-Key": this.config.apiKey },
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

    const data = (await response.json()) as PrintOn3DStatusResponse;
    const trackingUrl = data.tracking_no && data.courier
      ? `https://tracker.delivery/${data.courier}/${data.tracking_no}`
      : null;

    return {
      providerOrderId: data.order_id,
      status: this.mapStatus(data.state),
      trackingNumber: data.tracking_no,
      trackingUrl,
      updatedAt: data.updated,
    };
  }

  verifyWebhook(body: string, signature: string): PrintWebhookEvent {
    const crypto = require("crypto") as typeof import("crypto");
    const expected = crypto
      .createHmac("sha256", this.config.apiKey)
      .update(body)
      .digest("hex");

    if (signature !== `sha256=${expected}`) {
      throw new Error("Invalid PrintOn3D webhook signature");
    }

    const payload = JSON.parse(body) as {
      order_id: string;
      state: string;
      courier?: string;
      tracking_no?: string;
    };

    const trackingUrl = payload.tracking_no && payload.courier
      ? `https://tracker.delivery/${payload.courier}/${payload.tracking_no}`
      : null;

    return {
      providerName: "printon3d",
      providerOrderId: payload.order_id,
      status: this.mapStatus(payload.state),
      trackingNumber: payload.tracking_no ?? null,
      trackingUrl,
    };
  }

  private mapStatus(state: string): PrintOrderStatusResult["status"] {
    const mapping: Record<string, PrintOrderStatusResult["status"]> = {
      received: "order_placed",
      queued: "order_placed",
      printing: "printing",
      post_processing: "printing",
      shipped: "shipped",
      delivered: "delivered",
      cancelled: "cancelled",
      error: "failed",
    };
    return mapping[state] ?? "order_placed";
  }

  private estimateQuote(request: PrintQuoteRequest): PrintQuote {
    const basePrice = MATERIAL_PRICE_KRW[request.material] ?? 19000;
    const estimatedDays = MATERIAL_DAYS[request.material] ?? 4;

    return {
      providerName: "printon3d",
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
