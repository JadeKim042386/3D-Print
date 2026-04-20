import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrintOn3DProvider } from "../providers/printon3d.js";

describe("PrintOn3DProvider", () => {
  let provider: PrintOn3DProvider;

  beforeEach(() => {
    provider = new PrintOn3DProvider({
      apiKey: "test-printon-key",
      baseUrl: "https://api.printon3d.co.kr/v2",
    });
    vi.restoreAllMocks();
  });

  describe("getQuote", () => {
    it("returns API quote on success", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "qt-001",
          total_price: 18000,
          lead_time_days: 2,
          expires_at: "2026-04-22T00:00:00Z",
        }),
      } as Response);

      const quote = await provider.getQuote({
        modelFileUrl: "https://storage.example.com/model.stl",
        material: "PLA",
        quantity: 1,
      });

      expect(quote.providerName).toBe("printon3d");
      expect(quote.providerDisplayName).toBe("프린트온3D");
      expect(quote.priceKrw).toBe(18000);
      expect(quote.estimatedDays).toBe(2);
      expect(quote.quoteMethod).toBe("api");
      expect(quote.providerQuoteId).toBe("qt-001");
    });

    it("falls back to estimate on API failure", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      const quote = await provider.getQuote({
        modelFileUrl: "https://storage.example.com/model.stl",
        material: "ABS",
        quantity: 3,
      });

      expect(quote.providerName).toBe("printon3d");
      expect(quote.priceKrw).toBe(51000); // 17000 * 3
      expect(quote.estimatedDays).toBe(2);
    });
  });

  describe("createOrder", () => {
    it("places order via API", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          order_id: "PO-999",
          status: "received",
          expected_delivery: "2026-04-23",
        }),
      } as Response);

      const result = await provider.createOrder({
        userId: "user-1",
        modelId: "model-1",
        modelFileUrl: "https://storage.example.com/model.stl",
        providerName: "printon3d",
        material: "PLA",
        quantity: 1,
        priceKrw: 18000,
        shippingAddress: {
          name: "박민수",
          phone: "010-9876-5432",
          addressLine1: "인천시 남동구",
          city: "인천",
          province: "인천광역시",
          zipCode: "21500",
          country: "KR",
        },
        customerEmail: "park@example.com",
        customerName: "박민수",
      });

      expect(result.providerOrderId).toBe("PO-999");
      expect(result.status).toBe("order_placed");
      expect(result.estimatedDeliveryDate).toBe("2026-04-23");
    });
  });

  describe("getOrderStatus", () => {
    it("maps status and builds tracking URL", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          order_id: "PO-999",
          state: "shipped",
          courier: "cjlogistics",
          tracking_no: "1234567890",
          updated: "2026-04-22T14:00:00Z",
        }),
      } as Response);

      const status = await provider.getOrderStatus("PO-999");
      expect(status.status).toBe("shipped");
      expect(status.trackingNumber).toBe("1234567890");
      expect(status.trackingUrl).toBe(
        "https://tracker.delivery/cjlogistics/1234567890"
      );
    });

    it("returns fallback on API failure", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      const status = await provider.getOrderStatus("PO-999");
      expect(status.status).toBe("order_placed");
      expect(status.trackingNumber).toBeNull();
    });
  });

  describe("verifyWebhook", () => {
    it("rejects invalid signature", () => {
      expect(() =>
        provider.verifyWebhook('{"order_id":"x","state":"shipped"}', "sha256=bad")
      ).toThrow("Invalid PrintOn3D webhook signature");
    });

    it("parses valid webhook with tracking", () => {
      const crypto = require("crypto");
      const body = JSON.stringify({
        order_id: "PO-123",
        state: "shipped",
        courier: "hanjin",
        tracking_no: "9876543210",
      });
      const signature =
        "sha256=" +
        crypto
          .createHmac("sha256", "test-printon-key")
          .update(body)
          .digest("hex");

      const event = provider.verifyWebhook(body, signature);
      expect(event.providerName).toBe("printon3d");
      expect(event.providerOrderId).toBe("PO-123");
      expect(event.status).toBe("shipped");
      expect(event.trackingNumber).toBe("9876543210");
      expect(event.trackingUrl).toBe(
        "https://tracker.delivery/hanjin/9876543210"
      );
    });
  });
});
