"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { initAnalytics, trackEvent } from "@/lib/analytics";

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    trackEvent("page_view", { page: pathname });
  }, [pathname]);

  return <>{children}</>;
}
