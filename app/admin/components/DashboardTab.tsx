"use client";

import { useMemo, useState } from 'react';
import { useApp, Order } from '../../context/AppContext';

// 날짜 파싱 (한국식 "2026. 5. 27." / ISO 모두 지원)
const parseDateSafe = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  const koMatch = dateStr.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (koMatch) return new Date(+koMatch[1], +koMatch[2] - 1, +koMatch[3], 12);
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
};

const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const isSameDay = (a: Date, b: Date) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
const isSameMonth = (a: Date, b: Date) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth();

// ── KPI 카드 ──
function KpiCard({ label, value, sub, color, icon, trend }: { label: string; value: string; sub?: string; color: string; icon: string; trend?: { val: number; label: string } }) {
  return (
    <div className={`rounded-2xl p-4 sm:p-5 text-white relative overflow-hidden ${color}`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xl sm:text-3xl">{icon}</span>
        {trend && (
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${trend.val >= 0 ? 'bg-white/20' : 'bg-black/20'}`}>
            {trend.val >= 0 ? '▲' : '▼'} {Math.abs(trend.val).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-xs sm:text-sm font-medium opacity-80 mb-1">{label}</p>
      <p className="text-xl sm:text-2xl font-black leading-tight">{value}</p>
      {sub && <p className="text-[11px] opacity-70 mt-1">{sub}</p>}
      {/* 장식 원 */}
      <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-white/10" />
      <div className="absolute -right-2 -bottom-8 w-32 h-32 rounded-full bg-white/5" />
    </div>
  );
}

// ── 미니 바 차트 (CSS) ──
function BarChart({ data, label }: { data: { label: string; paid: number; unpaid: number }[]; label: string }) {
  const maxVal = Math.max(...data.map(d => d.paid + d.unpaid), 1);
  return (
    <div>
      <div className="flex items-end gap-1 sm:gap-1.5 h-32 sm:h-40">
        {data.map((d, i) => {
          const paidPct = (d.paid / maxVal) * 100;
          const unpaidPct = (d.unpaid / maxVal) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col justify-end items-center gap-0.5 group relative">
              {/* 미입금 */}
              <div style={{ height: `${unpaidPct}%` }} className="w-full bg-orange-300/80 rounded-t-sm min-h-0" />
              {/* 입금 */}
              <div style={{ height: `${paidPct}%` }} className="w-full bg-purple-500 rounded-t-sm" />
              {/* 툴팁 */}
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                입금 {d.paid.toLocaleString()}원<br/>미입금 {d.unpaid.toLocaleString()}원
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 sm:gap-1.5 mt-1">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[9px] sm:text-[10px] text-gray-500 truncate">{d.label}</div>
        ))}
      </div>
      <p className="text-center text-xs text-gray-400 mt-2">{label}</p>
    </div>
  );
}

// ── RFM 세그먼트 배지 ──
const RFM_SEGMENTS = [
  { key: 'vip',      label: 'VIP',      color: 'bg-purple-100 text-purple-800 border-purple-200',  dot: 'bg-purple-500' },
  { key: 'loyal',    label: '충성고객', color: 'bg-blue-100 text-blue-800 border-blue-200',        dot: 'bg-blue-500' },
  { key: 'potential',label: '잠재고객', color: 'bg-green-100 text-green-800 border-green-200',     dot: 'bg-green-500' },
  { key: 'atrisk',   label: '이탈위험', color: 'bg-red-100 text-red-800 border-red-200',           dot: 'bg-red-500' },
] as const;
type SegKey = typeof RFM_SEGMENTS[number]['key'];

function rfmScore(orders: Order[], userId: string): { seg: SegKey; r: number; f: number; m: number } {
  const now = Date.now();
  const userOrders = orders.filter(o => o.userId === userId);
  if (userOrders.length === 0) return { seg: 'atrisk', r: 1, f: 1, m: 1 };
  const lastOrder = Math.max(...userOrders.map(o => parseDateSafe(o.createdAt).getTime()));
  const daysSinceLast = (now - lastOrder) / 86400000;
  const freq = userOrders.length;
  const monetary = userOrders.filter(o => o.isPaid).reduce((s, o) => s + o.totalPrice, 0);

  const r = daysSinceLast <= 7 ? 5 : daysSinceLast <= 14 ? 4 : daysSinceLast <= 30 ? 3 : daysSinceLast <= 60 ? 2 : 1;
  const f = freq >= 10 ? 5 : freq >= 7 ? 4 : freq >= 4 ? 3 : freq >= 2 ? 2 : 1;
  const m = monetary >= 300000 ? 5 : monetary >= 150000 ? 4 : monetary >= 80000 ? 3 : monetary >= 30000 ? 2 : 1;
  const total = r + f + m;
  const seg: SegKey = total >= 12 ? 'vip' : total >= 9 ? 'loyal' : total >= 6 ? 'potential' : 'atrisk';
  return { seg, r, f, m };
}

export default function DashboardTab() {
  const { orders, users, products } = useApp();
  const [chartPeriod, setChartPeriod] = useState<7|30|90>(30);
  const [chartMode, setChartMode] = useState<'daily'|'weekly'>('daily');
  const [topMode, setTopMode] = useState<'qty'|'revenue'|'profit'>('revenue');
  const [rfmFilter, setRfmFilter] = useState<SegKey|null>(null);

  const todayDate = useMemo(today, []);

  // ── 오늘/이번달/지난달 통계 ──
  const stats = useMemo(() => {
    const todayOrders   = orders.filter(o => isSameDay(parseDateSafe(o.createdAt), todayDate));
    const monthOrders   = orders.filter(o => isSameMonth(parseDateSafe(o.createdAt), todayDate));
    const lastMonthDate = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1);
    const lastMonders   = orders.filter(o => isSameMonth(parseDateSafe(o.createdAt), lastMonthDate));

    const sum = (os: Order[], paid?: boolean) => os
      .filter(o => paid === undefined || o.isPaid === paid)
      .reduce((s, o) => s + o.totalPrice, 0);

    const todayPaid    = sum(todayOrders, true);
    const todayUnpaid  = sum(todayOrders, false);
    const monthPaid    = sum(monthOrders, true);
    const lastMonPaid  = lastMonders.filter(o => o.isPaid).reduce((s, o) => s + o.totalPrice, 0);
    const monthGrowth  = lastMonPaid > 0 ? ((monthPaid - lastMonPaid) / lastMonPaid) * 100 : 0;
    const avgOrder     = monthOrders.length > 0 ? monthPaid / monthOrders.filter(o => o.isPaid).length : 0;
    const payRate      = monthOrders.length > 0 ? (monthOrders.filter(o => o.isPaid).length / monthOrders.length) * 100 : 0;

    return { todayPaid, todayUnpaid, todayCount: todayOrders.length, monthPaid, lastMonPaid, monthGrowth, avgOrder, payRate, monthOrders };
  }, [orders, todayDate]);

  // ── 차트 데이터 (일별/주별) ──
  const chartData = useMemo(() => {
    const cutoff = new Date(todayDate);
    cutoff.setDate(cutoff.getDate() - chartPeriod + 1);

    const recentOrders = orders.filter(o => {
      const d = parseDateSafe(o.createdAt);
      return d >= cutoff && d <= todayDate;
    });

    if (chartMode === 'daily') {
      const days: { label: string; paid: number; unpaid: number }[] = [];
      for (let i = chartPeriod - 1; i >= 0; i--) {
        const d = new Date(todayDate);
        d.setDate(d.getDate() - i);
        const dayOrders = recentOrders.filter(o => isSameDay(parseDateSafe(o.createdAt), d));
        const label = `${d.getMonth()+1}/${d.getDate()}`;
        const paid   = dayOrders.filter(o => o.isPaid).reduce((s, o) => s + o.totalPrice, 0);
        const unpaid = dayOrders.filter(o => !o.isPaid).reduce((s, o) => s + o.totalPrice, 0);
        days.push({ label, paid, unpaid });
      }
      // 모바일 가독성: 최대 14개만 표시
      const maxBars = Math.min(chartPeriod, 14);
      return days.slice(-maxBars);
    } else {
      // 주별
      const weeks: { label: string; paid: number; unpaid: number }[] = [];
      const weekCount = Math.ceil(chartPeriod / 7);
      for (let w = weekCount - 1; w >= 0; w--) {
        const start = new Date(todayDate);
        start.setDate(start.getDate() - w * 7 - 6);
        const end = new Date(todayDate);
        end.setDate(end.getDate() - w * 7);
        const weekOrders = recentOrders.filter(o => {
          const d = parseDateSafe(o.createdAt);
          return d >= start && d <= end;
        });
        const paid   = weekOrders.filter(o => o.isPaid).reduce((s, o) => s + o.totalPrice, 0);
        const unpaid = weekOrders.filter(o => !o.isPaid).reduce((s, o) => s + o.totalPrice, 0);
        weeks.push({ label: `${start.getMonth()+1}/${start.getDate()}~`, paid, unpaid });
      }
      return weeks;
    }
  }, [orders, chartPeriod, chartMode, todayDate]);

  // ── RFM 분석 ──
  const rfmData = useMemo(() => {
    const uniqueUserIds = [...new Set(orders.map(o => o.userId))];
    const scored = uniqueUserIds.map(uid => {
      const user = users.find(u => u.phone === uid || u.nickname === uid);
      const { seg, r, f, m } = rfmScore(orders, uid);
      const monetary = orders.filter(o => o.userId === uid && o.isPaid).reduce((s, o) => s + o.totalPrice, 0);
      return { uid, user, seg, r, f, m, monetary, orderCount: orders.filter(o => o.userId === uid).length };
    });
    const bySegment: Record<SegKey, typeof scored> = { vip: [], loyal: [], potential: [], atrisk: [] };
    scored.forEach(s => bySegment[s.seg].push(s));
    // 각 세그먼트 내 monetary 내림차순
    (Object.keys(bySegment) as SegKey[]).forEach(k => bySegment[k].sort((a,b) => b.monetary - a.monetary));
    return bySegment;
  }, [orders, users]);

  // ── 상품 성과 Top 10 ──
  const productStats = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number; profit: number }> = {};
    orders.forEach(o => {
      o.items.forEach(item => {
        if (!map[item.productName]) map[item.productName] = { name: item.productName, qty: 0, revenue: 0, profit: 0 };
        map[item.productName].qty += item.quantity;
        if (o.isPaid) {
          map[item.productName].revenue += item.price * item.quantity;
          const product = products.find(p => p.name === item.productName);
          const cost = (product?.purchasePrice || 0) * item.quantity;
          map[item.productName].profit += item.price * item.quantity - cost;
        }
      });
    });
    return Object.values(map).sort((a, b) => {
      if (topMode === 'qty') return b.qty - a.qty;
      if (topMode === 'revenue') return b.revenue - a.revenue;
      return b.profit - a.profit;
    }).slice(0, 10);
  }, [orders, products, topMode]);

  // ── 미수금 상위 고객 ──
  const unpaidTop = useMemo(() => {
    const map: Record<string, number> = {};
    orders.filter(o => !o.isPaid).forEach(o => {
      map[o.userId] = (map[o.userId] || 0) + o.totalPrice;
    });
    return Object.entries(map)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 8)
      .map(([uid, amount]) => {
        const user = users.find(u => u.phone === uid || u.nickname === uid);
        return { uid, name: user?.name || uid, nickname: user?.nickname || uid, amount };
      });
  }, [orders, users]);

  const rfmFiltered = rfmFilter ? rfmData[rfmFilter] : null;
  const currentSeg = RFM_SEGMENTS.find(s => s.key === rfmFilter);

  return (
    <div className="space-y-6">

      {/* ───── 섹션 1: KPI 카드 ───── */}
      <div>
        <h2 className="text-base font-black text-gray-800 mb-3 flex items-center gap-2">
          <span>📊</span> 핵심 지표
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="오늘 입금 매출"
            value={`${(stats.todayPaid / 10000).toFixed(1)}만원`}
            sub={`미입금 ${(stats.todayUnpaid/10000).toFixed(1)}만원`}
            color="bg-gradient-to-br from-purple-600 to-violet-700"
            icon="💰"
          />
          <KpiCard
            label="이번 달 매출"
            value={`${(stats.monthPaid / 10000).toFixed(1)}만원`}
            sub={`주문 ${stats.monthOrders.length}건`}
            color="bg-gradient-to-br from-indigo-500 to-blue-600"
            icon="📈"
            trend={{ val: stats.monthGrowth, label: '전월 대비' }}
          />
          <KpiCard
            label="평균 주문금액"
            value={`${Math.round(stats.avgOrder).toLocaleString()}원`}
            sub="이번달 입금 기준"
            color="bg-gradient-to-br from-emerald-500 to-teal-600"
            icon="🛒"
          />
          <KpiCard
            label="이번달 입금률"
            value={`${stats.payRate.toFixed(1)}%`}
            sub={`총 ${stats.monthOrders.length}건 중`}
            color={`bg-gradient-to-br ${stats.payRate >= 80 ? 'from-green-500 to-emerald-600' : stats.payRate >= 60 ? 'from-yellow-500 to-orange-500' : 'from-red-500 to-rose-600'}`}
            icon="✅"
          />
        </div>
      </div>

      {/* ───── 섹션 2: 매출 추이 차트 ───── */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-base font-black text-gray-800 flex items-center gap-2">
            <span>📉</span> 매출 추이
          </h2>
          <div className="flex flex-wrap gap-2">
            <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
              {([7, 30, 90] as const).map(p => (
                <button key={p} onClick={() => setChartPeriod(p)}
                  className={`px-2.5 py-1 rounded-md font-bold transition-colors ${chartPeriod === p ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'}`}>
                  {p}일
                </button>
              ))}
            </div>
            <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
              {(['daily', 'weekly'] as const).map(m => (
                <button key={m} onClick={() => setChartMode(m)}
                  className={`px-2.5 py-1 rounded-md font-bold transition-colors ${chartMode === m ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'}`}>
                  {m === 'daily' ? '일별' : '주별'}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* 범례 */}
        <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-purple-500 inline-block" />입금완료</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-300 inline-block" />미입금</span>
        </div>
        <BarChart data={chartData} label={`최근 ${chartPeriod}일 ${chartMode === 'daily' ? '일별' : '주별'} 매출 현황`} />
      </div>

      {/* ───── 섹션 3: RFM 고객 분석 ───── */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100">
        <h2 className="text-base font-black text-gray-800 mb-1 flex items-center gap-2">
          <span>👥</span> RFM 고객 분석
        </h2>
        <p className="text-xs text-gray-400 mb-4">최근구매(R) · 구매빈도(F) · 구매금액(M) 기반 자동 세그먼트</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {RFM_SEGMENTS.map(seg => {
            const count = rfmData[seg.key].length;
            const totalAmount = rfmData[seg.key].reduce((s, u) => s + u.monetary, 0);
            const isActive = rfmFilter === seg.key;
            return (
              <button key={seg.key}
                onClick={() => setRfmFilter(isActive ? null : seg.key)}
                className={`p-3 sm:p-4 rounded-xl border-2 text-left transition-all ${isActive ? 'border-purple-500 bg-purple-50 shadow-md' : `border-gray-200 hover:border-gray-300 ${seg.color}`}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${seg.dot}`} />
                  <span className="font-black text-sm">{seg.label}</span>
                </div>
                <p className="text-2xl font-black">{count}<span className="text-sm font-normal">명</span></p>
                <p className="text-xs opacity-70 mt-0.5">{(totalAmount/10000).toFixed(1)}만원</p>
              </button>
            );
          })}
        </div>
        {/* 선택된 세그먼트 상세 */}
        {rfmFiltered && currentSeg && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-700">{currentSeg.label} 고객 목록</span>
              <button onClick={() => setRfmFilter(null)} className="text-xs text-gray-400 hover:text-gray-600">✕ 닫기</button>
            </div>
            <div className="divide-y max-h-64 overflow-y-auto">
              {rfmFiltered.slice(0, 20).map((u, i) => (
                <div key={u.uid} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-gray-400 w-5 shrink-0">{i+1}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-800 truncate">{u.user?.name || u.uid}</p>
                      <p className="text-xs text-gray-400 truncate">{u.user?.nickname} · {u.orderCount}회 구매</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-bold text-purple-700">{(u.monetary/10000).toFixed(1)}만원</p>
                    <p className="text-[10px] text-gray-400">R{u.r} F{u.f} M{u.m}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ───── 섹션 4: 상품 성과 ───── */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-base font-black text-gray-800 flex items-center gap-2">
            <span>🏆</span> 상품 성과 Top 10
          </h2>
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
            {([['revenue','매출'], ['qty','판매수량'], ['profit','순이익']] as const).map(([m, l]) => (
              <button key={m} onClick={() => setTopMode(m)}
                className={`px-2.5 py-1 rounded-md font-bold transition-colors ${topMode === m ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {productStats.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">주문 데이터가 없습니다</p>
          ) : productStats.map((p, i) => {
            const val = topMode === 'qty' ? p.qty : topMode === 'revenue' ? p.revenue : p.profit;
            const max = productStats[0] ? (topMode === 'qty' ? productStats[0].qty : topMode === 'revenue' ? productStats[0].revenue : productStats[0].profit) : 1;
            const pct = max > 0 ? (val / max) * 100 : 0;
            const displayVal = topMode === 'qty' ? `${p.qty}개` : `${(val/10000).toFixed(1)}만원`;
            return (
              <div key={p.name} className="flex items-center gap-3 group">
                <span className={`text-xs font-black w-5 text-center shrink-0 ${i < 3 ? 'text-purple-600' : 'text-gray-400'}`}>{i+1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="text-xs sm:text-sm font-semibold text-gray-700 truncate">{p.name}</span>
                    <span className="text-xs font-bold text-purple-700 shrink-0">{displayVal}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-500 to-violet-400 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ───── 섹션 5: 운영 현황 ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* 입금률 게이지 */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100">
          <h2 className="text-base font-black text-gray-800 mb-4 flex items-center gap-2">
            <span>💳</span> 이번달 입금률
          </h2>
          <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-700 ${stats.payRate >= 80 ? 'bg-gradient-to-r from-green-400 to-emerald-500' : stats.payRate >= 60 ? 'bg-gradient-to-r from-yellow-400 to-orange-400' : 'bg-gradient-to-r from-red-400 to-rose-500'}`}
              style={{ width: `${Math.min(stats.payRate, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mb-4">
            <span>0%</span>
            <span className="font-black text-base text-gray-800">{stats.payRate.toFixed(1)}%</span>
            <span>100%</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">입금 완료</p>
              <p className="font-black text-green-700">{stats.monthOrders.filter(o => o.isPaid).length}건</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">미입금</p>
              <p className="font-black text-orange-600">{stats.monthOrders.filter(o => !o.isPaid).length}건</p>
            </div>
          </div>
        </div>

        {/* 미수금 상위 고객 */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100">
          <h2 className="text-base font-black text-gray-800 mb-4 flex items-center gap-2">
            <span>⚠️</span> 미수금 상위 고객
          </h2>
          {unpaidTop.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-3xl mb-2">🎉</p>
              <p className="text-sm font-semibold">미수금이 없습니다!</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {unpaidTop.map((u, i) => (
                <div key={u.uid} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-black text-red-400 w-4 shrink-0">{i+1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{u.name}</p>
                      <p className="text-xs text-gray-400 truncate">{u.nickname}</p>
                    </div>
                  </div>
                  <span className="text-sm font-black text-red-600 shrink-0 ml-2">{u.amount.toLocaleString()}원</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ───── 섹션 6: 재고 소진 예상 ───── */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100">
        <h2 className="text-base font-black text-gray-800 mb-4 flex items-center gap-2">
          <span>📦</span> 재고 소진 예상일 (판매 속도 기준)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm min-w-[400px]">
            <thead>
              <tr className="border-b text-gray-500 text-left">
                <th className="py-2 pr-3 font-semibold">상품명</th>
                <th className="py-2 pr-3 font-semibold text-right">잔여재고</th>
                <th className="py-2 pr-3 font-semibold text-right">일평균판매</th>
                <th className="py-2 font-semibold text-right">소진예상</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {products.filter(p => p.isActive && p.stock > 0).map(product => {
                // 최근 30일 판매량으로 일평균 계산
                const cutoff = new Date(todayDate);
                cutoff.setDate(cutoff.getDate() - 30);
                const recentSales = orders.filter(o => parseDateSafe(o.createdAt) >= cutoff)
                  .flatMap(o => o.items.filter(i => i.productName === product.name))
                  .reduce((s, i) => s + i.quantity, 0);
                const dailyAvg = recentSales / 30;
                const daysLeft = dailyAvg > 0 ? Math.round(product.stock / dailyAvg) : null;
                const isUrgent = daysLeft !== null && daysLeft <= 14;
                return (
                  <tr key={product.id} className={isUrgent ? 'bg-red-50' : ''}>
                    <td className="py-2.5 pr-3 font-medium text-gray-800 truncate max-w-[150px]">{product.name}</td>
                    <td className={`py-2.5 pr-3 text-right font-bold ${product.stock < 5 ? 'text-red-500' : 'text-gray-700'}`}>{product.stock}개</td>
                    <td className="py-2.5 pr-3 text-right text-gray-500">{dailyAvg > 0 ? `${dailyAvg.toFixed(1)}개` : '-'}</td>
                    <td className="py-2.5 text-right">
                      {daysLeft === null ? (
                        <span className="text-gray-400">판매 없음</span>
                      ) : (
                        <span className={`font-bold ${isUrgent ? 'text-red-600' : 'text-gray-700'}`}>
                          {daysLeft}일 후{isUrgent ? ' ⚠️' : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {products.filter(p => p.isActive && p.stock > 0).length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-gray-400">활성 재고가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
