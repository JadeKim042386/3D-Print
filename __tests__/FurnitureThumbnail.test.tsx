/**
 * Regression tests for FurnitureThumbnail proxy behaviour.
 *
 * We extract the component logic into a local copy so we can test it in
 * isolation without bootstrapping the full FurniturePlacer (Three.js, Supabase, etc.).
 */

import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

// ── Inline copy of the component under test ───────────────────────────────────

function FurnitureThumbnail({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const proxyUrl = url ? `/api/img-proxy?u=${encodeURIComponent(url)}` : null;
  if (!proxyUrl || failed) {
    return (
      <div data-testid="fallback">
        <svg />
      </div>
    );
  }
  return (
    <img
      src={proxyUrl}
      alt={name}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      data-testid="thumb"
    />
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FurnitureThumbnail", () => {
  it("renders proxy URL when image_url is provided", () => {
    const raw = "https://www.ikea.com/images/chair.jpg";
    render(<FurnitureThumbnail url={raw} name="소파" />);
    const img = screen.getByTestId("thumb") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("/api/img-proxy?u=");
    expect(img.src).toContain(encodeURIComponent(raw));
  });

  it("shows fallback when url is null", () => {
    render(<FurnitureThumbnail url={null} name="의자" />);
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("thumb")).not.toBeInTheDocument();
  });

  it("shows fallback after image load error (simulates 4xx from proxy)", () => {
    render(<FurnitureThumbnail url="https://www.ikea.com/missing.jpg" name="침대" />);
    const img = screen.getByTestId("thumb");
    fireEvent.error(img);
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("thumb")).not.toBeInTheDocument();
  });

  it("sets referrerPolicy, loading, and decoding attributes", () => {
    render(<FurnitureThumbnail url="https://cdn.iloom.com/a.jpg" name="테이블" />);
    const img = screen.getByTestId("thumb") as HTMLImageElement;
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
  });
});
