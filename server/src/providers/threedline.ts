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

/**
 * Base price estimates for 3DLINE (Seoul-based Korean 3D printing service).
 * Since 3DLINE lacks a public API, we use email-based order flow
 * with estimated pricing. Actual quotes come via email confirmation.
 */
const MATERIAL_BASE_PRICE_KRW: Record<string, number> = {
  PLA: 15000,
  ABS: 18000,
  PETG: 20000,
  Resin: 35000,
  Nylon: 40000,
  TPU: 25000,
  Metal: 150000,
};

const MATERIAL_EST_DAYS: Record<string, number> = {
  PLA: 3,
  ABS: 3,
  PETG: 4,
  Resin: 5,
  Nylon: 5,
  TPU: 4,
  Metal: 10,
};

interface ThreeDLineConfig {
  /** Email address to send order requests to */
  orderEmail: string;
  /** Optional API key for future API integration */
  apiKey?: string;
  /** Email sending function (injected for testability) */
  sendEmail: (to: string, subject: string, body: string) => Promise<void>;
}

export class ThreeDLineProvider implements PrintProvider {
  readonly name = "3dline" as const;
  readonly displayName = "3DLINE (3D라인)";
  private readonly config: ThreeDLineConfig;

  constructor(config: ThreeDLineConfig) {
    this.config = config;
  }

  async getQuote(request: PrintQuoteRequest): Promise<PrintQuote> {
    const basePrice = MATERIAL_BASE_PRICE_KRW[request.material] ?? 20000;
    const estimatedPrice = basePrice * request.quantity;
    const estimatedDays = MATERIAL_EST_DAYS[request.material] ?? 5;

    // Email-based: send quote request and return estimate
    const subject = `[DPR] 견적 요청 - ${request.material} x${request.quantity}`;
    const body = [
      "안녕하세요, DPR 3D 프린팅 견적을 요청드립니다.",
      "",
      `모델 파일: ${request.modelFileUrl}`,
      `소재: ${request.material}`,
      `수량: ${request.quantity}`,
      request.shippingAddress
        ? `배송지: ${request.shippingAddress.city}, ${request.shippingAddress.province} ${request.shippingAddress.zipCode}`
        : "",
      "",
      "견적 회신 부탁드립니다.",
      "감사합니다.",
    ]
      .filter(Boolean)
      .join("\n");

    await this.config.sendEmail(this.config.orderEmail, subject, body);

    return {
      providerName: "3dline",
      providerDisplayName: this.displayName,
      priceKrw: estimatedPrice,
      estimatedDays,
      material: request.material,
      quoteMethod: "email",
      providerQuoteId: null,
      notes: "예상 견적입니다. 실제 가격은 업체 회신 후 확정됩니다.",
    };
  }

  async createOrder(request: PrintOrderRequest): Promise<PrintOrderResult> {
    const addr = request.shippingAddress;
    const subject = `[DPR] 주문 요청 - ${request.material} x${request.quantity}`;
    const body = [
      "안녕하세요, DPR 3D 프린팅 주문을 요청드립니다.",
      "",
      `모델 파일: ${request.modelFileUrl}`,
      `소재: ${request.material}`,
      `수량: ${request.quantity}`,
      `예상 금액: ₩${request.priceKrw.toLocaleString()}`,
      "",
      "--- 배송 정보 ---",
      `수령인: ${addr.name}`,
      `연락처: ${addr.phone}`,
      `주소: ${addr.addressLine1}${addr.addressLine2 ? ` ${addr.addressLine2}` : ""}`,
      `${addr.city} ${addr.province} ${addr.zipCode}`,
      "",
      `주문자: ${request.customerName} (${request.customerEmail})`,
      "",
      "주문 확인 회신 부탁드립니다.",
      "감사합니다.",
    ].join("\n");

    await this.config.sendEmail(this.config.orderEmail, subject, body);

    // Generate a local order reference (provider confirms via email)
    const providerOrderId = `3DL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
      providerOrderId,
      status: "order_placed",
      estimatedDeliveryDate: this.estimateDeliveryDate(request.material),
    };
  }

  async getOrderStatus(
    providerOrderId: string
  ): Promise<PrintOrderStatusResult> {
    // Email-based flow: status is tracked in our DB, updated manually or via future webhook
    return {
      providerOrderId,
      status: "order_placed",
      trackingNumber: null,
      trackingUrl: null,
      updatedAt: new Date().toISOString(),
    };
  }

  verifyWebhook(_body: string, _signature: string): PrintWebhookEvent {
    throw new Error(
      "3DLINE does not support webhooks. Status updates are managed via email."
    );
  }

  private estimateDeliveryDate(material: string): string {
    const days = MATERIAL_EST_DAYS[material] ?? 5;
    const date = new Date();
    date.setDate(date.getDate() + days + 2); // +2 for shipping
    return date.toISOString().split("T")[0]!;
  }
}
