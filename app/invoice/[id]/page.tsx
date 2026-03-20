"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApp, Order, User } from '../../context/AppContext';
import InvoiceTemplate, { InvoiceData } from '../../components/InvoiceTemplate';

export default function DynamicInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const { orders, users, getUser } = useApp();
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;

    // Find Order
    const order = orders.find(o => o.id === params.id);
    
    if (order) {
        const user = getUser(order.userId);
        if (user) {
             const data: InvoiceData = {
                customerName: user.name, // Real name
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
             setInvoiceData(data);
        }
    }
    setLoading(false);

  }, [params.id, orders, users, getUser]);

  if (loading) return <div className="p-10 text-center">로딩 중...</div>;

  if (!invoiceData) {
      return (
          <div className="p-10 text-center">
              <h1 className="text-xl font-bold mb-4">청구서를 찾을 수 없습니다.</h1>
              <button 
                onClick={() => router.push('/')}
                className="text-blue-500 underline"
              >
                  홈으로 돌아가기
              </button>
          </div>
      );
  }

  return (
    <div className="min-h-screen py-8 px-4 flex flex-col justify-center sm:py-12 bg-gray-50">
       <InvoiceTemplate data={invoiceData} />
       
       <footer className="mt-8 text-center text-sm text-gray-500">
        &copy; 2026 Bora Mall
      </footer>
    </div>
  );
}
