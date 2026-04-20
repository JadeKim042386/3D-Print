"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import CreditsWidget from "@/components/CreditsWidget";
import type { User } from "@supabase/supabase-js";

export default function Navbar() {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAccessToken(session?.access_token ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAccessToken(session?.access_token ?? null);
    });

    return () => subscription.unsubscribe();
  }, [setAccessToken]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const toggleLocale = () => {
    i18n.changeLanguage(i18n.language === "ko" ? "en" : "ko");
  };

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg sm:text-xl font-bold text-gray-900 truncate mr-2">
          {t("app.title")}
        </Link>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/gallery"
            className="text-sm text-gray-600 hover:text-gray-900 min-h-[44px] flex items-center px-2"
          >
            {t("nav.gallery")}
          </Link>

          <Link
            href="/pricing"
            className="text-sm text-gray-600 hover:text-gray-900 min-h-[44px] flex items-center px-2"
          >
            {t("nav.pricing")}
          </Link>

          <button
            onClick={toggleLocale}
            className="text-sm text-gray-600 hover:text-gray-900 px-2 sm:px-3 py-2 rounded border border-gray-300 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            {i18n.language === "ko" ? "EN" : "한국어"}
          </button>

          {user ? (
            <>
              {accessToken && <CreditsWidget accessToken={accessToken} />}

              <Link
                href="/dashboard"
                className="text-sm text-gray-600 hover:text-gray-900 min-h-[44px] flex items-center px-2"
              >
                {t("nav.dashboard")}
              </Link>
              <Link
                href="/admin"
                className="text-sm text-gray-600 hover:text-gray-900 min-h-[44px] flex items-center px-2"
              >
                {t("admin.dashboard")}
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-600 hover:text-gray-900 min-h-[44px] px-2"
              >
                {t("auth.logout")}
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 min-h-[44px] flex items-center"
            >
              {t("auth.login")}
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
