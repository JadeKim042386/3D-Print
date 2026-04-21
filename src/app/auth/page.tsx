"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { analytics, identifyUser } from "@/lib/analytics";

export default function AuthPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [dataProcessingConsent, setDataProcessingConsent] = useState(false);

  const canSubmitSignup = privacyConsent && dataProcessingConsent;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isLogin && !canSubmitSignup) {
      setError(t("auth.consentRequired"));
      return;
    }

    setIsLoading(true);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (data.user) identifyUser(data.user.id, { email });
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) {
          identifyUser(data.user.id, { email });
          analytics.signup();
        }
      }
      router.push("/");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isLogin
            ? t("auth.loginError")
            : t("auth.signupError")
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-57px)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-8">
          {isLogin ? t("auth.loginTitle") : t("auth.signupTitle")}
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.email")}
            required
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.password")}
            required
            minLength={6}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />

          {!isLogin && (
            <div className="flex flex-col gap-3 mt-1">
              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacyConsent}
                  onChange={(e) => setPrivacyConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <span>
                  <Link
                    href="/privacy"
                    target="_blank"
                    className="text-gray-900 font-medium underline"
                  >
                    {t("auth.privacyPolicy")}
                  </Link>
                  {t("auth.privacyAgree")}
                  <span className="text-red-500 ml-0.5">*</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dataProcessingConsent}
                  onChange={(e) => setDataProcessingConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <span>
                  {t("auth.dataProcessingAgree")}
                  <span className="text-red-500 ml-0.5">*</span>
                </span>
              </label>
            </div>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={isLoading || (!isLogin && !canSubmitSignup)}
            className="w-full bg-gray-900 text-white py-3 px-6 rounded-xl text-base font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLogin ? t("auth.login") : t("auth.signup")}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          {isLogin ? t("auth.noAccount") : t("auth.hasAccount")}{" "}
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-gray-900 font-medium hover:underline"
          >
            {isLogin ? t("auth.signup") : t("auth.login")}
          </button>
        </p>
      </div>
    </div>
  );
}
