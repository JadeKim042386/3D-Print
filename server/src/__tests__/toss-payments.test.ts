import { describe, it, expect, vi, beforeEach } from "vitest";
import { TossPaymentsProvider } from "../providers/toss-payments.js";
import type {
  PaymentProvider,
  CreateOrderRequest,
  ConfirmPaymentResult,
  CancelPaymentResult,
} from "../types/payment.js";

function createProvider(): TossPaymentsProvider {
  return new TossPaymentsProvider({
    secretKey: "test_sk_0000000000000",
    clientKey: "test_ck_0000000000000",
    webhookSecret: "whsec_test123",
  });
}

const sampleOrderRequest: CreateOrderRequest = {
  modelId: "model-abc-12345678",
  amount: 15000,
  orderName: "3D 프린팅 - 파란 꽃병",
  customerName: "김민수",
  customerEmail: "minsu@example.com",
};

describe("TossPaymentsProvider", () => {
  let provider: TossPaymentsProvider;

  beforeEach(() => {
    provider = createProvider();
    vi.restoreAllMocks();
  });

  describe("createOrder", () => {
    it("should return orderId and checkoutData with clientKey", async () => {
      const result = await provider.createOrder(sampleOrderRequest);

      expect(result.orderId).toMatch(/^order_\d+_model-ab$/);
      expect(result.checkoutData.clientKey).toBe("test_ck_0000000000000");
      expect(result.checkoutData.amount).toBe("15000");
      expect(result.checkoutData.orderName).toBe("3D 프린팅 - 파란 꽃병");
      expect(result.checkoutData.customerName).toBe("김민수");
      expect(result.checkoutData.customerEmail).toBe("minsu@example.com");
    });

    it("should generate unique orderIds", async () => {
      const result1 = await provider.createOrder(sampleOrderRequest);
      // Ensure different timestamp
      await new Promise((r) => setTimeout(r, 5));
      const result2 = await provider.createOrder(sampleOrderRequest);

      expect(result1.orderId).not.toBe(result2.orderId);
    });
  });

  describe("confirmPayment", () => {
    it("should call Toss API and return payment result", async () => {
      const mockResponse: ConfirmPaymentResult = {
        paymentKey: "pk_test_123",
        orderId: "order_123",
        status: "DONE",
        method: "CARD",
        totalAmount: 15000,
        approvedAt: "2026-04-20T10:00:00+09:00",
        receiptUrl: "https://receipt.tosspayments.com/123",
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            ...mockResponse,
            receipt: { url: mockResponse.receiptUrl },
          }),
        })
      );

      const result = await provider.confirmPayment({
        orderId: "order_123",
        paymentKey: "pk_test_123",
        amount: 15000,
      });

      expect(result.paymentKey).toBe("pk_test_123");
      expect(result.status).toBe("DONE");
      expect(result.totalAmount).toBe(15000);
      expect(result.receiptUrl).toBe(
        "https://receipt.tosspayments.com/123"
      );

      expect(fetch).toHaveBeenCalledWith(
        "https://api.tosspayments.com/v1/payments/confirm",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
    });

    it("should throw on Toss API error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          json: async () => ({
            code: "INVALID_PAYMENT_KEY",
            message: "유효하지 않은 paymentKey입니다.",
          }),
        })
      );

      await expect(
        provider.confirmPayment({
          orderId: "order_123",
          paymentKey: "invalid",
          amount: 15000,
        })
      ).rejects.toThrow("Toss confirm failed [INVALID_PAYMENT_KEY]");
    });
  });

  describe("cancelPayment", () => {
    it("should cancel payment and return result", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            paymentKey: "pk_test_123",
            orderId: "order_123",
            status: "CANCELED",
            cancels: [
              { cancelAmount: 15000, canceledAt: "2026-04-20T12:00:00+09:00" },
            ],
          }),
        })
      );

      const result = await provider.cancelPayment({
        paymentKey: "pk_test_123",
        cancelReason: "고객 요청 취소",
      });

      expect(result.status).toBe("CANCELED");
      expect(result.cancelledAmount).toBe(15000);
    });

    it("should support partial cancellation", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            paymentKey: "pk_test_123",
            orderId: "order_123",
            status: "PARTIAL_CANCELED",
            cancels: [
              { cancelAmount: 5000, canceledAt: "2026-04-20T12:00:00+09:00" },
            ],
          }),
        })
      );

      const result = await provider.cancelPayment({
        paymentKey: "pk_test_123",
        cancelReason: "부분 취소",
        cancelAmount: 5000,
      });

      expect(result.status).toBe("PARTIAL_CANCELED");
      expect(result.cancelledAmount).toBe(5000);
    });

    it("should throw on cancel API error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          json: async () => ({
            code: "ALREADY_CANCELED_PAYMENT",
            message: "이미 취소된 결제입니다.",
          }),
        })
      );

      await expect(
        provider.cancelPayment({
          paymentKey: "pk_test_123",
          cancelReason: "duplicate cancel",
        })
      ).rejects.toThrow("Toss cancel failed [ALREADY_CANCELED_PAYMENT]");
    });
  });

  describe("verifyWebhook", () => {
    it("should parse valid webhook event", () => {
      const { createHmac } = require("node:crypto");
      const body = JSON.stringify({
        eventType: "PAYMENT_STATUS_CHANGED",
        data: {
          paymentKey: "pk_test_123",
          orderId: "order_123",
          status: "DONE",
        },
      });
      const signature = createHmac("sha256", "whsec_test123")
        .update(body)
        .digest("hex");

      const event = provider.verifyWebhook(body, signature);

      expect(event.eventType).toBe("PAYMENT_STATUS_CHANGED");
      expect(event.data.paymentKey).toBe("pk_test_123");
      expect(event.data.status).toBe("DONE");
    });

    it("should reject invalid signature", () => {
      const body = JSON.stringify({
        eventType: "PAYMENT_STATUS_CHANGED",
        data: {
          paymentKey: "pk_test_123",
          orderId: "order_123",
          status: "DONE",
        },
      });

      expect(() => provider.verifyWebhook(body, "invalid_sig")).toThrow(
        "Invalid webhook signature"
      );
    });
  });
});

describe("PaymentProvider interface contract", () => {
  it("TossPaymentsProvider implements PaymentProvider", () => {
    const provider: PaymentProvider = createProvider();
    expect(provider.name).toBe("toss");
    expect(typeof provider.createOrder).toBe("function");
    expect(typeof provider.confirmPayment).toBe("function");
    expect(typeof provider.cancelPayment).toBe("function");
    expect(typeof provider.verifyWebhook).toBe("function");
  });
});
