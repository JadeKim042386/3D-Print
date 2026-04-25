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
          방 치수를 입력하고, 원하는 가구를 배치하면
          AI가 실사 3D 렌더링을 생성합니다.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
          <Link
            href="/homefix/planner"
            className="inline-flex items-center rounded-xl bg-gray-900 px-8 py-4 text-base font-semibold text-white hover:bg-gray-800 transition-colors min-h-[48px] w-full sm:w-auto justify-center"
          >
            플래너 시작하기 →
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-6 text-center">
          {[
            { step: "1", title: "공간 설정", desc: "방 모양과 치수를 직접 그리세요" },
            { step: "2", title: "가구 배치", desc: "실제 치수의 가구를 배치하세요" },
            { step: "3", title: "3D 렌더링", desc: "AI가 실사 렌더링을 생성합니다" },
          ].map((item) => (
            <div key={item.step} className="flex flex-col items-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white">
                {item.step}
              </div>
              <p className="font-semibold text-gray-900 text-sm mb-1">{item.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
