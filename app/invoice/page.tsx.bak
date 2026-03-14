"use client";

import { useRouter } from 'next/navigation';

export default function InvoicePage() {
  const router = useRouter();

  const handleDownloadImage = async () => {
    const element = document.getElementById('invoice-capture');
    if (element) {
      // Lazy load html-to-image to avoid server-side issues
      const { toPng } = await import('html-to-image');
      
      // Temporarily hide the button for capture
      const buttonContainer = element.querySelector('.no-capture') as HTMLElement;
      if (buttonContainer) buttonContainer.style.visibility = 'hidden';

      try {
        const dataUrl = await toPng(element, { cacheBust: true });
        
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = "BoraMall_Invoice.png";
        link.click();
      } catch (error) {
        console.error("Failed to generate image", error);
        alert("이미지 저장 중 오류가 발생했습니다.");
      } finally {
        // Show button again
        if (buttonContainer) buttonContainer.style.visibility = 'visible';
      }
    }
  };

  // Mock Data for demonstration
  const invoiceData = {
    customerName: "홍길동",
    date: "2026. 02. 16",
    items: Array.from({ length: 40 }, (_, i) => ({
      name: `상품 ${i + 1} (Product ${i + 1})`,
      quantity: Math.floor(Math.random() * 5) + 1,
      price: (Math.floor(Math.random() * 20) + 1) * 1000
    })),
    bankName: "보라은행 (Bora Bank)",
    accountNumber: "123-456-7890",
    accountHolder: "보라몰 (Bora Mall)",
  };

  const totalPrice = invoiceData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <div className="min-h-screen py-8 px-4 flex flex-col justify-center sm:py-12">
      <div className="google-form-card w-full">
        <div className="google-form-header"></div>
        <div id="invoice-capture" className="p-6 sm:p-10 bg-white">
          
          <div className="border-b pb-6 mb-6">
            <h1 className="text-3xl font-bold mb-2">청구서 (Invoice)</h1>
            <p className="text-gray-600">주문이 완료되었습니다. 아래 계좌로 입금해주세요.</p>
          </div>

          <div className="space-y-6">
            {/* Customer Info */}
            <div className="grid grid-cols-2 gap-4 text-sm mb-6">
              <div className="flex flex-col sm:flex-row justify-between sm:gap-4">
                <span className="font-semibold text-gray-700 whitespace-nowrap">주문자:</span>
                <span className="text-right sm:text-left">{invoiceData.customerName}</span>
              </div>
              <div className="flex flex-col sm:flex-row justify-between sm:gap-4">
                <span className="font-semibold text-gray-700 whitespace-nowrap">날짜:</span>
                <span className="text-right sm:text-left">{invoiceData.date}</span>
              </div>
            </div>

            {/* Items List */}
            <div className="bg-gray-50 p-3 sm:p-4 rounded-md border border-gray-200 text-sm">
              <h3 className="font-bold text-base sm:text-lg mb-2 text-[#673ab7] border-b pb-2">주문 내역</h3>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1 sm:gap-x-8 sm:gap-y-2">
                {invoiceData.items.map((item, index) => (
                  <li key={index} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                    <div className="flex items-center overflow-hidden mr-1">
                      <span className="truncate text-xs sm:text-sm">{item.name}</span>
                      <span className="text-gray-500 text-[10px] ml-1 shrink-0">x{item.quantity}</span>
                    </div>
                    <span className="whitespace-nowrap font-medium text-xs sm:text-sm">{(item.price * item.quantity).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-4 border-t border-gray-300 flex justify-between items-center">
                <span className="text-base sm:text-lg font-bold">총 금액 (Total):</span>
                <span className="text-lg sm:text-xl font-bold text-[#673ab7]">{totalPrice.toLocaleString()}원</span>
              </div>
            </div>

            {/* Bank Info */}
            <div className="bg-[#f3e5f5] p-5 rounded-md border border-[#d1c4e9] text-center">
              <h3 className="font-bold text-xl mb-2 text-[#673ab7]">입금 계좌</h3>
              <p className="text-2xl font-bold mb-1">{invoiceData.bankName}</p>
              <p className="text-3xl font-black tracking-wider my-2">{invoiceData.accountNumber}</p>
              <p className="text-lg text-gray-600">예금주: {invoiceData.accountHolder}</p>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="mt-8 pt-6 no-capture">
             <button
                onClick={handleDownloadImage}
                className="w-full mb-3 flex justify-center items-center py-4 px-4 border border-transparent rounded-md shadow-sm text-xl font-bold text-white bg-[#673ab7] hover:bg-[#5e35b1]"
              >
                📥 갤러리에 저장하기 (Save Image)
              </button>
          </div>

        </div>
      </div>

       <footer className="mt-8 text-center text-sm text-gray-500">
        &copy; 2026 Bora Mall
      </footer>
    </div>
  );
}
