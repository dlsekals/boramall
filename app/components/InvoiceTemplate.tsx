"use client";

import { boramallLogo, saemaeulLogo } from './logos';
import { useEffect, useState } from 'react';
import html2canvas from 'html2canvas';

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
  const [cleanLogo, setCleanLogo] = useState(boramallLogo);
  const [cleanSaemaeul, setCleanSaemaeul] = useState(saemaeulLogo);

  useEffect(() => {
    const processImage = (base64Url: string, setFn: (url: string) => void) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
              const r = d[i], g = d[i+1], b = d[i+2];
              if (r > 200 && g > 200 && b > 200) {
                d[i+3] = 0; // Make light grays/whites strictly transparent
              }
            }
            ctx.putImageData(imgData, 0, 0);
            setFn(canvas.toDataURL("image/png"));
        }
      };
      img.src = base64Url;
    };
    if (boramallLogo) processImage(boramallLogo, setCleanLogo);
    if (saemaeulLogo) processImage(saemaeulLogo, setCleanSaemaeul);
  }, []);

  const handleDownloadImage = async () => {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const buttonContainer = element.querySelector('.no-capture') as HTMLElement;
    if (buttonContainer) buttonContainer.style.display = 'none';

    try {
      // Add a small delay so display:none renders before capturing
      await new Promise(res => setTimeout(res, 100));
      
      const canvas = await html2canvas(element, { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: '#ffffff' 
      });
      const dataUrl = canvas.toDataURL('image/png');
      
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `Invoice_${data.customerName}.png`;
      link.click();
    } catch (error) {
      console.error("Failed to generate image", error);
      alert("이미지 저장 중 오류가 발생했습니다: " + String(error));
    } finally {
      if (buttonContainer) buttonContainer.style.display = '';
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
      <div className="px-8 pt-6 pb-2 flex justify-between items-start border-b-2 border-transparent">
        <div className="flex-1 flex items-center pt-2">
            {/* Logo: base64 properly background-stripped natively */}
            <img src={cleanLogo} alt="보라몰" className="h-28 lg:h-32 object-contain transform scale-110 origin-left" />
        </div>
        <div className="flex-1 flex flex-col items-end justify-start gap-2 pt-2">
            <div className="flex items-center gap-2 mb-2 pr-2">
                <div className={`${themeColor} text-white px-3 py-1 rounded text-[10px] font-bold tracking-widest whitespace-nowrap`}>날짜</div>
                <div className="font-bold text-gray-700 text-sm tracking-widest bg-gray-50 px-4 py-1 rounded whitespace-nowrap">{data.date}</div>
            </div>
            <h2 className={`text-3xl font-black ${textColor} opacity-40 uppercase tracking-widest`}>주문내역</h2>
        </div>
      </div>

      {/* Addresses */}
      <div className="grid grid-cols-2 gap-12 px-12 pb-4 pt-1">
          <div>
              <h3 className={`font-bold text-[13px] mb-1.5 tracking-wider ${textColor}`}>판매자</h3>
              <div className={`h-0.5 w-full bg-[#311b92] opacity-20 mb-2`}></div>
              <p className="font-black text-gray-800 text-[13px] mb-1">보라몰</p>
              <p className="text-gray-400 text-[10px] font-medium tracking-tight">파주시 월롱면 도감로172번길 44-10</p>
              <p className="text-gray-400 text-[10px] font-medium tracking-tight">010-6269-9612</p>
          </div>
          <div>
              <h3 className={`font-bold text-[13px] mb-1.5 tracking-wider ${textColor}`}>구매자</h3>
              <div className={`h-0.5 w-full bg-[#311b92] opacity-20 mb-2`}></div>
              <p className="font-black text-gray-800 text-[13px] mb-1">{data.customerName} 님</p>
              {data.address ? (
                  <p className="text-gray-400 text-[10px] font-medium tracking-tight break-keep">{data.address.replace(/\\n/g, ' ')}</p>
              ) : (
                  <p className="text-gray-300 text-[10px] font-medium tracking-tight">(주소 정보 없음)</p>
              )}
          </div>
      </div>

      {/* Table */}
      <div className="px-8 pb-3">
          <table className="w-full text-left border-collapse table-fixed mt-1">
            <thead>
              <tr className={`${themeColor} text-white`}>
                <th className="py-1 px-4 rounded-tl-md font-bold text-[11px] w-[50%]">물품</th>
                <th className="py-1 px-4 text-center font-bold text-[11px] whitespace-nowrap w-[15%]">수량</th>
                <th className="py-1 px-4 text-center font-bold text-[11px] whitespace-nowrap w-[15%]">단가</th>
                <th className="py-1 px-4 rounded-tr-md text-center font-bold text-[11px] whitespace-nowrap w-[20%]">합계</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, index) => (
                <tr key={index} className="border-b border-gray-100 last:border-0">
                  <td className="py-1 px-4 font-black text-gray-900 text-[11px] break-words leading-tight">
                    {item.name}
                  </td>
                  <td className="py-1 px-4 text-center font-bold text-gray-800 whitespace-nowrap text-[11px]">
                    {item.quantity}
                  </td>
                  <td className="py-1 px-4 text-center font-bold text-gray-800 whitespace-nowrap text-[11px]">
                    {item.price.toLocaleString()}
                  </td>
                  <td className="py-1 px-4 text-center font-bold text-gray-800 whitespace-nowrap text-[11px]">
                    {(item.price * item.quantity).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Total Price Right Aligned */}
          <div className="flex justify-end items-end mt-4 mb-2 pr-4">
              <span className="font-extrabold text-gray-800 mr-3 text-lg">총금액</span>
              <div className="bg-[#ede7f6] px-4 py-1.5 rounded-xl border border-[#d1c4e9] shadow-sm">
                  <span className="font-black text-2xl text-[#311b92] tracking-tight">
                      {data.totalPrice.toLocaleString()}<span className="text-xl font-black ml-1 text-[#311b92]">원</span>
                  </span>
              </div>
          </div>
      </div>

      {/* Spacer to push footer down if needed */}
      <div className="flex-1"></div>

      {/* Footer / Payment Methods */}
      <div className="bg-[#f9f9fb] w-full pt-8 pb-6 px-12 border-t border-gray-100 break-inside-avoid shadow-inner mt-auto">
          <div className="flex items-start justify-between">
              <div className="text-left flex-1 pr-4 pt-2">
                  <p className="font-extrabold text-gray-700 text-[17px] mb-2">무통장 입금 계좌 안내</p>
                  <p className="text-[12px] font-bold text-[#ff5252] break-keep leading-snug">
                    * 입금은 방송 다음날 오후 1시이전 미입금시<br/>
                    주문이 자동 취소 됩니다.
                  </p>
              </div>
              
              <div className="bg-white rounded border border-gray-200 shadow-sm w-[340px] flex flex-col items-center justify-center py-4 px-6 relative">
                  <div className="font-extrabold text-[18px] text-[#311b92] mb-3 tracking-wider">
                      입금하실 계좌
                  </div>
                  <div className="mb-2.5 mt-1">
                      <img src={cleanSaemaeul} alt="MG새마을금고" className="h-7 object-contain" />
                  </div>
                  
                  <div className="mb-2 mt-2 bg-[#f4effa] px-4 py-2 rounded-lg w-full text-center border border-[#e8dff4] shadow-sm">
                      <span className="text-[15px] font-bold text-gray-600 mr-2 tracking-tight">예금주 :</span>
                      <span className="font-black text-[#5e2f94] text-[19px] tracking-tight">보라몰(인다민)</span>
                  </div>
                  
                  <div className="mt-0.5">
                      <p className="font-black text-[26px] text-[#5e2f94] tracking-wider">010-6269-9612</p>
                  </div>
              </div>
          </div>
          <p className="text-center text-[10px] text-gray-300 mt-6 font-medium">
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
