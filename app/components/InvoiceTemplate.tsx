"use client";



export interface InvoiceData {
  customerName: string;
  address?: string;
  date: string;
  items: {
    name: string;
    quantity: number;
    price: number;
  }[];
  totalPrice: number;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isPaid?: boolean;
}

interface InvoiceTemplateProps {
  data: InvoiceData;
  elementId?: string;
  hideButtons?: boolean;
}

export default function InvoiceTemplate({ data, elementId = "invoice-capture", hideButtons = false }: InvoiceTemplateProps) {
  
  const handleDownloadImage = async () => {
    const element = document.getElementById(elementId);
    if (element) {
      const { toPng } = await import('html-to-image');
      
      const buttonContainer = element.querySelector('.no-capture') as HTMLElement;
      if (buttonContainer) buttonContainer.style.visibility = 'hidden';

      try {
        const dataUrl = await toPng(element, { cacheBust: true, pixelRatio: 2 });
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `Invoice_${data.customerName}.png`;
        link.click();
      } catch (error) {
        console.error("Failed to generate image", error);
        alert("이미지 저장 중 오류가 발생했습니다.");
      } finally {
        if (buttonContainer) buttonContainer.style.visibility = 'visible';
      }
    }
  };

  // Theme Colors
  const themeColor = "bg-[#4527a0]"; // Luxurious Deep Purple
  const textColor = "text-[#311b92]";

  return (
    <div id={elementId} className="bg-white max-w-2xl mx-auto shadow-lg relative min-h-[800px] flex flex-col">
      
      {/* Paid Stamp */}
      {data.isPaid && (
          <div className="absolute top-40 right-10 border-4 border-red-500 text-red-500 font-black text-5xl p-4 transform -rotate-12 opacity-70 pointer-events-none select-none z-10 rounded-lg">
              입금 완료
          </div>
      )}

      {/* Header */}
      <div className="p-4 sm:px-12 sm:py-8 flex justify-between items-start">
        <div>
            <h1 className={`text-2xl sm:text-4xl font-extrabold ${textColor} tracking-tight`}>보라몰</h1>
            <p className="text-gray-500 text-xs sm:text-sm mt-1">프리미엄 라이브 커머스</p>
        </div>
        <div className="text-right">
            <h2 className={`text-2xl sm:text-4xl font-black ${textColor} opacity-50 uppercase tracking-widest`}>주문내역</h2>
        </div>
      </div>

      {/* Info Section */}
      <div className="px-4 sm:px-12 pb-4 sm:pb-8 flex flex-col sm:flex-row justify-between gap-4 sm:gap-8">
          <div className="flex">
              <div className={`${themeColor} text-white p-2 px-6 rounded-l-md`}>
                  <span className="font-bold text-sm uppercase tracking-wider">날짜</span>
              </div>
              <div className="bg-gray-100 p-2 px-6 flex-1 text-right font-medium text-gray-700 rounded-r-md">
                  {data.date}
              </div>
          </div>
      </div>

      {/* Addresses */}
      <div className="grid grid-cols-2 gap-12 p-6 sm:px-12 sm:py-8">
          <div>
              <h3 className={`font-bold text-lg mb-4 uppercase tracking-wider border-b-2 border-gray-100 pb-2 ${textColor}`}>판매자</h3>
              <p className="font-bold text-gray-800">보라몰 (Bora Mall)</p>
              <p className="text-gray-500 text-sm mt-1">서울시 강남구 테헤란로 123</p>
              <p className="text-gray-500 text-sm">boramall@example.com</p>
              <p className="text-gray-500 text-sm">010-1234-5678</p>
          </div>
          <div>
              <h3 className={`font-bold text-lg mb-4 uppercase tracking-wider border-b-2 border-gray-100 pb-2 ${textColor}`}>구매자</h3>
              <p className="font-bold text-gray-800">{data.customerName} 님</p>
              {data.address ? (
                  <p className="text-gray-600 text-sm mt-1 break-keep">{data.address}</p>
              ) : (
                  <p className="text-gray-400 text-sm mt-1">(주소 정보 없음)</p>
              )}
          </div>
      </div>

      {/* Table */}
      {/* Item Table */}
      <div className="px-4 sm:px-12 pb-4 sm:pb-8">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className={`${themeColor} text-white`}>
                <th className="py-2 sm:py-3 px-2 sm:px-4 rounded-tl-lg font-bold text-xs sm:text-base w-[50%]">물품</th>
                <th className="py-2 sm:py-3 px-2 sm:px-4 text-right font-bold text-xs sm:text-base whitespace-nowrap w-[10%] pr-1 sm:pr-4">수량</th>
                <th className="py-2 sm:py-3 px-2 sm:px-4 text-right font-bold text-xs sm:text-base whitespace-nowrap w-[20%] pr-1 sm:pr-4">단가</th>
                <th className="py-2 sm:py-3 px-2 sm:px-4 rounded-tr-lg text-right font-bold text-xs sm:text-base whitespace-nowrap w-[20%] pr-1 sm:pr-4">합계</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, index) => (
                <tr key={index} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
                  <td className="py-2 px-2 sm:px-4 font-medium text-gray-700 text-xs sm:text-base break-words">
                    {item.name}
                  </td>
                  <td className="py-2 px-2 sm:px-4 text-right text-gray-500 whitespace-nowrap text-xs sm:text-base font-mono pr-1 sm:pr-4">
                    {item.quantity}
                  </td>
                  <td className="py-2 px-2 sm:px-4 text-right text-gray-500 whitespace-nowrap text-xs sm:text-base font-mono pr-1 sm:pr-4">
                    {item.price.toLocaleString()}
                  </td>
                  <td className="py-2 px-2 sm:px-4 text-right font-bold text-gray-800 whitespace-nowrap text-xs sm:text-base font-mono pr-1 sm:pr-4">
                    {(item.price * item.quantity).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>

          </table>
          <div className="flex justify-end items-center mt-4 sm:mt-6 border-t border-gray-100 pt-4 sm:pt-6">
              <span className="font-bold text-gray-500 mr-4 text-sm sm:text-lg whitespace-nowrap">총금액</span>
              <span className="font-black text-xl sm:text-3xl text-gray-900 font-mono whitespace-nowrap">
                  {data.totalPrice.toLocaleString()}<span className="text-sm sm:text-lg font-bold ml-1 text-gray-500">원</span>
              </span>
          </div>

      </div>

      {/* Footer / Payment Methods */}
      <div className="px-4 sm:px-12 pb-8 sm:pb-12 mt-4 bg-gray-50/50 pt-4 sm:pt-6 border-t border-gray-100">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="text-left w-full sm:w-auto">
                  <p className="font-bold text-gray-800 text-lg mb-1">무통장 입금 계좌 안내</p>
                  <p className="text-xs text-gray-500">* 1일 이내 미입금 시 주문이 자동 취소됩니다.</p>
              </div>
              <div className="w-full sm:w-auto bg-white rounded-lg border border-gray-200 px-6 py-4 shadow-sm min-w-[320px]">
                  <div className="flex items-center gap-3 mb-2 border-b border-gray-100 pb-2">
                      {/* NH Logo */}
                      <img src="/nh_logo.png" alt="NH농협" className="h-6 object-contain" />
                      <span className="font-bold text-gray-800 text-lg">농축협</span>
                  </div>
                  
                  <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-bold text-gray-500">예금주</span>
                      <span className="font-bold text-gray-800">{data.accountHolder}</span>
                  </div>
                  
                  <div className="mt-1 text-center">
                      <p className="font-black text-2xl text-[#4527a0] tracking-tight">{data.accountNumber}</p>
                  </div>
              </div>
          </div>
          <p className="text-center text-xs text-gray-300 mt-8 mb-4 font-light">
              이용해 주셔서 감사합니다. | 보라몰
          </p>
      </div>

      {/* Action Buttons (Not Captured) */}
      {!hideButtons && (
         <div className="p-8 pt-0 no-capture print:hidden">
             <button
                onClick={handleDownloadImage}
                className={`w-full py-4 rounded-lg shadow-lg text-white font-bold text-lg transition-transform hover:scale-[1.02] ${themeColor}`}
              >
                💾 이미지로 저장 (Save to Gallery)
              </button>
              <div className="mt-4 text-center text-sm text-gray-400">
                * 인쇄 시 배경 그래픽 옵션을 켜주세요.
              </div>
          </div>
      )}
      
      <style jsx global>{`
        @media print {
          @page {
            margin: 0;
            size: auto;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
           /* Force background colors */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}
