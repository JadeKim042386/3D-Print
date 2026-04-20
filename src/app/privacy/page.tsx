import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침 | Privacy Policy",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        개인정보처리방침
      </h1>
      <p className="text-sm text-gray-500 mb-8">시행일: 2026년 4월 20일</p>

      <div className="prose prose-gray max-w-none space-y-8">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            1. 개인정보의 수집 및 이용 목적
          </h2>
          <p className="text-gray-700 leading-relaxed">
            주식회사 DPR(이하 &quot;회사&quot;)는 다음의 목적을 위하여
            개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의 목적 이외의
            용도로는 이용되지 않으며, 이용 목적이 변경되는 경우에는
            개인정보보호법 제18조에 따라 별도의 동의를 받는 등 필요한 조치를
            이행할 예정입니다.
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1 text-gray-700">
            <li>회원 가입 및 관리: 이메일, 표시 이름</li>
            <li>
              3D 모델 생성 서비스 제공: 사용자 프롬프트, 생성된 3D 파일
            </li>
            <li>
              3D 프린팅 주문 처리: 이름, 이메일, 전화번호, 배송 주소
            </li>
            <li>결제 처리: 결제 수단 정보 (토스페이먼츠를 통해 처리)</li>
            <li>
              동의 관리: IP 주소, 브라우저 정보 (개인정보 보호법 준수 목적)
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            2. 수집하는 개인정보 항목
          </h2>
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 px-3 py-2 text-left">
                  구분
                </th>
                <th className="border border-gray-300 px-3 py-2 text-left">
                  수집 항목
                </th>
                <th className="border border-gray-300 px-3 py-2 text-left">
                  필수/선택
                </th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr>
                <td className="border border-gray-300 px-3 py-2">회원가입</td>
                <td className="border border-gray-300 px-3 py-2">
                  이메일, 비밀번호
                </td>
                <td className="border border-gray-300 px-3 py-2">필수</td>
              </tr>
              <tr>
                <td className="border border-gray-300 px-3 py-2">프로필</td>
                <td className="border border-gray-300 px-3 py-2">
                  표시 이름, 프로필 이미지
                </td>
                <td className="border border-gray-300 px-3 py-2">선택</td>
              </tr>
              <tr>
                <td className="border border-gray-300 px-3 py-2">
                  프린팅 주문
                </td>
                <td className="border border-gray-300 px-3 py-2">
                  이름, 이메일, 전화번호, 배송 주소
                </td>
                <td className="border border-gray-300 px-3 py-2">필수</td>
              </tr>
              <tr>
                <td className="border border-gray-300 px-3 py-2">
                  동의 기록
                </td>
                <td className="border border-gray-300 px-3 py-2">
                  IP 주소, 브라우저 정보, 동의 일시
                </td>
                <td className="border border-gray-300 px-3 py-2">자동 수집</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            3. 개인정보의 보유 및 이용 기간
          </h2>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li>
              <strong>회원 정보:</strong> 회원 탈퇴 시까지 (탈퇴 즉시 삭제)
            </li>
            <li>
              <strong>주문/결제 정보:</strong> 전자상거래법에 따라 5년 보관
            </li>
            <li>
              <strong>동의 기록:</strong> 개인정보보호법에 따라 3년 보관
            </li>
            <li>
              <strong>접속 로그:</strong> 통신비밀보호법에 따라 3개월 보관
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            4. 개인정보의 저장 위치
          </h2>
          <p className="text-gray-700 leading-relaxed">
            모든 개인정보는 <strong>AWS 서울 리전(ap-northeast-2)</strong>에
            위치한 Supabase(PostgreSQL) 데이터베이스에 저장됩니다. 3D 모델
            파일은 동일 리전의 Supabase Storage에 저장됩니다. 개인정보의 국외
            이전은 없습니다.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            5. 개인정보의 제3자 제공
          </h2>
          <p className="text-gray-700 leading-relaxed">
            회사는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다.
            다만, 다음의 경우에는 예외로 합니다:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1 text-gray-700">
            <li>
              3D 프린팅 주문 시: 선택한 프린팅 업체에 배송에 필요한 최소한의
              정보(이름, 주소, 전화번호)를 제공합니다. 별도 동의를 받습니다.
            </li>
            <li>
              결제 처리: 토스페이먼츠를 통해 결제 정보가 처리됩니다.
            </li>
            <li>법령에 의해 요구되는 경우</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            6. 정보주체의 권리와 행사 방법
          </h2>
          <p className="text-gray-700 leading-relaxed">
            이용자는 다음의 권리를 행사할 수 있습니다:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1 text-gray-700">
            <li>
              <strong>열람권:</strong> 본인의 개인정보 처리 현황을 열람할 수
              있습니다.
            </li>
            <li>
              <strong>정정권:</strong> 잘못된 개인정보의 정정을 요청할 수
              있습니다.
            </li>
            <li>
              <strong>삭제권(잊힐 권리):</strong> 계정 설정에서 &quot;계정
              삭제&quot;를 통해 모든 개인정보를 즉시 삭제할 수 있습니다.
            </li>
            <li>
              <strong>동의 철회권:</strong> 이전에 제공한 동의를 언제든지 철회할
              수 있습니다.
            </li>
          </ul>
          <p className="text-gray-700 mt-2">
            권리 행사는 앱 내 설정 또는 이메일(privacy@dpr3d.kr)을 통해 가능합니다.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            7. 개인정보의 안전성 확보 조치
          </h2>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li>데이터베이스 접근 통제(RLS 정책): 사용자는 본인의 데이터만 접근 가능</li>
            <li>통신 구간 암호화(TLS/HTTPS)</li>
            <li>비밀번호 암호화 저장 (Supabase Auth bcrypt)</li>
            <li>로그에서 개인식별정보(이메일, 이름) 제거</li>
            <li>서비스 키 분리 관리 및 환경 변수 사용</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            8. 개인정보 보호 책임자
          </h2>
          <p className="text-gray-700">
            개인정보 보호 책임자: privacy@dpr3d.kr
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            9. 개인정보 처리방침 변경
          </h2>
          <p className="text-gray-700 leading-relaxed">
            이 개인정보처리방침은 2026년 4월 20일부터 적용됩니다. 변경 사항이
            있을 경우 시행 최소 7일 전에 공지합니다.
          </p>
        </section>
      </div>

      <hr className="my-12 border-gray-200" />

      <h1 className="text-3xl font-bold text-gray-900 mb-8">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Effective: April 20, 2026</p>

      <div className="prose prose-gray max-w-none space-y-8">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            1. Data We Collect
          </h2>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li>Account: email, display name (optional)</li>
            <li>3D generation: text prompts, generated model files</li>
            <li>Print orders: name, email, phone, shipping address</li>
            <li>Payments: processed via Toss Payments (we do not store card details)</li>
            <li>Consent records: IP address, browser info, timestamps</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            2. Storage Location
          </h2>
          <p className="text-gray-700">
            All personal data is stored in <strong>AWS Seoul region (ap-northeast-2)</strong> via
            Supabase (PostgreSQL). No cross-border data transfer occurs.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            3. Retention
          </h2>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li>Account data: until account deletion (deleted immediately)</li>
            <li>Order/payment records: 5 years (Korean e-commerce law)</li>
            <li>Consent records: 3 years (PIPA)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            4. Your Rights
          </h2>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li>Access your data</li>
            <li>Correct inaccurate data</li>
            <li>Delete your account and all associated data</li>
            <li>Withdraw consent at any time</li>
          </ul>
          <p className="text-gray-700 mt-2">
            Contact: privacy@dpr3d.kr
          </p>
        </section>
      </div>
    </div>
  );
}
