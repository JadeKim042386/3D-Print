import Link from "next/link";

export default function HomefixPage() {
  return (
    <div className="min-h-[calc(100vh-57px)] flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mx-auto max-w-2xl">
        <p className="mb-3 inline-block rounded-full bg-gray-100 px-4 py-1.5 text-xs font-medium text-gray-600">
          인테리어 플래너
        </p>
        <h1 className="mb-4 text-3xl sm:text-5xl font-bold text-gray-900 leading-tight">
          내 공간을<br />3D로 디자인하세요
        </h1>
        <p className="mb-8 text-lg text-gray-500 leading-relaxed">
          방 치수를 설정하고, 원하는 가구를 배치하면<br />
          AI가 실사 3D 렌더링을 생성합니다.
        </p>
        <Link
          href="/homefix/setup"
          className="inline-flex items-center rounded-xl bg-gray-900 px-8 py-4 text-base font-semibold text-white hover:bg-gray-800 transition-colors min-h-[48px]"
        >
          새 공간 설정하기 →
        </Link>

        <div className="mt-12 grid grid-cols-3 gap-6">
          {[
            { n: "1", title: "공간 설정", desc: "방 형태·치수를 직접 설정하세요" },
            { n: "2", title: "가구 배치", desc: "실제 치수 가구를 원하는 위치에" },
            { n: "3", title: "3D 렌더링", desc: "AI가 실사 렌더링을 생성합니다" },
          ].map((s) => (
            <div key={s.n} className="flex flex-col items-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white">
                {s.n}
              </div>
              <p className="font-semibold text-gray-900 text-sm mb-1">{s.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
