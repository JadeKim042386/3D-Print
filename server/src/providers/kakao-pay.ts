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

const KAKAOPAY_API_BASE = "https://open-api.kakaopay.com/online/v1/payment";

export class KakaoPayProvider implements PaymentProvider {
  readonly name = "kakaopay" as const;

  private readonly secretKey: string;
  private readonly cid: string;

  constructor(opts: { secretKey: string; cid?: string }) {
    this.secretKey = opts.secretKey;
    this.cid = opts.cid ?? "TC0ONETIME";
  }

  private get headers() {
    return {
      Authorization: `SECRET_KEY ${this.secretKey}`,
      "Content-Type": "application/json",
    } as const;
  }

  async createOrder(request: CreateOrderRequest): Promise<CreateOrderResult> {
    const orderId = `kp_${Date.now()}_${request.modelId.slice(0, 8)}`;

    const response = await fetch(`${KAKAOPAY_API_BASE}/ready`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        cid: this.cid,
        partner_order_id: orderId,
        partner_user_id: request.customerEmail,
        item_name: request.orderName,
        quantity: 1,
        total_amount: request.amount,
        tax_free_amount: 0,
        approval_url: `${process.env.APP_URL ?? "http://localhost:3000"}/payments/kakao/success`,
        cancel_url: `${process.env.APP_URL ?? "http://localhost:3000"}/payments/kakao/cancel`,
        fail_url: `${process.env.APP_URL ?? "http://localhost:3000"}/payments/kakao/fail`,
      }),
    });

    if (!response.ok) {
      const error = (await response.json()) as { msg: string; code: number };
      throw new Error(`KakaoPay ready failed [${error.code}]: ${error.msg}`);
    }

    const data = (await response.json()) as {
      tid: string;
      next_redirect_pc_url: string;
      next_redirect_mobile_url: string;
    };

    return {
      orderId,
      checkoutData: {
        tid: data.tid,
        orderId,
        redirectUrl: data.next_redirect_pc_url,
        mobileRedirectUrl: data.next_redirect_mobile_url,
      },
    };
  }

  async confirmPayment(
    request: ConfirmPaymentRequest
  ): Promise<ConfirmPaymentResult> {
    // For KakaoPay, paymentKey is the pg_token returned after user approval
    const response = await fetch(`${KAKAOPAY_API_BASE}/approve`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        cid: this.cid,
        tid: request.paymentKey,
        partner_order_id: request.orderId,
        partner_user_id: "",
        pg_token: request.paymentKey,
      }),
    });

    if (!response.ok) {
      const error = (await response.json()) as { msg: string; code: number };
      throw new Error(`KakaoPay approve failed [${error.code}]: ${error.msg}`);
    }

    const data = (await response.json()) as {
      tid: string;
      partner_order_id: string;
      payment_method_type: string;
      amount: { total: number };
      approved_at: string;
    };

    return {
      paymentKey: data.tid,
      orderId: data.partner_order_id,
      status: "DONE",
      method: data.payment_method_type,
      totalAmount: data.amount.total,
      approvedAt: data.approved_at,
      receiptUrl: null,
    };
  }

  async cancelPayment(
    request: CancelPaymentRequest
  ): Promise<CancelPaymentResult> {
    const response = await fetch(`${KAKAOPAY_API_BASE}/cancel`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        cid: this.cid,
        tid: request.paymentKey,
        cancel_amount: request.cancelAmount ?? 0,
        cancel_tax_free_amount: 0,
      }),
    });

    if (!response.ok) {
      const error = (await response.json()) as { msg: string; code: number };
      throw new Error(`KakaoPay cancel failed [${error.code}]: ${error.msg}`);
    }

    const data = (await response.json()) as {
      tid: string;
      partner_order_id: string;
      status: string;
      approved_cancel_amount: { total: number };
      canceled_at: string;
    };

    return {
      paymentKey: data.tid,
      orderId: data.partner_order_id,
      status: "CANCELED",
      cancelledAmount: data.approved_cancel_amount.total,
      cancelledAt: data.canceled_at,
    };
  }

  verifyWebhook(_body: string, _signature: string): PaymentWebhookEvent {
    // KakaoPay uses redirect-based flow, not webhooks for status updates
    throw new Error("KakaoPay does not support webhook verification");
  }
}
