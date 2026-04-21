/**
 * mailer.ts
 *
 * Transactional email service for DPR 3D platform.
 * Korean-first HTML templates with plain-text fallbacks.
 * Returns null when SMTP is not configured (dev/prototype mode).
 */

import { createTransport, type Transporter } from "nodemailer";
import type { Config } from "../config.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Mailer {
  sendGenerationComplete(opts: GenerationCompleteOpts): Promise<void>;
  sendOrderConfirmed(opts: OrderConfirmedOpts): Promise<void>;
  sendPrintOrderShipped(opts: PrintOrderShippedOpts): Promise<void>;
  sendCreditLow(opts: CreditLowOpts): Promise<void>;
  sendSubscriptionRenewal(opts: SubscriptionRenewalOpts): Promise<void>;
}

export interface GenerationCompleteOpts {
  to: string;
  modelId: string;
  prompt?: string;
  displayName?: string;
}

export interface OrderConfirmedOpts {
  to: string;
  orderId: string;
  totalKrw?: number;
  displayName?: string;
}

export interface PrintOrderShippedOpts {
  to: string;
  orderId: string;
  trackingNumber?: string;
  trackingUrl?: string;
  displayName?: string;
}

export interface CreditLowOpts {
  to: string;
  remaining: number;
  limit: number;
  displayName?: string;
}

export interface SubscriptionRenewalOpts {
  to: string;
  planId: string;
  renewalDate: string; // ISO date string
  displayName?: string;
}

// ── HTML template wrapper ─────────────────────────────────────────────────────

function htmlLayout(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#0f0f23;padding:28px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">DPR</span>
                    <span style="color:#6366f1;font-size:22px;font-weight:700;"> 3D</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fb;padding:24px 40px;border-top:1px solid #eef0f4;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                이 이메일은 DPR 3D 플랫폼에서 자동으로 발송된 메일입니다.<br/>
                This email was sent automatically by DPR 3D Platform.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f0f23;line-height:1.3;">${text}</h1>`;
}

function subheading(text: string): string {
  return `<p style="margin:0 0 24px;font-size:14px;color:#6b7280;">${text}</p>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">${text}</p>`;
}

function button(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="background:#6366f1;border-radius:8px;">
        <a href="${href}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function infoBox(rows: { label: string; value: string }[]): string {
  const rowsHtml = rows
    .map(
      (r) => `<tr>
        <td style="padding:10px 16px;font-size:13px;color:#6b7280;white-space:nowrap;width:140px;">${r.label}</td>
        <td style="padding:10px 16px;font-size:13px;color:#111827;font-weight:500;">${r.value}</td>
      </tr>`
    )
    .join('<tr><td colspan="2" style="height:1px;background:#f0f0f0;padding:0;"></td></tr>');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;border-radius:8px;margin:24px 0;overflow:hidden;">
    ${rowsHtml}
  </table>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #eef0f4;margin:28px 0;" />`;
}

// ── Individual templates ───────────────────────────────────────────────────────

function generationCompleteHtml(opts: GenerationCompleteOpts): string {
  const name = opts.displayName ?? "고객";
  const body = `
    ${heading("3D 모델 생성이 완료되었습니다")}
    ${subheading("3D Model Generation Complete")}
    <hr style="border:none;border-top:1px solid #eef0f4;margin:0 0 24px;" />
    ${paragraph(`안녕하세요, <strong>${name}</strong>님!`)}
    ${paragraph("요청하신 3D 모델 생성이 완료되었습니다. 아래 버튼을 클릭하여 모델을 확인하고 다운로드하거나 출력을 주문해 보세요.")}
    ${infoBox([
      { label: "모델 ID", value: opts.modelId.slice(0, 8) + "…" },
      ...(opts.prompt ? [{ label: "프롬프트", value: opts.prompt.length > 60 ? opts.prompt.slice(0, 60) + "…" : opts.prompt }] : []),
      { label: "상태", value: "✅ 준비 완료" },
    ])}
    ${button(`${process.env["APP_URL"] ?? "https://dpr3d.kr"}/models/${opts.modelId}`, "모델 보기 / View Model")}
    ${divider()}
    ${paragraph(`<span style="color:#9ca3af;font-size:13px;">Hello ${name}, your 3D model is ready. Click the button above to view, download, or order a print.</span>`)}
  `;
  return htmlLayout("3D 모델 생성 완료 — DPR 3D", body);
}

function generationCompletePlain(opts: GenerationCompleteOpts): string {
  const name = opts.displayName ?? "고객";
  return [
    `[DPR 3D] 3D 모델 생성이 완료되었습니다`,
    ``,
    `안녕하세요, ${name}님!`,
    `요청하신 3D 모델 생성이 완료되었습니다.`,
    `모델 ID: ${opts.modelId}`,
    opts.prompt ? `프롬프트: ${opts.prompt}` : "",
    ``,
    `모델 보기: ${process.env["APP_URL"] ?? "https://dpr3d.kr"}/models/${opts.modelId}`,
    ``,
    `---`,
    `Hello ${name}, your 3D model is ready.`,
    `View model: ${process.env["APP_URL"] ?? "https://dpr3d.kr"}/models/${opts.modelId}`,
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

function orderConfirmedHtml(opts: OrderConfirmedOpts): string {
  const name = opts.displayName ?? "고객";
  const priceStr = opts.totalKrw
    ? `₩${opts.totalKrw.toLocaleString("ko-KR")}`
    : "—";
  const body = `
    ${heading("주문이 확인되었습니다")}
    ${subheading("Order Confirmed")}
    <hr style="border:none;border-top:1px solid #eef0f4;margin:0 0 24px;" />
    ${paragraph(`안녕하세요, <strong>${name}</strong>님!`)}
    ${paragraph("주문이 정상적으로 접수되어 처리 중입니다. 주문 내역은 아래에서 확인하실 수 있습니다.")}
    ${infoBox([
      { label: "주문 번호", value: opts.orderId.slice(0, 8) + "…" },
      { label: "결제 금액", value: priceStr },
      { label: "상태", value: "✅ 주문 확인" },
    ])}
    ${button(`${process.env["APP_URL"] ?? "https://dpr3d.kr"}/orders/${opts.orderId}`, "주문 내역 보기 / View Order")}
    ${divider()}
    ${paragraph(`<span style="color:#9ca3af;font-size:13px;">Hello ${name}, your order has been confirmed and is being processed.</span>`)}
  `;
  return htmlLayout("주문 확인 — DPR 3D", body);
}

function orderConfirmedPlain(opts: OrderConfirmedOpts): string {
  const name = opts.displayName ?? "고객";
  const priceStr = opts.totalKrw
    ? `₩${opts.totalKrw.toLocaleString("ko-KR")}`
    : "—";
  return [
    `[DPR 3D] 주문이 확인되었습니다`,
    ``,
    `안녕하세요, ${name}님!`,
    `주문 번호: ${opts.orderId}`,
    `결제 금액: ${priceStr}`,
    ``,
    `주문 내역: ${process.env["APP_URL"] ?? "https://dpr3d.kr"}/orders/${opts.orderId}`,
    ``,
    `---`,
    `Hello ${name}, your order has been confirmed.`,
    `Order ID: ${opts.orderId}`,
  ].join("\n");
}

function printOrderShippedHtml(opts: PrintOrderShippedOpts): string {
  const name = opts.displayName ?? "고객";
  const infoRows: { label: string; value: string }[] = [
    { label: "주문 번호", value: opts.orderId.slice(0, 8) + "…" },
    { label: "상태", value: "🚚 배송 중" },
  ];
  if (opts.trackingNumber) {
    infoRows.push({ label: "운송장 번호", value: opts.trackingNumber });
  }

  const trackingSection = opts.trackingUrl
    ? button(opts.trackingUrl, "배송 조회 / Track Shipment")
    : "";

  const body = `
    ${heading("3D 출력물이 배송 출발했습니다")}
    ${subheading("Your 3D Print Order Has Shipped")}
    <hr style="border:none;border-top:1px solid #eef0f4;margin:0 0 24px;" />
    ${paragraph(`안녕하세요, <strong>${name}</strong>님!`)}
    ${paragraph("주문하신 3D 출력물이 배송 출발하였습니다. 아래에서 배송 현황을 확인하세요.")}
    ${infoBox(infoRows)}
    ${trackingSection}
    ${divider()}
    ${paragraph(`<span style="color:#9ca3af;font-size:13px;">Hello ${name}, your 3D print order has shipped${opts.trackingNumber ? ` (tracking: ${opts.trackingNumber})` : ""}.</span>`)}
  `;
  return htmlLayout("배송 출발 알림 — DPR 3D", body);
}

function printOrderShippedPlain(opts: PrintOrderShippedOpts): string {
  const name = opts.displayName ?? "고객";
  return [
    `[DPR 3D] 3D 출력물이 배송 출발했습니다`,
    ``,
    `안녕하세요, ${name}님!`,
    `주문 번호: ${opts.orderId}`,
    opts.trackingNumber ? `운송장 번호: ${opts.trackingNumber}` : "",
    opts.trackingUrl ? `배송 조회: ${opts.trackingUrl}` : "",
    ``,
    `---`,
    `Hello ${name}, your 3D print order has shipped.`,
    opts.trackingNumber ? `Tracking number: ${opts.trackingNumber}` : "",
    opts.trackingUrl ? `Track: ${opts.trackingUrl}` : "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

function creditLowHtml(opts: CreditLowOpts): string {
  const name = opts.displayName ?? "고객";
  const pct = opts.limit > 0 ? Math.round((opts.remaining / opts.limit) * 100) : 0;
  const body = `
    ${heading("크레딧이 부족합니다")}
    ${subheading("Credit Balance Low")}
    <hr style="border:none;border-top:1px solid #eef0f4;margin:0 0 24px;" />
    ${paragraph(`안녕하세요, <strong>${name}</strong>님!`)}
    ${paragraph("3D 생성 크레딧이 얼마 남지 않았습니다. 플랜을 업그레이드하시면 더 많은 모델을 생성할 수 있습니다.")}
    ${infoBox([
      { label: "남은 크레딧", value: `${opts.remaining} / ${opts.limit}` },
      { label: "사용률", value: `${100 - pct}% 소진` },
      { label: "경고 기준", value: "20% 미만" },
    ])}
    ${button(`${process.env["APP_URL"] ?? "https://dpr3d.kr"}/billing`, "플랜 업그레이드 / Upgrade Plan")}
    ${divider()}
    ${paragraph(`<span style="color:#9ca3af;font-size:13px;">Hello ${name}, your credit balance is low (${opts.remaining} remaining). Consider upgrading your plan.</span>`)}
  `;
  return htmlLayout("크레딧 부족 알림 — DPR 3D", body);
}

function creditLowPlain(opts: CreditLowOpts): string {
  const name = opts.displayName ?? "고객";
  return [
    `[DPR 3D] 크레딧이 부족합니다`,
    ``,
    `안녕하세요, ${name}님!`,
    `남은 크레딧: ${opts.remaining} / ${opts.limit}`,
    ``,
    `플랜 업그레이드: ${process.env["APP_URL"] ?? "https://dpr3d.kr"}/billing`,
    ``,
    `---`,
    `Hello ${name}, your credit balance is low (${opts.remaining} / ${opts.limit} remaining).`,
    `Upgrade: ${process.env["APP_URL"] ?? "https://dpr3d.kr"}/billing`,
  ].join("\n");
}

function subscriptionRenewalHtml(opts: SubscriptionRenewalOpts): string {
  const name = opts.displayName ?? "고객";
  const planLabel =
    opts.planId === "pro"
      ? "Pro"
      : opts.planId === "business"
        ? "Business"
        : opts.planId;
  const renewalDateStr = new Date(opts.renewalDate).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const body = `
    ${heading("구독 갱신 예정 안내")}
    ${subheading("Subscription Renewal Reminder")}
    <hr style="border:none;border-top:1px solid #eef0f4;margin:0 0 24px;" />
    ${paragraph(`안녕하세요, <strong>${name}</strong>님!`)}
    ${paragraph("현재 구독하신 플랜이 3일 후 자동 갱신됩니다. 구독 관리 페이지에서 확인하거나 변경하실 수 있습니다.")}
    ${infoBox([
      { label: "구독 플랜", value: `${planLabel} Plan` },
      { label: "갱신 예정일", value: renewalDateStr },
    ])}
    ${button(`${process.env["APP_URL"] ?? "https://dpr3d.kr"}/billing`, "구독 관리 / Manage Subscription")}
    ${divider()}
    ${paragraph(`<span style="color:#9ca3af;font-size:13px;">Hello ${name}, your ${planLabel} plan subscription renews on ${new Date(opts.renewalDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.</span>`)}
  `;
  return htmlLayout("구독 갱신 예정 알림 — DPR 3D", body);
}

function subscriptionRenewalPlain(opts: SubscriptionRenewalOpts): string {
  const name = opts.displayName ?? "고객";
  return [
    `[DPR 3D] 구독 갱신 예정 안내`,
    ``,
    `안녕하세요, ${name}님!`,
    `플랜: ${opts.planId}`,
    `갱신 예정일: ${new Date(opts.renewalDate).toLocaleDateString("ko-KR")}`,
    ``,
    `구독 관리: ${process.env["APP_URL"] ?? "https://dpr3d.kr"}/billing`,
    ``,
    `---`,
    `Hello ${name}, your ${opts.planId} subscription renews on ${new Date(opts.renewalDate).toLocaleDateString("en-US")}.`,
  ].join("\n");
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a Mailer instance from server config.
 * Returns null when SMTP is not configured — all callers must handle this gracefully.
 */
export function createMailer(
  config: Pick<Config, "SMTP_HOST" | "SMTP_PORT" | "SMTP_USER" | "SMTP_PASS" | "SMTP_FROM">
): Mailer | null {
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS) {
    console.warn("[mailer] SMTP not configured — transactional emails disabled");
    return null;
  }

  const transporter: Transporter = createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT ?? 587,
    secure: (config.SMTP_PORT ?? 587) === 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });

  const from = config.SMTP_FROM ?? config.SMTP_USER;

  async function send(
    to: string,
    subject: string,
    html: string,
    text: string
  ): Promise<void> {
    try {
      await transporter.sendMail({ from, to, subject, html, text });
    } catch (err) {
      // Log but never throw — email failures must not break the main flow
      console.error(`[mailer] Failed to send "${subject}" to ${to}:`, (err as Error).message);
    }
  }

  return {
    async sendGenerationComplete(opts) {
      await send(
        opts.to,
        "[DPR 3D] 3D 모델 생성이 완료되었습니다 / Your model is ready",
        generationCompleteHtml(opts),
        generationCompletePlain(opts)
      );
    },

    async sendOrderConfirmed(opts) {
      await send(
        opts.to,
        "[DPR 3D] 주문이 확인되었습니다 / Order Confirmed",
        orderConfirmedHtml(opts),
        orderConfirmedPlain(opts)
      );
    },

    async sendPrintOrderShipped(opts) {
      await send(
        opts.to,
        "[DPR 3D] 출력물이 배송 출발했습니다 / Your Print Order Has Shipped",
        printOrderShippedHtml(opts),
        printOrderShippedPlain(opts)
      );
    },

    async sendCreditLow(opts) {
      await send(
        opts.to,
        "[DPR 3D] 크레딧이 부족합니다 / Credit Balance Low",
        creditLowHtml(opts),
        creditLowPlain(opts)
      );
    },

    async sendSubscriptionRenewal(opts) {
      await send(
        opts.to,
        "[DPR 3D] 구독 갱신 예정 안내 / Subscription Renewal Reminder",
        subscriptionRenewalHtml(opts),
        subscriptionRenewalPlain(opts)
      );
    },
  };
}
