"use client";

import { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function AlertsTab() {
  const { products, orders, users } = useApp();
  const [tab, setTab] = useState<'expiry' | 'stock' | 'unpaid'>('expiry');

  // ── 유통기한 임박 상품 ──
  const expiryAlerts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return products
      .filter(p => p.expirationDate && p.expirationDate.length === 6)
      .map(p => {
        const year = '20' + p.expirationDate!.substring(0, 2);
        const month = p.expirationDate!.substring(2, 4);
        const day = p.expirationDate!.substring(4, 6);
        const expDate = new Date(`${year}-${month}-${day}`);
        const diff = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
        return { ...p, daysLeft: diff };
      })
      .filter(p => p.daysLeft <= 30)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [products]);

  // ── 재고 부족 상품 ──
  const stockAlerts = useMemo(() => {
    return products
      .filter(p => p.stock <= 5)
      .sort((a, b) => a.stock - b.stock);
  }, [products]);

  // ── 미입금 주문 ──
  const unpaidOrders = useMemo(() => {
    return orders
      .filter(o => !o.isPaid)
      .map(o => {
        const user = users.find(u => u.phone === o.userId || u.nickname === o.userId);
        return { ...o, user };
      })
      .sort((a, b) => b.totalPrice - a.totalPrice);
  }, [orders, users]);

  const urgentExpiry = expiryAlerts.filter(p => p.daysLeft <= 14);
  const criticalStock = stockAlerts.filter(p => p.stock === 0);
  const totalUnpaid = unpaidOrders.reduce((s, o) => s + o.totalPrice, 0);

  const getDayColor = (days: number) => {
    if (days < 0) return 'text-red-700 bg-red-50';
    if (days <= 7) return 'text-red-600 bg-red-50';
    if (days <= 14) return 'text-orange-600 bg-orange-50';
    return 'text-yellow-700 bg-yellow-50';
  };

  const getDayLabel = (days: number) => {
    if (days < 0) return `D+${Math.abs(days)} 만료`;
    if (days === 0) return 'D-Day';
    return `D-${days}`;
  };

  return (
    <div className="space-y-6">
      {/* ── 요약 카드 ── */}
      <div className="grid grid-cols-3 gap-4">
        <div
          onClick={() => setTab('expiry')}
          className={`cursor-pointer rounded-xl p-4 border-l-4 transition-all ${
            urgentExpiry.length > 0
              ? 'border-red-500 bg-red-50 hover:bg-red-100'
              : 'border-gray-300 bg-white hover:bg-gray-50'
          } ${tab === 'expiry' ? 'ring-2 ring-red-300' : ''}`}
        >
          <p className="text-xs font-bold text-gray-500 mb-1">유통기한 임박 (14일↓)</p>
          <p className={`text-3xl font-black ${urgentExpiry.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {urgentExpiry.length}
          </p>
          <p className="text-xs text-gray-400 mt-1">30일 이내 총 {expiryAlerts.length}건</p>
        </div>

        <div
          onClick={() => setTab('stock')}
          className={`cursor-pointer rounded-xl p-4 border-l-4 transition-all ${
            criticalStock.length > 0
              ? 'border-orange-500 bg-orange-50 hover:bg-orange-100'
              : 'border-gray-300 bg-white hover:bg-gray-50'
          } ${tab === 'stock' ? 'ring-2 ring-orange-300' : ''}`}
        >
          <p className="text-xs font-bold text-gray-500 mb-1">재고 부족 (5개↓)</p>
          <p className={`text-3xl font-black ${criticalStock.length > 0 ? 'text-orange-600' : 'text-gray-600'}`}>
            {stockAlerts.length}
          </p>
          <p className="text-xs text-gray-400 mt-1">재고 0개 {criticalStock.length}건</p>
        </div>

        <div
          onClick={() => setTab('unpaid')}
          className={`cursor-pointer rounded-xl p-4 border-l-4 transition-all border-blue-400 bg-blue-50 hover:bg-blue-100 ${tab === 'unpaid' ? 'ring-2 ring-blue-300' : ''}`}
        >
          <p className="text-xs font-bold text-gray-500 mb-1">미입금 대기</p>
          <p className="text-3xl font-black text-blue-600">{unpaidOrders.length}</p>
          <p className="text-xs text-gray-400 mt-1">{totalUnpaid.toLocaleString()}원</p>
        </div>
      </div>

      {/* ── 탭 콘텐츠 ── */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="flex border-b">
          {[
            { id: 'expiry', label: `🗓️ 유통기한 (${expiryAlerts.length})` },
            { id: 'stock',  label: `📦 재고 부족 (${stockAlerts.length})` },
            { id: 'unpaid', label: `💸 미입금 (${unpaidOrders.length})` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${
                tab === t.id
                  ? 'bg-[#673ab7] text-white'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          {/* 유통기한 탭 */}
          {tab === 'expiry' && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 font-bold">
                <tr>
                  <th className="px-4 py-2 text-left">상품명</th>
                  <th className="px-4 py-2 text-center">유통기한</th>
                  <th className="px-4 py-2 text-center">D-Day</th>
                  <th className="px-4 py-2 text-right">재고</th>
                  <th className="px-4 py-2 text-right">판매가</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {expiryAlerts.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-400">유통기한 임박 상품이 없습니다 ✅</td></tr>
                ) : expiryAlerts.map(p => {
                  const raw = p.expirationDate!;
                  const formatted = `20${raw.substring(0,2)}-${raw.substring(2,4)}-${raw.substring(4,6)}`;
                  return (
                    <tr key={p.id} className={p.daysLeft <= 0 ? 'bg-red-50' : p.daysLeft <= 7 ? 'bg-orange-50/50' : ''}>
                      <td className="px-4 py-3 font-semibold">{p.name}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{formatted}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-black ${getDayColor(p.daysLeft)}`}>
                          {getDayLabel(p.daysLeft)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{p.stock.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{p.price.toLocaleString()}원</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* 재고 부족 탭 */}
          {tab === 'stock' && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 font-bold">
                <tr>
                  <th className="px-4 py-2 text-left">상품명</th>
                  <th className="px-4 py-2 text-center">재고 상태</th>
                  <th className="px-4 py-2 text-right">재고 수량</th>
                  <th className="px-4 py-2 text-right">판매가</th>
                  <th className="px-4 py-2 text-right">매입가</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stockAlerts.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-400">재고 부족 상품이 없습니다 ✅</td></tr>
                ) : stockAlerts.map(p => (
                  <tr key={p.id} className={p.stock === 0 ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3 font-semibold">{p.name}</td>
                    <td className="px-4 py-3 text-center">
                      {p.stock === 0
                        ? <span className="bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full">품절</span>
                        : <span className="bg-orange-400 text-white text-xs font-black px-2 py-0.5 rounded-full">임박</span>
                      }
                    </td>
                    <td className={`px-4 py-3 text-right font-black ${p.stock === 0 ? 'text-red-600' : 'text-orange-600'}`}>
                      {p.stock}개
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{p.price.toLocaleString()}원</td>
                    <td className="px-4 py-3 text-right text-gray-400">{(p.purchasePrice || 0).toLocaleString()}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 미입금 탭 */}
          {tab === 'unpaid' && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 font-bold">
                <tr>
                  <th className="px-4 py-2 text-left">주문자</th>
                  <th className="px-4 py-2 text-left">연락처</th>
                  <th className="px-4 py-2 text-left">주문 상품</th>
                  <th className="px-4 py-2 text-right">금액</th>
                  <th className="px-4 py-2 text-center">주문일</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {unpaidOrders.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-400">미입금 주문이 없습니다 ✅</td></tr>
                ) : unpaidOrders.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-bold">{o.user?.name || '미등록'}</div>
                      <div className="text-xs text-gray-400">{o.user?.nickname || o.userId}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{o.user?.phone || o.userId}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px]">
                      {o.items.map((item, i) => (
                        <div key={i}>{item.productName} × {item.quantity}</div>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-blue-600">
                      {o.totalPrice.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-400">{o.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
