"use client";

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import InvoiceTemplate, { InvoiceData } from '../../components/InvoiceTemplate';

export default function DynamicInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const { orders, getUser, isLoaded } = useApp();
  const [isSaving, setIsSaving] = useState(false);

  const handleDownloadImage = async () => {
    const element = document.getElementById('invoice-capture');
    if (!element) return;
    setIsSaving(true);
    const originalScrollY = window.scrollY;
    window.scrollTo(0, 0);
    try {
      const { toPng } = await import('html-to-image');
      // First pass to warm up cache (prevents blank/stale render)
      await toPng(element, { cacheBust: true });
      await new Promise(r => setTimeout(r, 100));
      // Second pass with explicit dimensions to prevent clipping
      const dataUrl = await toPng(element, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        style: { transform: 'scale(1)', transformOrigin: 'top left', width: '672px', maxWidth: '672px' },
        width: 672,
        height: element.scrollHeight,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `보라몰_청구서.png`;
      link.click();
    } catch (error) {
      console.error('Failed to generate image', error);
      alert('이미지 저장 중 오류가 발생했습니다.');
    } finally {
      window.scrollTo(0, originalScrollY);
      setIsSaving(false);
    }
  };

  // 1. Wait until DB context is fully loaded
  if (!isLoaded) {
      return <div className="p-10 mt-20 text-center font-extrabold text-[#4527a0] text-xl">데이터베이스에서 청구서를 불러오는 중입니다...</div>;
  }

  if (!params.id) return null;

  // 2. Compute Invoice directly from loaded state
  const order = orders.find(o => o.id === params.id);
  const user = order ? getUser(order.userId) : null;

  // 3. Fallback only if the order truly doesn't exist
  if (!order || !user) {
      return (
          <div className="p-10 text-center mt-20">
              <h1 className="text-xl font-bold mb-4 text-[#ff5252]">청구서를 찾을 수 없습니다.</h1>
              <button 
                onClick={() => router.push('/')}
                className="text-white bg-[#4527a0] px-6 py-2 rounded shadow-md mt-4 font-bold"
              >
                  홈으로 돌아가기
              </button>
          </div>
      );
  }

  // 4. Map to InvoiceData
  const invoiceData: InvoiceData = {
      customerName: user.name, // Real name
      customerPhone: user.phone,
      customerNickname: user.nickname,
      address: user.address,
      date: order.createdAt,
      items: order.items.map(i => ({
          name: i.productName,
          quantity: i.quantity,
          price: i.price
      })),
      totalPrice: order.totalPrice,
      bankName: "새마을금고",
      accountNumber: "010-6269-9612",
      accountHolder: "보라몰",
      isPaid: order.isPaid
  };

  return (
    <div className="min-h-screen py-8 px-4 flex flex-col justify-center sm:py-12 bg-gray-50">
       <InvoiceTemplate data={invoiceData} />
       
       {/* Save Button - outside capture area */}
       <div className="mt-4 text-center">
         <button
           onClick={handleDownloadImage}
           disabled={isSaving}
           className="text-sm text-gray-500 bg-white border border-gray-300 px-4 py-2 rounded shadow-sm hover:bg-gray-100 disabled:opacity-50 font-medium transition-colors"
         >
           {isSaving ? '저장 중...' : '📥 이미지로 저장'}
         </button>
       </div>

       <footer className="mt-6 text-center text-sm text-gray-400 font-bold">
        &copy; 2026 Bora Mall
      </footer>
    </div>
  );
}
