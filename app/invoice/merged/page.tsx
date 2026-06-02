"use client";

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import InvoiceTemplate, { InvoiceData, InvoiceDateGroup } from '../../components/InvoiceTemplate';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function parseKoreanDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (match) return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function formatDisplayDate(dateStr: string): string {
  const d = parseKoreanDate(dateStr);
  if (!d) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]})`;
}

function MergedInvoiceContent() {
  const params = useSearchParams();
  const userId = params.get('userId') || '';
  const from = params.get('from') || '';
  const to = params.get('to') || '';

  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ordersRes, usersRes] = await Promise.all([
          fetch('/api/orders').then(r => r.json()),
          fetch('/api/users').then(r => r.json()),
        ]);

        const orders = Array.isArray(ordersRes) ? ordersRes : [];
        const users = Array.isArray(usersRes) ? usersRes : [];

        // 해당 고객 찾기
        const user = users.find(
          (u: { phone: string; nickname: string }) => u.phone === userId || u.nickname === userId
        );

        // 기간 내 해당 고객 주문 필터링
        const customerOrders = orders.filter((o: { userId: string; createdAt: string; isArchived?: boolean }) => {
          if (o.userId !== userId) return false;
          if (o.isArchived) return false;
          const d = parseKoreanDate(o.createdAt || '');
          if (!d) return true;
          if (from) {
            const f = new Date(from);
            if (d < f) return false;
          }
          if (to) {
            const t = new Date(to);
            t.setDate(t.getDate() + 1);
            if (d >= t) return false;
          }
          return true;
        });

        if (customerOrders.length === 0) {
          setError('해당 기간에 주문 내역이 없습니다.');
          setLoading(false);
          return;
        }

        // 날짜 오름차순 정렬
        customerOrders.sort((a: { createdAt: string }, b: { createdAt: string }) => {
          const da = parseKoreanDate(a.createdAt || '');
          const db = parseKoreanDate(b.createdAt || '');
          if (!da || !db) return 0;
          return da.getTime() - db.getTime();
        });

        // dateGroups 구성
        const dateGroups: InvoiceDateGroup[] = customerOrders.map((order: {
          createdAt: string;
          items: { productName: string; quantity: number; price: number }[];
          totalPrice: number;
        }) => ({
          date: formatDisplayDate(order.createdAt || ''),
          items: order.items.map((i) => ({
            name: i.productName,
            quantity: i.quantity,
            price: i.price,
          })),
          subtotal: order.totalPrice,
        }));

        const totalPrice = customerOrders.reduce((s: number, o: { totalPrice: number }) => s + o.totalPrice, 0);
        const allPaid = customerOrders.every((o: { isPaid: boolean }) => o.isPaid);

        let periodLabel: string;
        if (customerOrders.length === 1) {
          periodLabel = formatDisplayDate(customerOrders[0].createdAt || '');
        } else {
          periodLabel = `${formatDisplayDate(customerOrders[0].createdAt || '')} ~ ${formatDisplayDate(customerOrders[customerOrders.length - 1].createdAt || '')}`;
        }

        const firstOrder = customerOrders[0];
        setInvoiceData({
          customerName: user?.name || '미등록',
          customerPhone: user?.phone,
          customerNickname: user?.nickname,
          address: firstOrder.shippingAddress || user?.address || '',
          date: periodLabel,
          items: [],
          totalPrice,
          bankName: '새마을금고',
          accountNumber: '010-6269-9612',
          accountHolder: '보라몰',
          isPaid: allPaid,
          dateGroups,
        });
      } catch (e) {
        console.error(e);
        setError('청구서를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId, from, to]);

  const handleDownload = async () => {
    const element = document.getElementById('invoice-capture-merged');
    if (!element) return;
    const originalScrollY = window.scrollY;
    window.scrollTo(0, 0);
    const { toPng } = await import('html-to-image');
    try {
      await toPng(element, { cacheBust: true });
      await new Promise(r => setTimeout(r, 100));
      const dataUrl = await toPng(element, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        style: { transform: 'scale(1)', transformOrigin: 'top left', width: element.scrollWidth + 'px' },
        width: element.scrollWidth,
        height: element.scrollHeight,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `보라몰_청구서_${invoiceData?.customerName || ''}.png`;
      link.click();
    } catch {
      alert('이미지 저장 중 오류가 발생했습니다.');
    } finally {
      window.scrollTo(0, originalScrollY);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📋</div>
          <p className="text-gray-500 font-medium">청구서를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !invoiceData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-red-500">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="font-bold">{error || '청구서를 불러올 수 없습니다.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-6 px-4 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        <InvoiceTemplate
          data={invoiceData}
          hideButtons={false}
          customId="invoice-capture-merged"
        />
        <div className="mt-4 space-y-2">
          <button
            onClick={handleDownload}
            className="w-full py-4 bg-[#673ab7] text-white font-bold text-lg rounded-lg hover:bg-[#5e35b1] transition-colors shadow"
          >
            📥 청구서 이미지 저장
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MergedInvoicePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">불러오는 중...</p>
      </div>
    }>
      <MergedInvoiceContent />
    </Suspense>
  );
}
