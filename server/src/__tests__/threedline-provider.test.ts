import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThreeDLineProvider } from "../providers/threedline.js";

describe("ThreeDLineProvider", () => {
  let provider: ThreeDLineProvider;
  let mockSendEmail: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSendEmail = vi.fn().mockResolvedValue(undefined);
    provider = new ThreeDLineProvider({
      orderEmail: "order@3dline.co.kr",
      sendEmail: mockSendEmail,
    });
  });

  describe("getQuote", () => {
    it("should return an estimated quote and send email", async () => {
      const quote = await provider.getQuote({
        modelFileUrl: "https://storage.example.com/model.stl",
        material: "PLA",
        quantity: 2,
      });

      expect(quote.providerName).toBe("3dline");
      expect(quote.priceKrw).toBe(30000); // 15000 * 2
      expect(quote.estimatedDays).toBe(3);
      expect(quote.material).toBe("PLA");
      expect(quote.quoteMethod).toBe("email");
      expect(quote.providerQuoteId).toBeNull();
      expect(quote.notes).toContain("예상 견적");

      expect(mockSendEmail).toHaveBeenCalledWith(
        "order@3dline.co.kr",
        expect.stringContaining("견적 요청"),
        expect.stringContaining("PLA")
      );
    });

    it("should include shipping address in email when provided", async () => {
      await provider.getQuote({
        modelFileUrl: "https://storage.example.com/model.stl",
        material: "Resin",
        quantity: 1,
        shippingAddress: {
          city: "서울",
          province: "서울특별시",
          zipCode: "06234",
          country: "KR",
        },
      });

      expect(mockSendEmail).toHaveBeenCalledWith(
        "order@3dline.co.kr",
        expect.any(String),
        expect.stringContaining("서울")
      );
    });

    it("should calculate Metal pricing correctly", async () => {
      const quote = await provider.getQuote({
        modelFileUrl: "https://storage.example.com/model.stl",
        material: "Metal",
        quantity: 1,
      });

      expect(quote.priceKrw).toBe(150000);
      expect(quote.estimatedDays).toBe(10);
    });
  });

  describe("createOrder", () => {
    it("should send order email and return order reference", async () => {
      const result = await provider.createOrder({
        userId: "user-1",
        modelId: "model-1",
        modelFileUrl: "https://storage.example.com/model.stl",
        providerName: "3dline",
        material: "PLA",
        quantity: 1,
        priceKrw: 15000,
        shippingAddress: {
          name: "김철수",
          phone: "010-1234-5678",
          addressLine1: "서울시 강남구 테헤란로 123",
          city: "서울",
          province: "서울특별시",
          zipCode: "06234",
          country: "KR",
        },
        customerEmail: "user@example.com",
        customerName: "김철수",
      });

      expect(result.providerOrderId).toMatch(/^3DL-/);
      expect(result.status).toBe("order_placed");
      expect(result.estimatedDeliveryDate).not.toBeNull();

      expect(mockSendEmail).toHaveBeenCalledWith(
        "order@3dline.co.kr",
        expect.stringContaining("주문 요청"),
        expect.stringContaining("김철수")
      );
    });
  });

  describe("getOrderStatus", () => {
    it("should return default order_placed status", async () => {
      const result = await provider.getOrderStatus("3DL-12345");

      expect(result.providerOrderId).toBe("3DL-12345");
      expect(result.status).toBe("order_placed");
      expect(result.trackingNumber).toBeNull();
    });
  });

  describe("verifyWebhook", () => {
    it("should throw since webhooks are not supported", () => {
      expect(() => provider.verifyWebhook("{}", "sig")).toThrow(
        "does not support webhooks"
      );
    });
  });
});
