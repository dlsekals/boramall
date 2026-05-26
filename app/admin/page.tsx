"use client";

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

import { useApp } from '../context/AppContext';
import InventoryTab from './components/InventoryTab';
import OrderEntryTab from './components/OrderEntryTab';
import OrderManagementTab from './components/OrderManagementTab';
import OrderItemStatusTab from './components/OrderItemStatusTab';
import UserManagementTab from './components/UserManagementTab';
import DashboardTab from './components/DashboardTab';
import DeliveryManagementTab from './components/DeliveryManagementTab';
import AlertsTab from './components/AlertsTab';

type TabId = 'users' | 'inventory' | 'entry' | 'management' | 'itemstatus' | 'delivery' | 'alerts' | 'dashboard';

// 하단 바에 표시할 주요 5개 탭
const BOTTOM_TABS = [
  { id: 'entry',      icon: '⚡', label: '주문입력' },
  { id: 'management', icon: '🧾', label: '주문내역' },
  { id: 'users',      icon: '👥', label: '회원' },
  { id: 'inventory',  icon: '📦', label: '재고' },
  { id: 'more',       icon: '⋯',  label: '더보기' },
] as const;

// 사이드바 전체 탭
const ALL_TABS = [
  { id: 'users',      icon: '👥', label: '회원 관리' },
  { id: 'inventory',  icon: '📦', label: '재고 관리' },
  { id: 'entry',      icon: '⚡', label: '주문 입력' },
  { id: 'management', icon: '🧾', label: '주문 내역' },
  { id: 'itemstatus', icon: '📋', label: '주문 물품 현황' },
  { id: 'delivery',   icon: '🚚', label: '배송 관리' },
  { id: 'alerts',     icon: '🔔', label: '관리 알림' },
  { id: 'dashboard',  icon: '📊', label: '통계/대시보드' },
] as const;

// 더보기 드로어에 표시할 탭
const MORE_TABS = [
  { id: 'itemstatus', icon: '📋', label: '주문 물품 현황' },
  { id: 'delivery',   icon: '🚚', label: '배송 관리' },
  { id: 'alerts',     icon: '🔔', label: '관리 알림' },
  { id: 'dashboard',  icon: '📊', label: '통계/대시보드' },
] as const;

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>('entry');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const { products, orders } = useApp();
  const { data: session, status } = useSession();
  const router = useRouter();

  const activeProductsCount = products.filter(p => p.isActive).length;
  const unpaidOrdersCount = orders.filter(o => !o.isPaid).length;
  const lowStockCount = products.filter(p => p.stock < 5 && p.stock > 0).length;

  const urgentExpiryCount = products.filter(p => {
    if (!p.expirationDate || p.expirationDate.length < 6) return false;
    const expDate = new Date(`20${p.expirationDate.substring(0,2)}-${p.expirationDate.substring(2,4)}-${p.expirationDate.substring(4,6)}`);
    const diff = Math.floor((expDate.getTime() - Date.now()) / 86400000);
    return diff >= 0 && diff <= 14;
  }).length;

  const alertCount = lowStockCount + urgentExpiryCount;

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login');
  }, [status, router]);

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#673ab7]" />
      </div>
    );
  }

  const handleTabChange = (id: TabId) => {
    setActiveTab(id);
    setMoreDrawerOpen(false);
  };

  const currentTab = ALL_TABS.find(t => t.id === activeTab);

  return (
    <div className="min-h-screen flex bg-gray-100">

      {/* ===== 데스크톱 좌측 사이드바 (md 이상에서만 표시) ===== */}
      <aside className={`hidden md:flex flex-col bg-[#1e1b2e] text-white transition-all duration-300 shrink-0 sticky top-0 h-screen z-20 ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
        {/* 로고 */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-white/10 ${sidebarCollapsed ? 'justify-center px-2' : ''}`}>
          <span className="text-2xl shrink-0">🛍️</span>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <h1 className="text-sm font-black text-white tracking-tight">보라몰</h1>
              <p className="text-[10px] text-purple-300">관리자 페이지</p>
            </div>
          )}
        </div>

        {/* 통계 뱃지 */}
        {!sidebarCollapsed && (
          <div className="px-3 py-3 border-b border-white/10 space-y-1.5">
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
          {ALL_TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const showBadge = tab.id === 'alerts' && alertCount > 0;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id as TabId)}
                title={sidebarCollapsed ? tab.label : undefined}
                className={`w-full flex items-center gap-3 py-3 text-sm font-semibold transition-all relative group ${sidebarCollapsed ? 'justify-center px-0' : 'px-4'} ${isActive ? 'bg-[#673ab7] text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
              >
                {isActive && <span className="absolute left-0 top-0 h-full w-1 bg-purple-300 rounded-r-full" />}
                <span className="text-lg shrink-0 relative">
                  {tab.icon}
                  {showBadge && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">{alertCount}</span>}
                </span>
                {!sidebarCollapsed && <span className="truncate">{tab.label}</span>}
                {sidebarCollapsed && (
                  <div className="absolute left-full ml-2 z-50 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                    {tab.label}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* 하단 유저 + 접기 */}
        <div className={`border-t border-white/10 py-3 ${sidebarCollapsed ? 'px-1' : 'px-3'}`}>
          <button
            onClick={() => setSidebarCollapsed(p => !p)}
            className="w-full flex items-center justify-center gap-2 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg text-xs font-medium mb-2 transition-colors"
          >
            <span>{sidebarCollapsed ? '▶' : '◀'}</span>
            {!sidebarCollapsed && <span>접기</span>}
          </button>
          {!sidebarCollapsed && session?.user && (
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
              <div className="w-7 h-7 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-black shrink-0">
                {session.user.name?.[0] || 'A'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white font-semibold truncate">{session.user.name}</p>
                <button onClick={() => signOut({ callbackUrl: '/admin/login' })} className="text-[10px] text-red-400 hover:text-red-300 underline">로그아웃</button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ===== 메인 콘텐츠 ===== */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* 상단 헤더 */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
          <div className="px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3">
            {/* 모바일: 로고 + 탭명 */}
            <div className="flex items-center gap-2">
              <span className="text-lg md:hidden">🛍️</span>
              <span className="text-lg hidden md:block">{currentTab?.icon}</span>
              <h2 className="text-sm sm:text-base font-bold text-gray-800">{currentTab?.label}</h2>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
              <span className="hidden sm:flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <b className="text-green-600">{activeProductsCount}</b>개
              </span>
              <span className="hidden sm:flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                미입금 <b className="text-red-500 ml-1">{unpaidOrdersCount}건</b>
              </span>
              {/* 모바일: 간략 통계 */}
              <span className="flex sm:hidden items-center gap-1 text-red-500 font-bold">
                미입금 {unpaidOrdersCount}건
              </span>
              {alertCount > 0 && (
                <button onClick={() => handleTabChange('alerts')} className="flex items-center gap-1 bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-1 rounded-full text-xs animate-pulse">
                  ⚠️ {alertCount}
                </button>
              )}
              {/* 모바일: 로그아웃 */}
              <button onClick={() => signOut({ callbackUrl: '/admin/login' })} className="md:hidden text-xs text-red-400 border border-red-200 px-2 py-1 rounded-lg">
                로그아웃
              </button>
            </div>
          </div>
        </header>

        {/* 탭 콘텐츠 — 모바일에서 하단 탭 바 높이만큼 패딩 추가 */}
        <main className="flex-1 p-3 sm:p-6 max-w-[1600px] w-full mx-auto pb-24 md:pb-6">
          {activeTab === 'users'      && <UserManagementTab />}
          {activeTab === 'inventory'  && <InventoryTab />}
          {activeTab === 'entry'      && <OrderEntryTab />}
          {activeTab === 'management' && <OrderManagementTab />}
          {activeTab === 'itemstatus' && <OrderItemStatusTab />}
          {activeTab === 'delivery'   && <DeliveryManagementTab />}
          {activeTab === 'alerts'     && <AlertsTab />}
          {activeTab === 'dashboard'  && <DashboardTab />}
        </main>
      </div>

      {/* ===== 모바일 하단 탭 바 (md 미만에서만 표시) ===== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-lg">
        <div className="flex items-stretch h-16">
          {BOTTOM_TABS.map(tab => {
            const isMore = tab.id === 'more';
            const isActive = isMore ? moreDrawerOpen : activeTab === (tab.id as TabId);
            const showBadge = isMore && alertCount > 0;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (isMore) {
                    setMoreDrawerOpen(p => !p);
                  } else {
                    handleTabChange(tab.id as TabId);
                  }
                }}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors relative ${isActive ? 'text-[#673ab7]' : 'text-gray-400'}`}
              >
                {isActive && !isMore && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#673ab7] rounded-full" />}
                <span className="text-xl relative">
                  {tab.icon}
                  {showBadge && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">{alertCount}</span>}
                </span>
                <span className="text-[10px]">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ===== 모바일 더보기 드로어 ===== */}
      {moreDrawerOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setMoreDrawerOpen(false)} />
          <div className="md:hidden fixed bottom-16 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl p-4">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            <div className="grid grid-cols-2 gap-3">
              {MORE_TABS.map(tab => {
                const isActive = activeTab === tab.id;
                const showBadge = tab.id === 'alerts' && alertCount > 0;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id as TabId)}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 font-semibold text-sm transition-colors ${isActive ? 'border-[#673ab7] bg-purple-50 text-[#673ab7]' : 'border-gray-200 text-gray-600 hover:border-purple-200'}`}
                  >
                    <span className="text-2xl relative">
                      {tab.icon}
                      {showBadge && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">{alertCount}</span>}
                    </span>
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
            {session?.user && (
              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <span className="text-sm text-gray-600">👤 {session.user.name}</span>
                <button onClick={() => signOut({ callbackUrl: '/admin/login' })} className="text-sm text-red-500 font-semibold">로그아웃</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
