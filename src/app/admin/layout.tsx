"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { checkAdminRole } from "@/lib/admin-api";
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const accessToken = useAuthStore((s) => s.accessToken);

  const { data: isAdmin, isLoading } = useQuery({
    queryKey: ["admin-check", accessToken],
    queryFn: () => checkAdminRole(accessToken!),
    enabled: !!accessToken,
    staleTime: 60_000,
  });

  if (!accessToken || (!isLoading && !isAdmin)) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-bold text-gray-900">
          {t("admin.accessDenied")}
        </h1>
        <p className="mb-6 text-gray-600">{t("admin.accessDeniedDesc")}</p>
        <Link
          href="/auth"
          className="inline-flex items-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800"
        >
          {t("auth.login")}
        </Link>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
      </main>
    );
  }

  const navItems = [
    { href: "/admin", label: t("admin.metrics") },
    { href: "/admin/orders", label: t("admin.orders") },
    { href: "/admin/users", label: t("admin.users") },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex items-center gap-4 border-b border-gray-200 pb-4">
        <h1 className="text-xl font-bold text-gray-900">{t("admin.title")}</h1>
        <nav className="flex gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname === item.href
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
