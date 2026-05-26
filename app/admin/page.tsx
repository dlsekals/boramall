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
import AlertsTab from './components/AlertsTab';

type TabId = 'users' | 'inventory' | 'entry' | 'management' | 'alerts' | 'dashboard';

const TABS = [
  { id: 'users',      icon: '👥', label: '회원 관리',  shortLabel: '회원' },
  { id: 'inventory',  icon: '📦', label: '재고 관리',  shortLabel: '재고' },
  { id: 'entry',      icon: '⚡', label: '주문 입력',  shortLabel: '입력' },
  { id: 'management', icon: '🧾', label: '주문 내역',  shortLabel: '내역' },
  { id: 'alerts',     icon: '🔔', label: '관리 알림',  shortLabel: '알림' },
  { id: 'dashboard',  icon: '📊', label: '통계/대시보드', shortLabel: '통계' },
] as const;

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>('entry');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { products, orders } = useApp();
  const { data: session, status } = useSession();
  const router = useRouter();

  const activeProductsCount = products.filter(p => p.isActive).length;
  const unpaidOrdersCount = orders.filter(o => !o.isPaid).length;
  const lowStockCount = products.filter(p => p.stock < 5 && p.stock > 0).length;

  // 유통기한 14일 이내 상품 카운트
  const urgentExpiryCount = products.filter(p => {
    if (!p.expirationDate || p.expirationDate.length < 6) return false;
    const year = '20' + p.expirationDate.substring(0, 2);
    const month = p.expirationDate.substring(2, 4);
    const day = p.expirationDate.substring(4, 6);
    const expDate = new Date(`${year}-${month}-${day}`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
    return diff >= 0 && diff <= 14;
  }).length;

  const alertCount = lowStockCount + urgentExpiryCount;

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
    <div className="min-h-screen flex bg-gray-100">
      
      {/* ========== 좌측 사이드바 ========== */}
      <aside
        className={`flex flex-col bg-[#1e1b2e] text-white transition-all duration-300 ease-in-out shrink-0 sticky top-0 h-screen z-20 ${
          sidebarCollapsed ? 'w-[64px]' : 'w-[220px]'
        }`}
      >
        {/* 로고 영역 */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-white/10 ${sidebarCollapsed ? 'justify-center px-2' : ''}`}>
          <span className="text-2xl flex-shrink-0">🛍️</span>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <h1 className="text-sm font-black text-white tracking-tight leading-tight">보라몰</h1>
              <p className="text-[10px] text-purple-300 font-medium">관리자 페이지</p>
            </div>
          )}
        </div>

        {/* 통계 뱃지 (접힌 경우 숨김) */}
        {!sidebarCollapsed && (
          <div className="px-3 py-3 border-b border-white/10 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">활성 상품</span>
              <span className="bg-green-500/20 text-green-300 font-bold px-2 py-0.5 rounded-full">{activeProductsCount}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">대기 주문</span>
              <span className="bg-red-500/20 text-red-300 font-bold px-2 py-0.5 rounded-full">{unpaidOrdersCount}</span>
            </div>
            {alertCount > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-yellow-400">⚠️ 알림</span>
                <span className="bg-yellow-500/20 text-yellow-300 font-bold px-2 py-0.5 rounded-full">{alertCount}</span>
              </div>
            )}
          </div>
        )}

        {/* 탭 메뉴 */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const showBadge = tab.id === 'alerts' && alertCount > 0;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabId)}
                title={sidebarCollapsed ? tab.label : undefined}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-all duration-150 relative group ${
                  sidebarCollapsed ? 'justify-center px-0' : ''
                } ${
                  isActive
                    ? 'bg-[#673ab7] text-white shadow-lg shadow-purple-900/50'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {/* 활성 표시 왼쪽 바 */}
                {isActive && <span className="absolute left-0 top-0 h-full w-1 bg-purple-300 rounded-r-full" />}
                
                <span className="text-lg flex-shrink-0 relative">
                  {tab.icon}
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                      {alertCount}
                    </span>
                  )}
                </span>
                {!sidebarCollapsed && (
                  <span className="truncate">{tab.label}</span>
                )}

                {/* 접힌 상태 툴팁 */}
                {sidebarCollapsed && (
                  <div className="absolute left-full ml-2 z-50 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                    {tab.label}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* 하단: 유저 정보 + 로그아웃 */}
        <div className={`border-t border-white/10 py-3 ${sidebarCollapsed ? 'px-1' : 'px-3'}`}>
          {/* 사이드바 접기/펼치기 버튼 */}
          <button
            onClick={() => setSidebarCollapsed(prev => !prev)}
            className="w-full flex items-center justify-center gap-2 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-xs font-medium mb-2"
            title={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
          >
            <span className="text-base">{sidebarCollapsed ? '▶' : '◀'}</span>
            {!sidebarCollapsed && <span>접기</span>}
          </button>

          {!sidebarCollapsed && session?.user && (
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
              <div className="w-7 h-7 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                {session.user.name?.[0] || 'A'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white font-semibold truncate">{session.user.name}</p>
                <button
                  onClick={() => signOut({ callbackUrl: '/admin/login' })}
                  className="text-[10px] text-red-400 hover:text-red-300 underline underline-offset-1"
                >
                  로그아웃
                </button>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <button
              onClick={() => signOut({ callbackUrl: '/admin/login' })}
              className="w-full flex items-center justify-center py-2 text-red-400 hover:text-red-300 hover:bg-white/5 rounded-lg transition-colors"
              title="로그아웃"
            >
              <span className="text-base">↪</span>
            </button>
          )}
        </div>
      </aside>

      {/* ========== 메인 콘텐츠 영역 ========== */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* 상단 헤더 (얇게) */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
          <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {/* 현재 탭 표시 */}
              <span className="text-lg">{TABS.find(t => t.id === activeTab)?.icon}</span>
              <h2 className="text-base font-bold text-gray-800">
                {TABS.find(t => t.id === activeTab)?.label}
              </h2>
            </div>
            
            {/* 빠른 통계 배지 */}
            <div className="flex items-center gap-3 text-xs font-semibold text-gray-500">
              <span className="hidden sm:flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span>
                활성 상품 <b className="text-green-600 ml-1">{activeProductsCount}개</b>
              </span>
              <span className="hidden sm:flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block"></span>
                미입금 <b className="text-red-500 ml-1">{unpaidOrdersCount}건</b>
              </span>
              {alertCount > 0 && (
                <button
                  onClick={() => setActiveTab('alerts')}
                  className="flex items-center gap-1 bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-1 rounded-full animate-pulse"
                >
                  ⚠️ <span>알림 {alertCount}건</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* 탭 콘텐츠 */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
          {activeTab === 'users'      && <UserManagementTab />}
          {activeTab === 'inventory'  && <InventoryTab />}
          {activeTab === 'entry'      && <OrderEntryTab />}
          {activeTab === 'management' && <OrderManagementTab />}
          {activeTab === 'alerts'     && <AlertsTab />}
          {activeTab === 'dashboard'  && <DashboardTab />}
        </main>
      </div>
    </div>
  );
}
