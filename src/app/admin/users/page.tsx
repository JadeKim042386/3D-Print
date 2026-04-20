"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store";
import { listAdminUsers } from "@/lib/admin-api";

const PAGE_SIZE = 20;

function formatDate(dateString: string, lang: string): string {
  const date = new Date(dateString);
  if (lang === "ko") {
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminUsersPage() {
  const { t, i18n } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", page],
    queryFn: () =>
      listAdminUsers(accessToken!, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    enabled: !!accessToken,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        {t("admin.users")}
      </h2>

      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
        </div>
      )}

      {!isLoading && data && data.users.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-500">{t("admin.noUsers")}</p>
      )}

      {!isLoading && data && data.users.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {t("admin.userEmail")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {t("admin.userName")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {t("admin.userRole")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {t("admin.orderCount")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {t("admin.joinedDate")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {data.users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {user.email}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {user.display_name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.role === "admin"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {user.totalOrders}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {formatDate(user.created_at, i18n.language)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {t("admin.prev")}
          </button>
          <span className="text-sm text-gray-600">
            {t("admin.page")} {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {t("admin.next")}
          </button>
        </div>
      )}
    </div>
  );
}
