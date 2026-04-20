import { createHmac } from "node:crypto";
import type {
  PrintProvider,
  PrintQuote,
  PrintQuoteRequest,
  PrintOrderRequest,
  PrintOrderResult,
  PrintOrderStatusResult,
  PrintWebhookEvent,
  PrintOrderStatus,
} from "../types/print.js";

interface CraftcloudConfig {
  apiKey: string;
  baseUrl?: string;
}

/** Craftcloud API response types */
interface CraftcloudQuoteResponse {
  id: string;
  price: {
    amount: number;
    currency: string;
  };
  estimatedDeliveryDays: number;
  material: string;
}

interface CraftcloudOrderResponse {
  orderId: string;
  status: string;
  estimatedDelivery: string | null;
}

interface CraftcloudStatusResponse {
  orderId: string;
  status: string;
  tracking: {
    number: string | null;
    url: string | null;
  } | null;
  updatedAt: string;
}

const CRAFTCLOUD_STATUS_MAP: Record<string, PrintOrderStatus> = {
  pending: "order_placed",
  processing: "printing",
  printing: "printing",
  shipped: "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
  failed: "failed",
};

/** Approximate USD to KRW conversion rate */
const USD_TO_KRW = 1350;

export class CraftcloudProvider implements PrintProvider {
  readonly name = "craftcloud" as const;
  readonly displayName = "Craftcloud (International)";
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: CraftcloudConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://api.craftcloud3d.com/v1";
  }

  async getQuote(request: PrintQuoteRequest): Promise<PrintQuote> {
    const res = await fetch(`${this.baseUrl}/quotes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        modelUrl: request.modelFileUrl,
        material: request.material.toLowerCase(),
        quantity: request.quantity,
        shipping: request.shippingAddress
          ? {
              country: request.shippingAddress.country,
              zipCode: request.shippingAddress.zipCode,
            }
          : { country: "KR" },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Craftcloud getQuote failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as CraftcloudQuoteResponse;

    // Convert USD to KRW
    const priceKrw =
      data.price.currency === "KRW"
        ? data.price.amount
        : Math.round(data.price.amount * USD_TO_KRW);

    return {
      providerName: "craftcloud",
      providerDisplayName: this.displayName,
      priceKrw,
      estimatedDays: data.estimatedDeliveryDays,
      material: request.material,
      quoteMethod: "api",
      providerQuoteId: data.id,
      notes:
        data.price.currency !== "KRW"
          ? `원래 가격: ${data.price.currency} ${data.price.amount} (환율 적용)`
          : null,
    };
  }

  async createOrder(request: PrintOrderRequest): Promise<PrintOrderResult> {
    const addr = request.shippingAddress;
    const res = await fetch(`${this.baseUrl}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        modelUrl: request.modelFileUrl,
        material: request.material.toLowerCase(),
        quantity: request.quantity,
        shipping: {
          name: addr.name,
          phone: addr.phone,
          addressLine1: addr.addressLine1,
          addressLine2: addr.addressLine2,
          city: addr.city,
          state: addr.province,
          zipCode: addr.zipCode,
          country: addr.country,
        },
        customer: {
          name: request.customerName,
          email: request.customerEmail,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Craftcloud createOrder failed (${res.status}): ${body}`
      );
    }

    const data = (await res.json()) as CraftcloudOrderResponse;

    return {
      providerOrderId: data.orderId,
      status: "order_placed",
      estimatedDeliveryDate: data.estimatedDelivery,
    };
  }

  async getOrderStatus(
    providerOrderId: string
  ): Promise<PrintOrderStatusResult> {
    const res = await fetch(`${this.baseUrl}/orders/${providerOrderId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Craftcloud getOrderStatus failed (${res.status}): ${body}`
      );
    }

    const data = (await res.json()) as CraftcloudStatusResponse;

    return {
      providerOrderId: data.orderId,
      status: CRAFTCLOUD_STATUS_MAP[data.status] ?? "order_placed",
      trackingNumber: data.tracking?.number ?? null,
      trackingUrl: data.tracking?.url ?? null,
      updatedAt: data.updatedAt,
    };
  }

  verifyWebhook(body: string, signature: string): PrintWebhookEvent {
    // Craftcloud sends webhook events with HMAC-SHA256 signature
    const expected = createHmac("sha256", this.apiKey)
      .update(body)
      .digest("hex");

    if (signature !== expected) {
      throw new Error("Invalid Craftcloud webhook signature");
    }

    const payload = JSON.parse(body) as {
      orderId: string;
      status: string;
      tracking?: { number: string | null; url: string | null };
    };

    return {
      providerName: "craftcloud",
      providerOrderId: payload.orderId,
      status: CRAFTCLOUD_STATUS_MAP[payload.status] ?? "order_placed",
      trackingNumber: payload.tracking?.number ?? null,
      trackingUrl: payload.tracking?.url ?? null,
    };
  }
}
