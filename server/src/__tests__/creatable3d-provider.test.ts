import { describe, it, expect, vi, beforeEach } from "vitest";
import { Creatable3DProvider } from "../providers/creatable3d.js";

describe("Creatable3DProvider", () => {
  let provider: Creatable3DProvider;

  beforeEach(() => {
    provider = new Creatable3DProvider({
      apiKey: "test-api-key",
      baseUrl: "https://api.creatable3d.com/v1",
    });
    vi.restoreAllMocks();
  });

  describe("getQuote", () => {
    it("returns API quote on success", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quote_id: "q-123",
          price_krw: 25000,
          estimated_days: 3,
          material: "pla",
          available: true,
        }),
      } as Response);

      const quote = await provider.getQuote({
        modelFileUrl: "https://storage.example.com/model.stl",
        material: "PLA",
        quantity: 1,
      });

      expect(quote.providerName).toBe("creatable3d");
      expect(quote.providerDisplayName).toBe("크리에이터블3D");
      expect(quote.priceKrw).toBe(25000);
      expect(quote.estimatedDays).toBe(3);
      expect(quote.quoteMethod).toBe("api");
      expect(quote.providerQuoteId).toBe("q-123");
    });

    it("falls back to estimate on API failure", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response);

      const quote = await provider.getQuote({
        modelFileUrl: "https://storage.example.com/model.stl",
        material: "PLA",
        quantity: 2,
      });

      expect(quote.providerName).toBe("creatable3d");
      expect(quote.priceKrw).toBe(24000); // 12000 * 2
      expect(quote.quoteMethod).toBe("api");
      expect(quote.notes).toContain("예상 견적");
    });
  });

  describe("createOrder", () => {
    it("places order via API", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          order_id: "ord-456",
          status: "confirmed",
          estimated_delivery: "2026-04-25",
        }),
      } as Response);

      const result = await provider.createOrder({
        userId: "user-1",
        modelId: "model-1",
        modelFileUrl: "https://storage.example.com/model.stl",
        providerName: "creatable3d",
        material: "PLA",
        quantity: 1,
        priceKrw: 25000,
        shippingAddress: {
          name: "김지수",
          phone: "010-1234-5678",
          addressLine1: "서울시 강남구",
          city: "서울",
          province: "서울특별시",
          zipCode: "06000",
          country: "KR",
        },
        customerEmail: "test@example.com",
        customerName: "김지수",
      });

      expect(result.providerOrderId).toBe("ord-456");
      expect(result.status).toBe("order_placed");
      expect(result.estimatedDeliveryDate).toBe("2026-04-25");
    });

    it("throws on API failure", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
      } as Response);

      await expect(
        provider.createOrder({
          userId: "user-1",
          modelId: "model-1",
          modelFileUrl: "https://storage.example.com/model.stl",
          providerName: "creatable3d",
          material: "PLA",
          quantity: 1,
          priceKrw: 25000,
          shippingAddress: {
            name: "김지수",
            phone: "010-1234-5678",
            addressLine1: "서울시 강남구",
            city: "서울",
            province: "서울특별시",
            zipCode: "06000",
            country: "KR",
          },
          customerEmail: "test@example.com",
          customerName: "김지수",
        })
      ).rejects.toThrow("Creatable3D order failed: 400");
    });
  });

  describe("getOrderStatus", () => {
    it("maps API status correctly", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          order_id: "ord-456",
          status: "printing",
          tracking_number: null,
          tracking_url: null,
          updated_at: "2026-04-20T10:00:00Z",
        }),
      } as Response);

      const status = await provider.getOrderStatus("ord-456");
      expect(status.status).toBe("printing");
      expect(status.providerOrderId).toBe("ord-456");
    });
  });

  describe("verifyWebhook", () => {
    it("rejects invalid signature", () => {
      expect(() =>
        provider.verifyWebhook('{"order_id":"x","status":"shipped"}', "invalid")
      ).toThrow("Invalid Creatable3D webhook signature");
    });

    it("parses valid webhook", () => {
      const crypto = require("crypto");
      const body = JSON.stringify({
        order_id: "ord-789",
        status: "shipped",
        tracking_number: "CJ1234567890",
        tracking_url: "https://tracking.cj.net/CJ1234567890",
      });
      const signature = crypto
        .createHmac("sha256", "test-api-key")
        .update(body)
        .digest("hex");

      const event = provider.verifyWebhook(body, signature);
      expect(event.providerName).toBe("creatable3d");
      expect(event.providerOrderId).toBe("ord-789");
      expect(event.status).toBe("shipped");
      expect(event.trackingNumber).toBe("CJ1234567890");
    });
  });
});
