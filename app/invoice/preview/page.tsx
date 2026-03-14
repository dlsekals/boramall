"use client";

import InvoiceTemplate, { InvoiceData } from "../../components/InvoiceTemplate";

export default function InvoicePreviewPage() {
  // Generate 40 mock items
  const items = Array.from({ length: 40 }).map((_, i) => ({
    name: `테스트 상품 ${i + 1}`,
    quantity: Math.floor(Math.random() * 10) + 1,
    price: (Math.floor(Math.random() * 20) + 1) * 1000,
  }));

  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const mockData: InvoiceData = {
    customerName: "홍길동",
    address: "서울시 강남구 테헤란로 123 보라빌딩 101호",
    date: "2026. 02. 16.", // Fixed date to prevent hydration error
    items: items,
    totalPrice: totalPrice,
    bankName: "농축협",
    accountNumber: "352-0622-0889-03",
    accountHolder: "보라몰",
    isPaid: false, // Change to true to test "Paid" stamp
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12">
      <div className="max-w-4xl mx-auto">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold mb-2">40개 품목 예시 미리보기</h1>
            <p className="text-gray-600">인쇄 시 페이지가 어떻게 나뉘는지 확인해보세요 (Ctrl + P)</p>
          </div>
          <InvoiceTemplate data={mockData} />
      </div>
    </div>
  );
}
