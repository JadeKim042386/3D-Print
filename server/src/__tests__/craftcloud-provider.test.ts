import { describe, it, expect, vi, beforeEach } from "vitest";
import { CraftcloudProvider } from "../providers/craftcloud.js";
import { createHmac } from "node:crypto";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("CraftcloudProvider", () => {
  let provider: CraftcloudProvider;
  const apiKey = "test-craftcloud-key";

  beforeEach(() => {
    provider = new CraftcloudProvider({
      apiKey,
      baseUrl: "https://api.craftcloud3d.com/v1",
    });
    mockFetch.mockReset();
  });

  describe("getQuote", () => {
    it("should fetch quote from Craftcloud API and convert to KRW", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "quote-123",
          price: { amount: 25, currency: "USD" },
          estimatedDeliveryDays: 7,
          material: "pla",
        }),
      });

      const quote = await provider.getQuote({
        modelFileUrl: "https://storage.example.com/model.stl",
        material: "PLA",
        quantity: 1,
      });

      expect(quote.providerName).toBe("craftcloud");
      expect(quote.priceKrw).toBe(33750); // 25 * 1350
      expect(quote.estimatedDays).toBe(7);
      expect(quote.quoteMethod).toBe("api");
      expect(quote.providerQuoteId).toBe("quote-123");
      expect(quote.notes).toContain("USD");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.craftcloud3d.com/v1/quotes",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("should preserve KRW prices without conversion", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "quote-456",
          price: { amount: 30000, currency: "KRW" },
          estimatedDeliveryDays: 5,
          material: "pla",
        }),
      });

      const quote = await provider.getQuote({
        modelFileUrl: "https://storage.example.com/model.stl",
        material: "PLA",
        quantity: 1,
      });

      expect(quote.priceKrw).toBe(30000);
      expect(quote.notes).toBeNull();
    });

    it("should throw on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      await expect(
        provider.getQuote({
          modelFileUrl: "https://storage.example.com/model.stl",
          material: "PLA",
          quantity: 1,
        })
      ).rejects.toThrow("Craftcloud getQuote failed (500)");
    });
  });

  describe("createOrder", () => {
    it("should create an order via API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          orderId: "cc-order-789",
          status: "pending",
          estimatedDelivery: "2026-04-30",
        }),
      });

      const result = await provider.createOrder({
        userId: "user-1",
        modelId: "model-1",
        modelFileUrl: "https://storage.example.com/model.stl",
        providerName: "craftcloud",
        material: "PLA",
        quantity: 1,
        priceKrw: 33750,
        shippingAddress: {
          name: "Kim",
          phone: "010-1234-5678",
          addressLine1: "123 Test St",
          city: "Seoul",
          province: "Seoul",
          zipCode: "06234",
          country: "KR",
        },
        customerEmail: "user@example.com",
        customerName: "Kim",
      });

      expect(result.providerOrderId).toBe("cc-order-789");
      expect(result.status).toBe("order_placed");
      expect(result.estimatedDeliveryDate).toBe("2026-04-30");
    });

    it("should throw on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
      });

      await expect(
        provider.createOrder({
          userId: "user-1",
          modelId: "model-1",
          modelFileUrl: "https://storage.example.com/model.stl",
          providerName: "craftcloud",
          material: "PLA",
          quantity: 1,
          priceKrw: 33750,
          shippingAddress: {
            name: "Kim",
            phone: "010-1234-5678",
            addressLine1: "123 Test St",
            city: "Seoul",
            province: "Seoul",
            zipCode: "06234",
            country: "KR",
          },
          customerEmail: "user@example.com",
          customerName: "Kim",
        })
      ).rejects.toThrow("Craftcloud createOrder failed (400)");
    });
  });

  describe("getOrderStatus", () => {
    it("should fetch and map order status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          orderId: "cc-order-789",
          status: "shipped",
          tracking: {
            number: "1Z999AA10123456784",
            url: "https://tracking.example.com/1Z999AA10123456784",
          },
          updatedAt: "2026-04-20T10:00:00Z",
        }),
      });

      const result = await provider.getOrderStatus("cc-order-789");

      expect(result.status).toBe("shipped");
      expect(result.trackingNumber).toBe("1Z999AA10123456784");
      expect(result.trackingUrl).toBe(
        "https://tracking.example.com/1Z999AA10123456784"
      );
    });
  });

  describe("verifyWebhook", () => {
    it("should verify HMAC signature and parse event", () => {
      const payload = JSON.stringify({
        orderId: "cc-order-789",
        status: "shipped",
        tracking: { number: "TRACK123", url: "https://track.example.com" },
      });
      const signature = createHmac("sha256", apiKey)
        .update(payload)
        .digest("hex");

      const event = provider.verifyWebhook(payload, signature);

      expect(event.providerName).toBe("craftcloud");
      expect(event.providerOrderId).toBe("cc-order-789");
      expect(event.status).toBe("shipped");
      expect(event.trackingNumber).toBe("TRACK123");
    });

    it("should throw on invalid signature", () => {
      const payload = JSON.stringify({ orderId: "cc-order-789", status: "shipped" });

      expect(() => provider.verifyWebhook(payload, "invalid")).toThrow(
        "Invalid Craftcloud webhook signature"
      );
    });
  });
});
