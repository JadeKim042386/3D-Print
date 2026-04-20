"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

interface ShareButtonProps {
  modelId: string;
  modelPrompt: string;
}

export default function ShareButton({ modelId, modelPrompt }: ShareButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/models/${modelId}/public`
      : "";

  const shareTitle = `3D 모델: ${modelPrompt}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleKakaoShare = () => {
    const kakaoUrl = `https://sharer.kakao.com/talk/friends/picker/link?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`;
    window.open(kakaoUrl, "_blank", "width=600,height=600");
  };

  const handleTwitterShare = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`;
    window.open(twitterUrl, "_blank", "width=600,height=400");
  };

  const handleCopyEmbed = async () => {
    const embedCode = `<iframe src="${shareUrl}?embed=true" width="100%" height="500" frameborder="0" allowfullscreen></iframe>`;
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent fail
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="inline-flex items-center gap-2 bg-white text-gray-900 py-3 px-6 rounded-xl font-medium border border-gray-300 hover:bg-gray-50 transition-colors min-h-[44px]"
      >
        <svg
          width="18"
          height="18"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
          />
        </svg>
        {t("share.title")}
      </button>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-20">
            <button
              onClick={handleCopyLink}
              className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 flex items-center gap-3 min-h-[44px]"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.75-2.813a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L5.25 9.879" />
              </svg>
              {copied ? t("share.copied") : t("share.copyLink")}
            </button>

            <button
              onClick={handleKakaoShare}
              className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 flex items-center gap-3 min-h-[44px]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3C6.477 3 2 6.463 2 10.691c0 2.722 1.8 5.108 4.509 6.454l-.916 3.408c-.082.305.254.548.524.379l4.03-2.52c.612.084 1.237.129 1.853.129 5.523 0 10-3.463 10-7.691C22 6.463 17.523 3 12 3" />
              </svg>
              {t("share.kakaoTalk")}
            </button>

            <button
              onClick={handleTwitterShare}
              className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 flex items-center gap-3 min-h-[44px]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              {t("share.twitter")}
            </button>

            <div className="border-t border-gray-100 my-1" />

            <button
              onClick={handleCopyEmbed}
              className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 flex items-center gap-3 min-h-[44px]"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
              </svg>
              {t("share.embed")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
