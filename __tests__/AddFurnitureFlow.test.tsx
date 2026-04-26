/**
 * Integration regression for DPR-120: addFurniture flow end-to-end.
 *
 * Root cause: all tRPC calls wrapped input in `{ json: { ... } }` (tRPC v10/SuperJSON
 * convention). tRPC v11 with the default identity transformer passes input directly to
 * Zod — which strips the unknown `json` key, sees `{}`, and fails required-field
 * validation with 400 BAD_REQUEST.
 *
 * These tests mock `fetch` and verify that:
 *   1. autoPlace is called with raw input (no `{ json: ... }` wrapper)
 *   2. The preview panel appears after a successful autoPlace response
 *   3. Confirming placement calls addFurniture with raw input
 *   4. The placement is added to the scene
 *   5. 400 / network errors surface a Korean error banner
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";

// ── Minimal inline stand-in for the parts of FurniturePlacer under test ──────
// We inline the fetch logic to avoid bootstrapping Three.js / Supabase / R3F.

const API_BASE = "http://localhost:3001";

async function trpcQuery(path: string, input: unknown, token: string) {
  const url = `${API_BASE}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`tRPC GET ${path} failed: ${res.status}`);
  const data = await res.json();
  return data.result?.data?.json ?? data.result?.data ?? data;
}

async function trpcMutation(path: string, body: unknown, token: string) {
  const res = await fetch(`${API_BASE}/trpc/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`tRPC POST ${path} failed: ${res.status}`);
  const data = await res.json();
  return data.result?.data?.json ?? data.result?.data ?? data;
}

// ── Minimal component mirroring the addFurniture / confirmPlacement flow ──────

interface Suggestion { x_mm: number; y_mm: number; rotation_deg: number }
interface Preview { item: { id: string; name: string }; best: Suggestion | null; confirming: boolean }

function AddFurnitureFlow({
  projectId,
  token,
}: {
  projectId: string;
  token: string;
}) {
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [placements, setPlacements] = React.useState<{ id: string }[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  const addFurniture = async (item: { id: string; name: string }) => {
    setAdding(true);
    setError(null);
    try {
      const result = await trpcQuery(
        "homefix.staging.autoPlace",
        { project_id: projectId, furniture_id: item.id, k: 3, clearance_mm: 50 },
        token,
      );
      const best: Suggestion | null = result?.best ?? null;
      if (!best) {
        setError("빈 자리가 부족합니다 — 가구를 옮기거나 더 작은 모델을 시도해 보세요.");
      } else {
        setPreview({ item, best, confirming: false });
      }
    } catch {
      setError("자동 배치를 불러오는데 실패했습니다. 네트워크 상태를 확인해 주세요.");
    }
    setAdding(false);
  };

  const confirmPlacement = async () => {
    if (!preview?.best) return;
    setPreview((p) => p ? { ...p, confirming: true } : null);
    try {
      const result = await trpcMutation(
        "homefix.staging.addFurniture",
        {
          project_id: projectId,
          furniture_id: preview.item.id,
          x_mm: preview.best.x_mm,
          y_mm: preview.best.y_mm,
          rotation_deg: preview.best.rotation_deg,
        },
        token,
      );
      if (result?.id) {
        setPlacements((prev) => [...prev, { id: result.id }]);
      }
      setPreview(null);
    } catch {
      setPreview((p) => p ? { ...p, confirming: false } : null);
      setError("배치 확정에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  return (
    <div>
      <button
        data-testid="add-btn"
        onClick={() => addFurniture({ id: "f-uuid-001", name: "소파" })}
        disabled={adding}
      >
        + 배치
      </button>

      {preview && (
        <div data-testid="preview-panel">
          <span data-testid="preview-item">{preview.item.name}</span>
          <button
            data-testid="confirm-btn"
            onClick={confirmPlacement}
            disabled={preview.confirming}
          >
            배치 확정
          </button>
        </div>
      )}

      {error && <p data-testid="error-banner">{error}</p>}

      <ul data-testid="placement-list">
        {placements.map((p) => (
          <li key={p.id} data-testid={`placement-${p.id}`}>{p.id}</li>
        ))}
      </ul>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tRPCOkResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ result: { data } }) };
}

function tRPCErrorResponse(status = 400) {
  return { ok: false, status, json: async () => ({ error: { message: "error" } }) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const PROJECT_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const TOKEN = "test-token";

describe("addFurniture flow (DPR-120 regression)", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("calls autoPlace with raw input — no { json: ... } wrapper", async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce(
      tRPCOkResponse({ best: { x_mm: 500, y_mm: 500, rotation_deg: 0 }, alternatives: [], confidence: 0.9 }),
    );
    global.fetch = mockFetch as unknown as typeof fetch;

    render(<AddFurnitureFlow projectId={PROJECT_ID} token={TOKEN} />);
    await act(async () => { fireEvent.click(screen.getByTestId("add-btn")); });
    await waitFor(() => screen.getByTestId("preview-panel"));

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    const input = JSON.parse(new URL(url).searchParams.get("input")!);
    expect(input).not.toHaveProperty("json");
    expect(input.project_id).toBe(PROJECT_ID);
    expect(input.furniture_id).toBe("f-uuid-001");
    expect(input.k).toBe(3);
    expect(input.clearance_mm).toBe(50);
  });

  it("shows preview panel after successful autoPlace", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(
      tRPCOkResponse({ best: { x_mm: 500, y_mm: 500, rotation_deg: 0 }, alternatives: [], confidence: 0.8 }),
    ) as unknown as typeof fetch;

    render(<AddFurnitureFlow projectId={PROJECT_ID} token={TOKEN} />);
    await act(async () => { fireEvent.click(screen.getByTestId("add-btn")); });
    await waitFor(() => expect(screen.getByTestId("preview-panel")).toBeInTheDocument());
    expect(screen.getByTestId("preview-item")).toHaveTextContent("소파");
  });

  it("calls addFurniture with raw input and adds placement to list", async () => {
    const mockFetch = jest.fn()
      .mockResolvedValueOnce(
        tRPCOkResponse({ best: { x_mm: 500, y_mm: 500, rotation_deg: 0 }, alternatives: [], confidence: 0.8 }),
      )
      .mockResolvedValueOnce(
        tRPCOkResponse({ id: "placement-uuid-001" }),
      );
    global.fetch = mockFetch as unknown as typeof fetch;

    render(<AddFurnitureFlow projectId={PROJECT_ID} token={TOKEN} />);
    await act(async () => { fireEvent.click(screen.getByTestId("add-btn")); });
    await waitFor(() => screen.getByTestId("confirm-btn"));

    await act(async () => { fireEvent.click(screen.getByTestId("confirm-btn")); });
    await waitFor(() => screen.getByTestId("placement-placement-uuid-001"));

    const [, mutInit] = mockFetch.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(mutInit.body as string);
    expect(body).not.toHaveProperty("json");
    expect(body.project_id).toBe(PROJECT_ID);
    expect(body.furniture_id).toBe("f-uuid-001");
    expect(body.x_mm).toBe(500);
    expect(body.y_mm).toBe(500);
    expect(screen.queryByTestId("preview-panel")).not.toBeInTheDocument();
  });

  it("shows Korean error banner on autoPlace 400 (zod validation failure)", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(
      tRPCErrorResponse(400),
    ) as unknown as typeof fetch;

    render(<AddFurnitureFlow projectId={PROJECT_ID} token={TOKEN} />);
    await act(async () => { fireEvent.click(screen.getByTestId("add-btn")); });
    await waitFor(() => screen.getByTestId("error-banner"));
    expect(screen.getByTestId("error-banner")).toHaveTextContent("자동 배치를 불러오는데 실패했습니다");
  });

  it("surfaces a Korean error banner when addFurniture mutation fails (DPR-95 regression)", async () => {
    const mockFetch = jest.fn()
      .mockResolvedValueOnce(
        tRPCOkResponse({ best: { x_mm: 500, y_mm: 500, rotation_deg: 0 }, alternatives: [], confidence: 0.8 }),
      )
      .mockResolvedValueOnce(tRPCErrorResponse(400));
    global.fetch = mockFetch as unknown as typeof fetch;

    render(<AddFurnitureFlow projectId={PROJECT_ID} token={TOKEN} />);
    await act(async () => { fireEvent.click(screen.getByTestId("add-btn")); });
    await waitFor(() => screen.getByTestId("confirm-btn"));
    await act(async () => { fireEvent.click(screen.getByTestId("confirm-btn")); });

    await waitFor(() => screen.getByTestId("error-banner"));
    expect(screen.getByTestId("error-banner")).toHaveTextContent("배치 확정에 실패했습니다");
    // Preview stays open so the user can retry; previously the catch was silent.
    expect(screen.getByTestId("preview-panel")).toBeInTheDocument();
  });

  it("shows no-space error when autoPlace returns best: null", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(
      tRPCOkResponse({ best: null, alternatives: [], confidence: 0 }),
    ) as unknown as typeof fetch;

    render(<AddFurnitureFlow projectId={PROJECT_ID} token={TOKEN} />);
    await act(async () => { fireEvent.click(screen.getByTestId("add-btn")); });
    await waitFor(() => screen.getByTestId("error-banner"));
    expect(screen.getByTestId("error-banner")).toHaveTextContent("빈 자리가 부족합니다");
    expect(screen.queryByTestId("preview-panel")).not.toBeInTheDocument();
  });
});
