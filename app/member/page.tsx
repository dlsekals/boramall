"use client";

import { useSearchParams, useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';
import { Suspense, useEffect, useState } from 'react';

function MemberContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { users, orders } = useApp();
  const nickname = searchParams.get('nickname');

  const user = users.find(u => u.nickname === nickname);
  const myOrders = orders.filter(o => o.userId === nickname);

  // Calculate totals
  const totalSpent = myOrders.reduce((sum, o) => sum + o.totalPrice, 0);
  const unpaidAmount = myOrders.filter(o => !o.isPaid).reduce((sum, o) => sum + o.totalPrice, 0);

  if (!user) {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <p>잘못된 접근입니다. 다시 로그인해주세요.</p>
            <button onClick={() => router.push('/')} className="ml-4 text-blue-500 underline">로그인</button>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4">
      <div className="max-w-3xl w-full">
        {/* Header */}
        <div className="bg-white p-6 rounded-lg shadow-sm mb-6 flex justify-between items-center">
            <div>
                <h1 className="text-2xl font-bold text-[#673ab7]">마이 페이지 (My Page)</h1>
                <p className="text-gray-500 mt-1">
                    반갑습니다, <strong>{user.name}</strong> ({user.nickname})님!
                </p>
            </div>
            <button 
                onClick={() => router.push('/')}
                className="text-gray-400 hover:text-gray-600 underline text-sm"
            >
                로그아웃
            </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-[#673ab7] p-6 rounded-lg text-white shadow-md">
                <h3 className="text-sm opacity-80 mb-2">총 주문 금액</h3>
                <p className="text-2xl font-bold">{totalSpent.toLocaleString()}원</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md border-2 border-[#673ab7]">
                <h3 className="text-sm text-gray-500 mb-2">입금 대기 금액</h3>
                <p className="text-2xl font-bold text-[#673ab7]">{unpaidAmount.toLocaleString()}원</p>
            </div>
        </div>

        {/* Order List */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <h2 className="text-xl font-bold p-6 border-b">주문 내역</h2>
            {myOrders.length === 0 ? (
                <div className="p-10 text-center text-gray-500">
                    주문 내역이 없습니다.
                </div>
            ) : (
                <div className="divide-y">
                    {myOrders.map(order => (
                        <div key={order.id} className="p-6 hover:bg-gray-50 transition">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <span className={`inline-block px-2 py-1 rounded text-xs font-bold mb-2 ${order.isPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {order.isPaid ? '구매 확정' : '입금 대기'}
                                    </span>
                                    <h3 className="font-bold text-lg">
                                        {order.items[0].productName} 
                                        {order.items.length > 1 && ` 외 ${order.items.length - 1}건`}
                                    </h3>
                                    <p className="text-sm text-gray-400">{order.createdAt}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-xl">{order.totalPrice.toLocaleString()}원</p>
                                    <button 
                                        onClick={() => router.push(`/invoice/${order.id}`)}
                                        className="mt-2 text-[#673ab7] text-sm font-bold underline"
                                    >
                                        영수증 보기 &gt;
                                    </button>
                                </div>
                            </div>
                            
                            {/* Simple Item List */}
                            <div className="bg-gray-50 p-3 rounded text-sm text-gray-600">
                                {order.items.map((item, idx) => (
                                    <div key={idx} className="flex justify-between py-1">
                                        <span>{item.productName} x {item.quantity}</span>
                                        <span>{(item.price * item.quantity).toLocaleString()}원</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
}

export default function MemberPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">로딩 중...</div>}>
      <MemberContent />
    </Suspense>
  );
}
