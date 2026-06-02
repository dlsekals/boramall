"use client";

import { boramallLogo, saemaeulLogo } from './logos';
import React, { useEffect, useState } from 'react';

export interface InvoiceDateGroup {
  date: string;    // 표시용 날짜 ex) "6/3(목)"
  items: {
    name: string;
    quantity: number;
    price: number;
  }[];
  subtotal: number;
}

export interface InvoiceData {
  customerName: string;
  customerPhone?: string;
  customerNickname?: string;
  address: string;
  date: string;       // 단일 청구서의 날짜, 또는 기간 범위 표시 ex) "6/3~6/5"
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
  /** 날짜별 그룹 데이터가 있으면 합산 청구서로 렌더링됩니다 */
  dateGroups?: InvoiceDateGroup[];
}

interface InvoiceTemplateProps {
  data: InvoiceData;
  elementId?: string;
  hideButtons?: boolean;
}

export default function InvoiceTemplate({ data, hideButtons = false, customId }: { data: InvoiceData, hideButtons?: boolean, customId?: string }) {
  const elementId = customId || "invoice-capture";
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

  // User requested removal of image save functionality


  // Theme Colors
  const themeColor = "bg-[#4527a0]";
  const textColor = "text-[#311b92]";

  return (
    <div id={elementId} className="bg-white max-w-2xl mx-auto shadow-lg relative min-h-[700px] flex flex-col overflow-hidden sm:overflow-visible">

      {/* 입금완료 스탬프 */}
      {data.isPaid && (
        <div className="absolute top-32 right-8 border-4 border-red-500 text-red-500 font-black text-4xl px-4 py-2 transform -rotate-12 opacity-60 pointer-events-none select-none z-10 rounded-lg">
          입금 완료
        </div>
      )}

      {/* ===== 콤팩트 헤더 (1줄) ===== */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b-2 border-[#ede7f6]">
        {/* 좌측: 로고 */}
        <div className="flex items-center gap-2 shrink-0">
          <img src={cleanLogo} alt="보라몰" className="h-16 object-contain" />
        </div>

        {/* 중앙: 청구서 제목 (워터마크) */}
        <h2 className={`text-4xl font-black ${textColor} opacity-20 uppercase tracking-[0.3em] select-none`}>
          청구서
        </h2>

        {/* 우측: 날짜 + 판매자 정보 */}
        <div className="flex flex-col items-end gap-1 shrink-0 text-right">
          <div className="flex items-center gap-1.5">
            <span className={`${themeColor} text-white px-2 py-0.5 rounded text-[9px] font-bold tracking-widest`}>날짜</span>
            <span className="font-bold text-gray-700 text-xs bg-gray-50 px-2.5 py-0.5 rounded">{data.date}</span>
          </div>
          <div className="text-[10px] text-gray-400 leading-tight">
            <span className="font-medium">파주시 월롱면 도감로172번길 44-10</span>
          </div>
          <div className="text-[10px] text-gray-500 font-bold">010-6269-9612</div>
        </div>
      </div>

      {/* ===== 구매자 정보 (한 줄 바) ===== */}
      <div className="bg-[#f8f7ff] px-5 py-2.5 border-b border-[#e8e4f5] flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className={`text-[11px] font-black ${textColor} shrink-0`}>구매자</span>
        <span className="text-gray-800 text-[12px] font-black">
          {data.customerName} 님
          <span className="text-gray-500 font-bold ml-1 text-[11px]">
            (@{data.customerNickname ? data.customerNickname.replace(/^@/, '') : '닉네임없음'})
          </span>
        </span>
        {data.customerPhone && (
          <span className="text-gray-600 text-[11px] font-medium">📞 {data.customerPhone}</span>
        )}
        {data.address && (
          <span className="text-gray-500 text-[11px] truncate max-w-xs">🏠 {data.address}</span>
        )}
      </div>

      {/* Table — dateGroups가 있으면 날짜별 합산 청구서, 없으면 기존 단일 청구서 */}
      <div className="px-2 sm:px-8 pb-3 overflow-x-auto">

        {data.dateGroups && data.dateGroups.length > 0 ? (
          /* ── 날짜별 그룹 렌더링 (합산 청구서) ── */
          <div className="space-y-0">
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
                {data.dateGroups.map((group, groupIdx) => (
                  <React.Fragment key={`group-${groupIdx}`}>
                    {/* 날짜 구분 헤더 행 */}
                    <tr key={`group-header-${groupIdx}`} className="bg-[#ede7f6]">
                      <td colSpan={4} className="py-1 px-4">
                        <span className="font-black text-[#4527a0] text-[11px] tracking-wider">
                          📅 {group.date}
                        </span>
                        <span className="text-[#7c4dff] text-[10px] font-bold ml-2">
                          소계: {group.subtotal.toLocaleString()}원
                        </span>
                      </td>
                    </tr>
                    {/* 해당 날짜 품목 */}
                    {group.items.map((item, itemIdx) => (
                      <tr key={`group-${groupIdx}-item-${itemIdx}`} className="border-b border-gray-100">
                        <td className="py-1.5 px-4 font-black text-gray-900 text-[12.5px] break-words leading-tight pl-6">
                          {item.name}
                        </td>
                        <td className="py-1.5 px-4 text-center font-bold text-gray-800 whitespace-nowrap text-[11.5px]">
                          {item.quantity}
                        </td>
                        <td className="py-1.5 px-4 text-center font-bold text-gray-800 whitespace-nowrap text-[11.5px]">
                          {item.price.toLocaleString()}
                        </td>
                        <td className="py-1.5 px-4 text-center font-bold text-gray-800 whitespace-nowrap text-[11.5px]">
                          {(item.price * item.quantity).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* ── 기존 단일 청구서 렌더링 ── */
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
                  <td className="py-1.5 px-4 font-black text-gray-900 text-[12.5px] break-words leading-tight">
                    {item.name}
                  </td>
                  <td className="py-1.5 px-4 text-center font-bold text-gray-800 whitespace-nowrap text-[11.5px]">
                    {item.quantity}
                  </td>
                  <td className="py-1.5 px-4 text-center font-bold text-gray-800 whitespace-nowrap text-[11.5px]">
                    {item.price.toLocaleString()}
                  </td>
                  <td className="py-1.5 px-4 text-center font-bold text-gray-800 whitespace-nowrap text-[11.5px]">
                    {(item.price * item.quantity).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 총금액 */}
        <div className="flex justify-end items-end mt-4 mb-2 pr-2 sm:pr-4">
            <div className="flex flex-col items-end mr-3 mb-0.5">
                <span className="font-extrabold text-gray-800 text-base">총금액</span>
                <span className="text-[10px] font-bold text-gray-400 mt-[-2px]">(VAT 포함)</span>
            </div>
            <div className="bg-[#ede7f6] px-3 py-1 rounded-lg border border-[#d1c4e9] shadow-sm">
                <span className="font-black text-xl text-[#311b92] tracking-tight">
                    {data.totalPrice.toLocaleString()}<span className="text-lg font-black ml-1 text-[#311b92]">원</span>
                </span>
            </div>
        </div>
      </div>

      {/* Spacer to push footer down if needed */}
      <div className="flex-1"></div>

      {/* Footer / Payment Methods */}
      <div className="bg-[#f9f9fb] w-full pt-5 pb-5 px-4 sm:px-8 border-t border-gray-100 break-inside-avoid shadow-inner mt-auto">
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 sm:gap-0">
              <div className="text-left w-full sm:flex-1 sm:pr-4 flex flex-col justify-center">
                  <p className="text-[11px] font-medium text-gray-400 break-keep leading-snug">
                    * 사업자 번호로 영수증 발행 원하실 경우, 따로 기입해 주시기 바랍니다.
                  </p>
              </div>
              
              <div className="bg-white rounded border border-gray-200 shadow-sm w-full max-w-[300px] flex flex-col items-center justify-center pt-2 pb-2 px-5 relative mx-auto sm:mx-0">
                  <div className="font-extrabold text-[20px] text-[#4527a0] mb-1 tracking-wider leading-none">
                      입금하실 계좌
                  </div>
                  <div className="mb-0.5 mt-1">
                      <img src={cleanSaemaeul} alt="MG새마을금고" className="h-8 object-contain" />
                  </div>
                  
                  <div className="mb-0.5 mt-0.5">
                      <p className="font-black text-[26px] text-[#4527a0] tracking-wider leading-none">010-6269-9612</p>
                  </div>
                  
                  <div className="w-full text-center mt-1">
                      <span className="text-[15px] font-bold text-gray-600 mr-2 tracking-tight">예금주 :</span>
                      <span className="font-black text-[#4527a0] text-[17px] tracking-tight">보라몰(인다민)</span>
                  </div>
              </div>
          </div>
          <p className="text-center text-[10px] text-gray-300 mt-6 font-medium">
              이용해 주셔서 감사합니다. | 보라몰
          </p>
      </div>

      {/* Action Buttons (Not Captured) */}

      
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
