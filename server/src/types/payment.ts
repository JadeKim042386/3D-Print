/** Supported payment providers */
export type PaymentProviderName = "toss" | "kakaopay";

/** Payment method types available in Korea */
export type PaymentMethod =
  | "CARD"
  | "VIRTUAL_ACCOUNT"
  | "TRANSFER"
  | "MOBILE"
  | "EASY_PAY";

/** Order status aligned with payment lifecycle */
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "printing"
  | "shipped"
  | "delivered"
  | "cancelled";

/** Payment status from provider */
export type PaymentStatus =
  | "READY"
  | "IN_PROGRESS"
  | "DONE"
  | "CANCELED"
  | "PARTIAL_CANCELED"
  | "ABORTED"
  | "EXPIRED";

/** Request to create a payment order */
export interface CreateOrderRequest {
  modelId: string;
  amount: number;
  orderName: string;
  customerName: string;
  customerEmail: string;
}

/** Result from creating a payment order */
export interface CreateOrderResult {
  orderId: string;
  /** Provider-specific checkout URL or client key for redirect */
  checkoutData: Record<string, string>;
}

/** Request to confirm a payment after user completes checkout */
export interface ConfirmPaymentRequest {
  orderId: string;
  paymentKey: string;
  amount: number;
}

/** Result of a confirmed payment */
export interface ConfirmPaymentResult {
  paymentKey: string;
  orderId: string;
  status: PaymentStatus;
  method: PaymentMethod | string;
  totalAmount: number;
  approvedAt: string;
  receiptUrl: string | null;
}

/** Request to cancel a payment */
export interface CancelPaymentRequest {
  paymentKey: string;
  cancelReason: string;
  cancelAmount?: number;
}

/** Result of a cancelled payment */
export interface CancelPaymentResult {
  paymentKey: string;
  orderId: string;
  status: PaymentStatus;
  cancelledAmount: number;
  cancelledAt: string;
}

/** Webhook event payload from payment provider */
export interface PaymentWebhookEvent {
  eventType: string;
  data: {
    paymentKey: string;
    orderId: string;
    status: PaymentStatus;
    [key: string]: unknown;
  };
}

/**
 * Abstract interface for payment providers.
 * Implement this to add new providers (Toss Payments, KakaoPay, etc.)
 */
export interface PaymentProvider {
  readonly name: PaymentProviderName;

  /** Create a payment order and return checkout data */
  createOrder(request: CreateOrderRequest): Promise<CreateOrderResult>;

  /** Confirm a payment after user completes checkout flow */
  confirmPayment(request: ConfirmPaymentRequest): Promise<ConfirmPaymentResult>;

  /** Cancel a confirmed payment (full or partial) */
  cancelPayment(request: CancelPaymentRequest): Promise<CancelPaymentResult>;

  /** Verify webhook signature and parse event */
  verifyWebhook(body: string, signature: string): PaymentWebhookEvent;
}
