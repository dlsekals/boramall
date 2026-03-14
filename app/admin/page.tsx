"use client";

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';
import InventoryTab from './components/InventoryTab';
import OrderEntryTab from './components/OrderEntryTab';
import OrderManagementTab from './components/OrderManagementTab';
import UserManagementTab from './components/UserManagementTab';
import DashboardTab from './components/DashboardTab';
import DeliveryManagementTab from './components/DeliveryManagementTab';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'inventory' | 'entry' | 'management' | 'users' | 'dashboard' | 'delivery'>('users');
  const { products, orders } = useApp();
  const { data: session, status } = useSession();
  const router = useRouter();

  const activeProductsCount = products.filter(p => p.isActive).length;
  const unpaidOrdersCount = orders.filter(o => !o.isPaid).length;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/admin/login');
    }
  }, [status, router]);

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#673ab7]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b shadow-sm sticky top-0 z-10 w-full overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-2 sm:py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6">
          <div className="flex items-center justify-between md:justify-start gap-4 lg:gap-6 shrink-0">
              <div className="flex flex-col">
                <h1 className="text-lg sm:text-xl font-bold text-[#673ab7] flex items-center gap-2 whitespace-nowrap">
                  🛍️ 보라몰 관리자 페이지
                </h1>
                {session?.user && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500 font-medium">관리자: {session.user.name}</span>
                    <button 
                      onClick={() => signOut({ callbackUrl: '/admin/login' })}
                      className="text-xs text-red-500 hover:text-red-700 underline underline-offset-2"
                    >
                      로그아웃
                    </button>
                  </div>
                )}
              </div>
              <div className="hidden lg:flex gap-4 text-xs sm:text-sm font-medium text-gray-600 whitespace-nowrap">
                 <span>활성 상품: <b className="text-green-600">{activeProductsCount}</b></span>
                 <span>대기 주문: <b className="text-red-500">{unpaidOrdersCount}</b></span>
              </div>
          </div>
          
          {/* Tabs */}
          <div 
            className="flex items-center justify-start md:justify-end gap-1.5 sm:gap-2 overflow-x-auto w-full pb-1 md:pb-0 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {[
              { id: 'users', icon: '👥', label: '회원 관리' },
              { id: 'inventory', icon: '📦', label: '재고 관리' },
              { id: 'entry', icon: '⚡', label: '주문 입력' },
              { id: 'management', icon: '🧾', label: '주문 내역' },
              { id: 'delivery', icon: '🚚', label: '배송 관리' },
              { id: 'dashboard', icon: '📊', label: '통계/보관' },
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'users' | 'inventory' | 'entry' | 'management' | 'delivery' | 'dashboard')}
                className={`relative flex items-center justify-center shrink-0 min-w-max gap-1 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm whitespace-nowrap transition-colors duration-200 border ${
                    activeTab === tab.id 
                    ? 'bg-gradient-to-br from-[#673ab7] to-[#9c27b0] text-white shadow-md shadow-purple-500/30 border-transparent' 
                    : 'bg-gray-50/50 text-gray-500 hover:bg-purple-50 hover:text-[#673ab7] border-gray-200/60 hover:border-purple-200'
                }`}
              >
                <span className="text-sm sm:text-base mb-[1px]">{tab.icon}</span>
                <span>{tab.label.split(' ')[0]}<span className="hidden sm:inline"> {tab.label.split(' ')[1]}</span></span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] mx-auto w-full p-4 sm:p-6">
        {activeTab === 'users' && <UserManagementTab />}
        {activeTab === 'inventory' && <InventoryTab />}
        {activeTab === 'entry' && <OrderEntryTab />}
        {activeTab === 'management' && <OrderManagementTab />}
        {activeTab === 'delivery' && <DeliveryManagementTab />}
        {activeTab === 'dashboard' && <DashboardTab />}
      </main>
    </div>
  );
}
