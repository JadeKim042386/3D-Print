import { createHmac } from "node:crypto";
import type {
  PaymentProvider,
  CreateOrderRequest,
  CreateOrderResult,
  ConfirmPaymentRequest,
  ConfirmPaymentResult,
  CancelPaymentRequest,
  CancelPaymentResult,
  PaymentWebhookEvent,
} from "../types/payment.js";

const TOSS_API_BASE = "https://api.tosspayments.com/v1";

export class TossPaymentsProvider implements PaymentProvider {
  readonly name = "toss" as const;

  private readonly secretKey: string;
  private readonly clientKey: string;
  private readonly webhookSecret: string;

  constructor(opts: {
    secretKey: string;
    clientKey: string;
    webhookSecret?: string;
  }) {
    this.secretKey = opts.secretKey;
    this.clientKey = opts.clientKey;
    this.webhookSecret = opts.webhookSecret ?? "";
  }

  private get authHeader(): string {
    return `Basic ${Buffer.from(`${this.secretKey}:`).toString("base64")}`;
  }

  async createOrder(request: CreateOrderRequest): Promise<CreateOrderResult> {
    // Toss Payments uses a client-side SDK for the checkout UI.
    // The server generates an orderId and returns the clientKey
    // so the frontend can initialize TossPayments.js
    const orderId = `order_${Date.now()}_${request.modelId.slice(0, 8)}`;

    return {
      orderId,
      checkoutData: {
        clientKey: this.clientKey,
        orderId,
        amount: String(request.amount),
        orderName: request.orderName,
        customerName: request.customerName,
        customerEmail: request.customerEmail,
      },
    };
  }

  async confirmPayment(
    request: ConfirmPaymentRequest
  ): Promise<ConfirmPaymentResult> {
    const response = await fetch(`${TOSS_API_BASE}/payments/confirm`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentKey: request.paymentKey,
        orderId: request.orderId,
        amount: request.amount,
      }),
    });

    if (!response.ok) {
      const error = (await response.json()) as { message: string; code: string };
      throw new Error(`Toss confirm failed [${error.code}]: ${error.message}`);
    }

    const data = (await response.json()) as {
      paymentKey: string;
      orderId: string;
      status: string;
      method: string;
      totalAmount: number;
      approvedAt: string;
      receipt: { url: string } | null;
    };

    return {
      paymentKey: data.paymentKey,
      orderId: data.orderId,
      status: data.status as ConfirmPaymentResult["status"],
      method: data.method,
      totalAmount: data.totalAmount,
      approvedAt: data.approvedAt,
      receiptUrl: data.receipt?.url ?? null,
    };
  }

  async cancelPayment(
    request: CancelPaymentRequest
  ): Promise<CancelPaymentResult> {
    const response = await fetch(
      `${TOSS_API_BASE}/payments/${request.paymentKey}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cancelReason: request.cancelReason,
          ...(request.cancelAmount != null && {
            cancelAmount: request.cancelAmount,
          }),
        }),
      }
    );

    if (!response.ok) {
      const error = (await response.json()) as { message: string; code: string };
      throw new Error(`Toss cancel failed [${error.code}]: ${error.message}`);
    }

    const data = (await response.json()) as {
      paymentKey: string;
      orderId: string;
      status: string;
      cancels: Array<{ cancelAmount: number; canceledAt: string }>;
    };

    const latestCancel = data.cancels[data.cancels.length - 1]!;

    return {
      paymentKey: data.paymentKey,
      orderId: data.orderId,
      status: data.status as CancelPaymentResult["status"],
      cancelledAmount: latestCancel.cancelAmount,
      cancelledAt: latestCancel.canceledAt,
    };
  }

  verifyWebhook(body: string, signature: string): PaymentWebhookEvent {
    if (this.webhookSecret) {
      const expected = createHmac("sha256", this.webhookSecret)
        .update(body)
        .digest("hex");

      if (expected !== signature) {
        throw new Error("Invalid webhook signature");
      }
    }

    const parsed = JSON.parse(body) as {
      eventType: string;
      data: {
        paymentKey: string;
        orderId: string;
        status: string;
        [key: string]: unknown;
      };
    };

    return {
      eventType: parsed.eventType,
      data: {
        ...parsed.data,
        status: parsed.data.status as PaymentWebhookEvent["data"]["status"],
      },
    };
  }
}
