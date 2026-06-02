"use client";

import { useState, useMemo, useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { useApp, Order, OrderItem } from '../../context/AppContext';
import InvoiceTemplate, { InvoiceData, InvoiceDateGroup } from '../../components/InvoiceTemplate';

// ─────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────

const parseKoreanDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (match) return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  return null;
};

const toIsoDate = (date: Date): string => date.toISOString().split('T')[0];
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

const formatDisplayDate = (dateStr: string): string => {
  const d = parseKoreanDate(dateStr);
  if (!d) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]})`;
};

const safeId = (str: string) => str.replace(/[^a-zA-Z0-9가-힣]/g, '_');

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

interface DateGroup {
  dateStr: string;          // 원본 날짜 문자열 (createdAt)
  displayDate: string;      // "6/3(목)" 형태
  orders: Order[];          // 해당 날짜의 모든 주문
  allItems: { productName: string; price: number; quantity: number; purchasePrice?: number; isConsignment?: boolean; vendorName?: string }[];
  subtotal: number;
  isPaid: boolean;          // 해당 날짜 모든 주문이 입금 완료인지
}

interface CustomerGroup {
  userId: string;
  orders: Order[];
  dateGroups: DateGroup[];
  totalPrice: number;
  allPaid: boolean;
  anyPaid: boolean;
}

// ─────────────────────────────────────────
// Component
// ─────────────────────────────────────────

export default function OrderManagementTab() {
  const {
    products, orders, users,
    markOrderPaid, updateOrder, deleteOrder,
    markOrdersAsExported, addBulkShippingFee,
    updateOrderShippingAddress, archiveOrdersByIds, refreshOrders,
  } = useApp();

  // ── Filter State ──
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterUnpaid, setFilterUnpaid] = useState(false);
  const [filterOnlyPreparing, setFilterOnlyPreparing] = useState(false);
  const [filterOnlyNotExported, setFilterOnlyNotExported] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [downloadFilter, setDownloadFilter] = useState<'all' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ── UI State ──
  const [isDownloading, setIsDownloading] = useState(false);
  const [sendingAlimtalk, setSendingAlimtalk] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editItems, setEditItems] = useState<OrderItem[]>([]);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set()); // key: userId+dateStr

  // ── Bulk Alimtalk State ──
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkCustomerTargets, setBulkCustomerTargets] = useState<{ userId: string; orders: Order[]; totalPrice: number }[]>([]);
  const [bulkSelection, setBulkSelection] = useState<Record<string, boolean>>({});
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; successes: number; fails: number } | null>(null);
  const [isBulkSending, setIsBulkSending] = useState(false);

  // ── Shipping Fee Modal State ──
  const [shippingModalUserId, setShippingModalUserId] = useState<string | null>(null);

  // ─────────────────────────────────────────
  // Quick Date Presets
  // ─────────────────────────────────────────
  const setQuickDate = (preset: 'today' | 'last3' | 'thisWeek' | 'all') => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (preset === 'today') {
      setDateFrom(toIsoDate(today)); setDateTo(toIsoDate(today));
    } else if (preset === 'last3') {
      const from = new Date(today); from.setDate(from.getDate() - 2);
      setDateFrom(toIsoDate(from)); setDateTo(toIsoDate(today));
    } else if (preset === 'thisWeek') {
      const from = new Date(today); from.setDate(from.getDate() + (from.getDay() === 0 ? -6 : 1 - from.getDay()));
      setDateFrom(toIsoDate(from)); setDateTo(toIsoDate(today));
    } else {
      setDateFrom(''); setDateTo('');
    }
  };

  // ─────────────────────────────────────────
  // Filter & Sort
  // ─────────────────────────────────────────
  const activeOrders = showArchived ? orders : orders.filter(o => !o.isArchived);

  const filteredOrders = useMemo(() => {
    let result = [...activeOrders];
    if (dateFrom || dateTo) {
      result = result.filter(o => {
        const d = parseKoreanDate(o.createdAt || '');
        if (!d) return true;
        if (dateFrom && d < new Date(dateFrom)) return false;
        if (dateTo) { const to = new Date(dateTo); to.setDate(to.getDate() + 1); if (d >= to) return false; }
        return true;
      });
    }
    if (filterUnpaid) result = result.filter(o => !o.isPaid);
    if (searchQuery) {
      result = result.filter(o => {
        const user = users.find(u => u.phone === o.userId || u.nickname === o.userId);
        const term = searchQuery.toLowerCase();
        return user?.name?.toLowerCase().includes(term) || user?.nickname?.toLowerCase().includes(term) || user?.phone?.includes(term);
      });
    }
    return result.sort((a, b) => b.id.localeCompare(a.id));
  }, [activeOrders, dateFrom, dateTo, filterUnpaid, searchQuery, users]);

  // ─────────────────────────────────────────
  // Customer Groups (with date-level sub-groups)
  // ─────────────────────────────────────────
  const customerGroups = useMemo((): CustomerGroup[] => {
    const map = new Map<string, Order[]>();
    for (const order of filteredOrders) {
      const existing = map.get(order.userId) || [];
      map.set(order.userId, [...existing, order]);
    }

    const groups: CustomerGroup[] = [];
    map.forEach((customerOrders, userId) => {
      // 날짜별 그룹화
      const dateMap = new Map<string, Order[]>();
      for (const order of customerOrders) {
        const dateKey = parseKoreanDate(order.createdAt || '')?.toDateString() || order.createdAt;
        const existing = dateMap.get(dateKey) || [];
        dateMap.set(dateKey, [...existing, order]);
      }

      // 날짜 오름차순 정렬
      const sortedDateKeys = [...dateMap.keys()].sort((a, b) => {
        const da = new Date(a).getTime();
        const db = new Date(b).getTime();
        return da - db;
      });

      const dateGroups: DateGroup[] = sortedDateKeys.map(dateKey => {
        const dayOrders = dateMap.get(dateKey)!;
        // 모든 items 합산 (같은 상품명은 합치기)
        const itemMap = new Map<string, { price: number; quantity: number; purchasePrice?: number; isConsignment?: boolean; vendorName?: string }>();
        for (const order of dayOrders) {
          for (const item of order.items) {
            const existing = itemMap.get(item.productName);
            if (existing) {
              existing.quantity += item.quantity;
            } else {
              itemMap.set(item.productName, {
                price: item.price,
                quantity: item.quantity,
                purchasePrice: item.purchasePrice,
                isConsignment: item.isConsignment,
                vendorName: item.vendorName,
              });
            }
          }
        }
        const allItems = [...itemMap.entries()].map(([productName, v]) => ({ productName, ...v }));
        const subtotal = dayOrders.reduce((s, o) => s + o.totalPrice, 0);
        const isPaid = dayOrders.every(o => o.isPaid);
        const displayDate = formatDisplayDate(dayOrders[0].createdAt || '');
        return { dateStr: dateKey, displayDate, orders: dayOrders, allItems, subtotal, isPaid };
      });

      const totalPrice = customerOrders.reduce((s, o) => s + o.totalPrice, 0);
      const allPaid = customerOrders.every(o => o.isPaid);
      const anyPaid = customerOrders.some(o => o.isPaid);
      groups.push({ userId, orders: customerOrders, dateGroups, totalPrice, allPaid, anyPaid });
    });
    return groups;
  }, [filteredOrders]);

  // ─────────────────────────────────────────
  // Statistics
  // ─────────────────────────────────────────
  const totalOrders = filteredOrders.length;
  const totalRevenue = filteredOrders.reduce((s, o) => {
    const shipFee = o.items.filter(i => i.productName === '일괄 택배비').reduce((a, i) => a + i.price * i.quantity, 0);
    return s + o.totalPrice - shipFee;
  }, 0);
  const paidOrders = filteredOrders.filter(o => o.isPaid);
  const paidTotal = paidOrders.reduce((s, o) => {
    const shipFee = o.items.filter(i => i.productName === '일괄 택배비').reduce((a, i) => a + i.price * i.quantity, 0);
    return s + o.totalPrice - shipFee;
  }, 0);
  const unpaidCount = filteredOrders.filter(o => !o.isPaid).length;
  const unpaidTotal = filteredOrders.filter(o => !o.isPaid).reduce((s, o) => {
    const shipFee = o.items.filter(i => i.productName === '일괄 택배비').reduce((a, i) => a + i.price * i.quantity, 0);
    return s + o.totalPrice - shipFee;
  }, 0);
  const paidRate = totalRevenue > 0 ? ((paidTotal / totalRevenue) * 100).toFixed(1) : '0.0';

  let totalCost = 0;
  filteredOrders.forEach(order => {
    order.items.forEach(item => {
      let cost = item.purchasePrice;
      if (!cost) { const p = products.find(p => p.name === item.productName); cost = p?.purchasePrice || 0; }
      totalCost += cost * item.quantity;
    });
  });
  const totalProfit = totalRevenue - totalCost;
  const periodStr = dateFrom && dateTo ? `${dateFrom}~${dateTo}` : dateFrom || dateTo || new Date().toISOString().slice(0, 10);

  // ─────────────────────────────────────────
  // Date Expand/Collapse Toggle
  // ─────────────────────────────────────────
  const toggleDateExpand = useCallback((userId: string, dateKey: string) => {
    const key = `${userId}__${dateKey}`;
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const isDateExpanded = (userId: string, dateKey: string) => expandedDates.has(`${userId}__${dateKey}`);

  // ─────────────────────────────────────────
  // Merged Invoice Builder
  // ─────────────────────────────────────────
  const buildMergedInvoiceData = (group: CustomerGroup): InvoiceData => {
    const user = users.find(u => u.phone === group.userId || u.nickname === group.userId);
    const dateGroupsForInvoice: InvoiceDateGroup[] = group.dateGroups.map(dg => ({
      date: dg.displayDate,
      items: dg.allItems.map(i => ({ name: i.productName, quantity: i.quantity, price: i.price })),
      subtotal: dg.subtotal,
    }));
    const periodLabel = group.dateGroups.length === 1
      ? group.dateGroups[0].displayDate
      : `${group.dateGroups[0].displayDate} ~ ${group.dateGroups[group.dateGroups.length - 1].displayDate}`;
    return {
      customerName: user?.name || '미등록',
      customerPhone: user?.phone,
      customerNickname: user?.nickname,
      address: group.orders[0]?.shippingAddress || user?.address || '',
      date: periodLabel,
      items: [],
      totalPrice: group.totalPrice,
      bankName: '새마을금고', accountNumber: '010-6269-9612', accountHolder: '보라몰',
      isPaid: group.allPaid,
      dateGroups: dateGroupsForInvoice,
    };
  };

  const buildMergedInvoiceUrl = (userId: string) => {
    const params = new URLSearchParams({ userId });
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    return `boramall.vercel.app/invoice/merged?${params.toString()}`;
  };

  // ─────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────

  /** 초기화: 현재 조회된 주문 전부 아카이브 */
  const handleReset = async () => {
    if (filteredOrders.length === 0) { alert('초기화할 주문이 없습니다.'); return; }
    if (!confirm(`현재 조회된 ${filteredOrders.length}건을 모두 아카이브하시겠습니까?\n아카이브된 주문은 "보관함 포함" 버튼으로 언제든지 확인할 수 있습니다.`)) return;
    await archiveOrdersByIds(filteredOrders.map(o => o.id));
    await refreshOrders();
    alert(`${filteredOrders.length}건이 아카이브되었습니다.`);
  };

  /** 고객 1명에게 택배비 설정 */
  const handleSetShippingFee = (group: CustomerGroup, type: 'delivery' | 'pickup') => {
    setShippingModalUserId(null);
    const unpaidOrders = group.orders.filter(o => !o.isPaid);
    if (type === 'pickup') {
      // 직접수령: 택배비 없음 — 기존 택배비 항목만 제거
      const hasShipping = group.orders.some(o => o.items.some(i => i.productName === '일괄 택배비'));
      if (!hasShipping) { alert('청구된 택배비가 없습니다.'); return; }
      // 각 주문에서 택배비 아이템 제거
      for (const order of group.orders) {
        const newItems = order.items.filter(i => i.productName !== '일괄 택배비');
        if (newItems.length !== order.items.length) {
          updateOrder(order.id, newItems);
        }
      }
      alert('택배비가 제거되었습니다. (직접 수령)');
      return;
    }

    // 택배 배송: 4,000원 1회만 — 이미 청구된 경우 건너뜀
    const alreadyHasShipping = group.orders.some(o => o.items.some(i => i.productName === '일괄 택배비'));
    if (alreadyHasShipping) {
      alert('이미 택배비가 청구되어 있습니다.');
      return;
    }
    // 가장 오래된 미입금 주문에 추가 (없으면 전체 첫 번째 주문에 추가)
    const targetOrder = unpaidOrders.length > 0
      ? [...unpaidOrders].sort((a, b) => a.id.localeCompare(b.id))[0]
      : [...group.orders].sort((a, b) => a.id.localeCompare(b.id))[0];
    addBulkShippingFee([targetOrder.id]);
    alert(`택배비 4,000원이 추가되었습니다.\n(${formatDisplayDate(targetOrder.createdAt || '')} 주문에 포함)`);
  };

  /** 고객 전체 입금 처리 */
  const handleMarkAllPaid = (orders: Order[], isPaid: boolean) => {
    orders.filter(o => o.isPaid !== isPaid).forEach(o => markOrderPaid(o.id, isPaid));
  };

  /** 날짜별 전체 입금 처리 */
  const handleMarkDatePaid = (dayOrders: Order[], isPaid: boolean) => {
    dayOrders.filter(o => o.isPaid !== isPaid).forEach(o => markOrderPaid(o.id, isPaid));
  };

  /** 고객 합산 알림톡 */
  const handleSendMergedAlimtalk = async (group: CustomerGroup) => {
    const user = users.find(u => u.phone === group.userId || u.nickname === group.userId);
    const phone = user?.phone || '';
    if (!phone) { alert('고객 전화번호가 없습니다.'); return; }
    if (!confirm(`${user?.name} 님에게 기간 합산 알림톡을 발송하시겠습니까?\n총 ${group.orders.length}건 / 합계 ${group.totalPrice.toLocaleString()}원`)) return;
    setSendingAlimtalk(group.userId);
    try {
      const res = await fetch('/api/alimtalk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: group.orders[0].id, name: user?.name || '고객', phone, totalPrice: group.totalPrice, invoiceUrl: buildMergedInvoiceUrl(group.userId) }),
      });
      const data = await res.json();
      alert(data.success ? '합산 알림톡 발송 성공!' : '알림톡 발송 실패: ' + data.error);
    } catch { alert('알림톡 발송 중 오류가 발생했습니다.'); }
    finally { setSendingAlimtalk(null); }
  };

  /** 합산 청구서 ZIP 다운로드 */
  const handleBulkDownload = async () => {
    const groupsToDownload = downloadFilter === 'paid'
      ? customerGroups.filter(g => g.orders.some(o => o.isPaid))
      : customerGroups;
    if (groupsToDownload.length === 0) { alert('다운로드할 주문이 없습니다.'); return; }
    setIsDownloading(true);
    const zip = new JSZip();
    const { toPng } = await import('html-to-image');
    try {
      const folder = zip.folder('Invoices');
      await new Promise(r => setTimeout(r, 600));
      const originalScrollY = window.scrollY;
      window.scrollTo(0, 0);
      let count = 0;
      for (const group of groupsToDownload) {
        const user = users.find(u => u.phone === group.userId || u.nickname === group.userId);
        const el = document.getElementById(`invoice-render-customer-${safeId(group.userId)}`);
        if (el) {
          await toPng(el, { cacheBust: true });
          await new Promise(r => setTimeout(r, 50));
          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:672px';
          document.body.appendChild(wrapper);
          const clone = el.cloneNode(true) as HTMLElement;
          wrapper.appendChild(clone);
          const dataUrl = await toPng(clone, { cacheBust: true, pixelRatio: 2, backgroundColor: '#ffffff', width: 672, height: el.scrollHeight });
          document.body.removeChild(wrapper);
          const filename = `${user?.name || group.userId}_${user?.nickname || group.userId}_${periodStr}_합산청구서.png`;
          folder?.file(filename, dataUrl.split(',')[1], { base64: true });
          count++;
        }
      }
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `BoraMall_합산청구서_${periodStr}.zip`);
      window.scrollTo(0, originalScrollY);
      alert(`${count}명의 합산 청구서를 다운로드했습니다.`);
    } catch (e) { console.error(e); alert('다운로드 중 오류가 발생했습니다.'); }
    finally { setIsDownloading(false); }
  };

  /** 롯데택배 엑셀 다운로드 */
  const handleLotteExcelDownload = () => {
    const ordersToExport = filteredOrders
      .filter(o => o.isPaid)
      .filter(o => filterOnlyPreparing ? (!o.deliveryStatus || o.deliveryStatus === '배송준비중') : true)
      .filter(order => order.items.some(item => !item.isConsignment))
      .filter(o => filterOnlyNotExported ? !o.isExportedToExcel : true);
    if (ordersToExport.length === 0) { alert('다운로드할 택배 배송건이 없습니다.'); return; }
    if (!confirm(`총 ${ordersToExport.length}건의 배송 엑셀을 다운로드합니다.\n진행하시겠습니까?`)) return;
    const headers = ['주문번호', '보내는사람(지정)', '전화번호1(지정)', '전화번호2(지정)', '우편번호(지정)', '주소(지정)',
      '받는사람', '전화번호1', '전화번호2', '우편번호', '주소', '상품명1', '상품상세1', '수량(A타입)', '배송메시지', '운임구분', '운임', '운송장번호'];
    let orderNum = 1;
    const csvRows = ordersToExport.map(order => {
      const user = users.find(u => u.phone === order.userId || u.nickname === order.userId);
      const normalItems = order.items.filter(i => !i.isConsignment);
      let productName = normalItems[0]?.productName || '';
      if (normalItems.length > 1) productName += ` 외 ${normalItems.length - 1}건`;
      const cleanAddress = (order.shippingAddress || user?.address || '').replace(/^\[.*?\]\s*/, '').trim();
      return [orderNum++, '보라몰', '', '', '', '', user?.name || '', user?.phone || '', '', '', cleanAddress, productName, '', 1, '', '', '', ''];
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...csvRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '롯데택배_발송목록');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `롯데택배_발송목록_${periodStr}.xlsx`);
    markOrdersAsExported(ordersToExport.map(o => o.id));
  };

  /** 일괄 알림톡 모달 */
  const openBulkModal = () => {
    const baseOrders = downloadFilter === 'paid' ? filteredOrders.filter(o => o.isPaid) : filteredOrders;
    if (baseOrders.length === 0) { alert('발송 대상이 없습니다.'); return; }
    const map = new Map<string, Order[]>();
    for (const order of baseOrders) { map.set(order.userId, [...(map.get(order.userId) || []), order]); }
    const targets: { userId: string; orders: Order[]; totalPrice: number }[] = [];
    map.forEach((orders, userId) => targets.push({ userId, orders, totalPrice: orders.reduce((s, o) => s + o.totalPrice, 0) }));
    setBulkCustomerTargets(targets);
    const sel: Record<string, boolean> = {};
    targets.forEach(t => { sel[t.userId] = true; });
    setBulkSelection(sel);
    setIsBulkModalOpen(true);
    setBulkProgress(null);
  };

  const handleBulkSend = async () => {
    const selected = bulkCustomerTargets.filter(t => bulkSelection[t.userId]);
    if (selected.length === 0) { alert('발송할 대상을 선택해 주세요.'); return; }
    if (!confirm(`총 ${selected.length}명에게 합산 알림톡을 일괄 발송하시겠습니까?`)) return;
    setIsBulkSending(true);
    setBulkProgress({ current: 0, total: selected.length, successes: 0, fails: 0 });
    let successCount = 0, failCount = 0;
    for (let i = 0; i < selected.length; i++) {
      const { userId, orders: customerOrders, totalPrice } = selected[i];
      const user = users.find(u => u.phone === userId || u.nickname === userId);
      const phone = user?.phone || '';
      if (!phone) { failCount++; } else {
        try {
          const res = await fetch('/api/alimtalk', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: customerOrders[0].id, name: user?.name || '고객', phone, totalPrice, invoiceUrl: buildMergedInvoiceUrl(userId) }),
          });
          const data = await res.json();
          if (data.success) successCount++; else failCount++;
        } catch { failCount++; }
      }
      setBulkProgress({ current: i + 1, total: selected.length, successes: successCount, fails: failCount });
      await new Promise(r => setTimeout(r, 300));
    }
    setIsBulkSending(false);
    alert(`발송 완료!\n성공: ${successCount}명 | 실패: ${failCount}명`);
  };

  const openEditModal = (order: Order) => { setEditingOrder(order); setEditItems(order.items.map(i => ({ ...i }))); };
  const handleSaveEdit = () => {
    if (editingOrder) { updateOrder(editingOrder.id, editItems); setEditingOrder(null); setEditItems([]); }
  };
  const updateItemQty = (index: number, change: number) => {
    const newItems = [...editItems]; const item = newItems[index]; const newQty = item.quantity + change;
    if (newQty <= 0) { if (confirm(`${item.productName}을(를) 삭제하시겠습니까?`)) newItems.splice(index, 1); }
    else { item.quantity = newQty; }
    setEditItems(newItems);
  };

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* ── 통계 카드 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-lg shadow-sm border-l-4 border-[#673ab7]">
          <p className="text-gray-500 text-xs mb-1">조회 매출 ({totalOrders}건 / {customerGroups.length}명)</p>
          <p className="text-lg font-bold text-[#673ab7]">{totalRevenue.toLocaleString()}원</p>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border-l-4 border-blue-400">
          <p className="text-gray-500 text-xs mb-1">예상 순이익</p>
          <p className="text-lg font-bold text-blue-600">{totalProfit.toLocaleString()}원</p>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border-l-4 border-green-400 relative">
          <p className="text-gray-500 text-xs mb-1">입금액 ({paidOrders.length}건)</p>
          <p className="text-lg font-bold text-green-600">{paidTotal.toLocaleString()}원</p>
          <span className="absolute top-2 right-2 text-xs font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">{paidRate}%</span>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border-l-4 border-yellow-400">
          <p className="text-gray-500 text-xs mb-1">미입금 ({unpaidCount}건)</p>
          <p className="text-lg font-bold text-yellow-600">{unpaidTotal.toLocaleString()}원</p>
        </div>
      </div>

      {/* ── 날짜 필터 ── */}
      <div className="bg-white p-3 rounded-lg shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-gray-700 whitespace-nowrap">📅 조회 기간</span>
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#673ab7] outline-none" />
            <span className="text-gray-400 font-bold">~</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#673ab7] outline-none" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[{ key: 'today', label: '오늘' }, { key: 'last3', label: '최근 3일' }, { key: 'thisWeek', label: '이번 주' }, { key: 'all', label: '전체' }].map(({ key, label }) => (
              <button key={key} onClick={() => setQuickDate(key as 'today' | 'last3' | 'thisWeek' | 'all')}
                className="text-xs px-3 py-1.5 rounded-full border border-[#673ab7] text-[#673ab7] hover:bg-[#673ab7] hover:text-white transition-colors font-medium">
                {label}
              </button>
            ))}
          </div>
          {(dateFrom || dateTo) && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-bold">
              {filteredOrders.length}건 / {customerGroups.length}명
            </span>
          )}
        </div>
      </div>

      {/* ── 필터 & 액션 ── */}
      <div className="flex flex-col xl:flex-row justify-between xl:items-center bg-white p-3 rounded-lg shadow-sm gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={filterUnpaid} onChange={e => setFilterUnpaid(e.target.checked)} className="w-4 h-4 accent-[#673ab7]" />
            <span className="text-sm font-bold text-gray-700 whitespace-nowrap">미입금만</span>
          </label>
          <div className="w-px h-4 bg-gray-300" />
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="w-4 h-4 accent-gray-500" />
            <span className="text-sm font-bold text-gray-700 whitespace-nowrap">📦 보관함 포함</span>
          </label>
          <div className="w-px h-4 bg-gray-300" />
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={filterOnlyPreparing} onChange={e => setFilterOnlyPreparing(e.target.checked)} className="w-4 h-4 accent-blue-500" />
            <span className="text-sm font-bold text-gray-700 whitespace-nowrap">🚚 배송준비중만</span>
          </label>
          <div className="w-px h-4 bg-gray-300" />
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={filterOnlyNotExported} onChange={e => setFilterOnlyNotExported(e.target.checked)} className="w-4 h-4 accent-red-500" />
            <span className="text-sm font-bold text-gray-700 whitespace-nowrap">🌟 미추출건만</span>
          </label>
          <div className="w-px h-4 bg-gray-300" />
          <select value={downloadFilter} onChange={e => setDownloadFilter(e.target.value as 'all' | 'paid')}
            className="border border-gray-300 rounded px-2 py-1 text-xs font-bold text-gray-700 bg-gray-50 focus:ring-1 focus:ring-[#673ab7] outline-none">
            <option value="all">다운로드: 전체</option>
            <option value="paid">다운로드: ✅ 입금완료만</option>
          </select>
          <input type="text" placeholder="🔍 이름·닉네임 검색" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm w-36 focus:ring-1 focus:ring-[#673ab7] outline-none" />
        </div>

        <div className="flex flex-wrap gap-2 justify-start xl:justify-end">
          <button onClick={handleReset} disabled={filteredOrders.length === 0}
            className="bg-gray-700 text-white px-3 py-2 rounded font-bold hover:bg-gray-900 disabled:bg-gray-300 text-sm whitespace-nowrap">
            🔄 초기화
          </button>
          <button onClick={handleLotteExcelDownload} disabled={isDownloading || filteredOrders.length === 0}
            className="bg-[#da291c] text-white px-3 py-2 rounded font-bold hover:bg-[#b01c13] disabled:bg-gray-400 text-sm whitespace-nowrap">
            📦 롯데택배 엑셀
          </button>
          <button onClick={openBulkModal} disabled={isDownloading || filteredOrders.length === 0}
            className="bg-yellow-400 text-yellow-900 px-3 py-2 rounded font-bold hover:bg-yellow-500 disabled:bg-gray-400 text-sm whitespace-nowrap">
            💬 일괄 알림톡
          </button>
          <button onClick={handleBulkDownload} disabled={isDownloading || customerGroups.length === 0}
            className="bg-[#673ab7] text-white px-3 py-2 rounded font-bold hover:bg-[#5e35b1] disabled:bg-gray-400 text-sm whitespace-nowrap">
            {isDownloading ? '생성 중...' : '📥 합산 청구서'}
          </button>
        </div>
      </div>

      {/* ── 고객 카드 목록 ── */}
      <div className="space-y-2">
        {customerGroups.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-16 text-center text-gray-400">
            <p className="text-5xl mb-4">📭</p>
            <p className="font-medium text-lg">{(dateFrom || dateTo) ? '선택한 기간에 주문이 없습니다.' : '주문 내역이 없습니다.'}</p>
            {!dateFrom && !dateTo && (
              <p className="text-sm mt-2">날짜 범위를 선택하거나{' '}
                <button onClick={() => setQuickDate('all')} className="text-[#673ab7] font-bold underline">전체 보기</button>를 클릭하세요.
              </p>
            )}
          </div>
        ) : customerGroups.map(group => {
          const user = users.find(u => u.phone === group.userId || u.nickname === group.userId);
          const borderColor = group.allPaid ? 'border-green-400' : group.anyPaid ? 'border-yellow-400' : 'border-gray-300';

          return (
            <div key={group.userId} className={`bg-white rounded-lg shadow-sm border-l-4 ${borderColor} overflow-hidden`}>

              {/* 고객 헤더 */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-bold text-gray-900">{user?.name || '미등록'}</span>
                  <span className="text-gray-400 text-sm">({user?.nickname || group.userId})</span>
                  {user?.phone && <span className="text-xs text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded">📞 {user.phone}</span>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${group.allPaid ? 'bg-green-100 text-green-700' : group.anyPaid ? 'bg-yellow-100 text-yellow-800' : 'bg-red-50 text-red-600'}`}>
                    {group.allPaid ? '✅ 전체입금' : group.anyPaid ? '⚠️ 일부입금' : '❌ 미입금'}
                  </span>
                  <span className="font-bold text-gray-900 text-sm">{group.totalPrice.toLocaleString()}원</span>

                  {/* 택배비 설정 버튼 */}
                  <button onClick={() => setShippingModalUserId(group.userId)}
                    className="text-xs bg-indigo-100 text-indigo-700 font-bold px-2 py-1 rounded border border-indigo-200 hover:bg-indigo-200 whitespace-nowrap">
                    📦 택배비
                  </button>
                  {!group.allPaid && (
                    <button onClick={() => handleMarkAllPaid(group.orders, true)}
                      className="text-xs bg-green-100 text-green-700 font-bold px-2 py-1 rounded border border-green-200 hover:bg-green-200 whitespace-nowrap">
                      ✅ 전체입금
                    </button>
                  )}
                  <button onClick={() => handleSendMergedAlimtalk(group)} disabled={sendingAlimtalk === group.userId}
                    className="text-xs bg-yellow-100 text-yellow-800 font-bold px-2 py-1 rounded border border-yellow-200 hover:bg-yellow-200 disabled:opacity-50 whitespace-nowrap">
                    {sendingAlimtalk === group.userId ? '발송중..' : '💬 알림톡'}
                  </button>
                  <a href={`/invoice/merged?userId=${encodeURIComponent(group.userId)}${dateFrom ? `&from=${dateFrom}` : ''}${dateTo ? `&to=${dateTo}` : ''}`}
                    target="_blank" className="text-xs bg-[#673ab7] text-white font-bold px-2 py-1 rounded hover:bg-[#5e35b1] whitespace-nowrap">
                    📋 합산청구서
                  </a>
                </div>
              </div>

              {/* 날짜별 섹션 */}
              {group.dateGroups.map(dg => {
                const expanded = isDateExpanded(group.userId, dg.dateStr);
                const dateOrderIds = dg.orders.map(o => o.id);
                return (
                  <div key={dg.dateStr} className="border-b border-gray-100 last:border-0">

                    {/* 날짜 행 (클릭 시 상세 펼침) */}
                    <button
                      onClick={() => toggleDateExpand(group.userId, dg.dateStr)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left ${dg.isPaid ? 'bg-green-50/30' : ''}`}
                    >
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-xs font-bold text-[#673ab7] bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
                          {dg.displayDate}
                        </span>
                        {/* 축약 품목 미리보기 */}
                        <span className="text-xs text-gray-500 hidden sm:inline">
                          {dg.allItems.slice(0, 3).map(i => `${i.productName}×${i.quantity}`).join(' / ')}
                          {dg.allItems.length > 3 && ` 외 ${dg.allItems.length - 3}개`}
                        </span>
                        {dg.isPaid && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">✅ 입금</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-sm text-gray-800 font-mono">{dg.subtotal.toLocaleString()}원</span>
                        <button
                          onClick={e => { e.stopPropagation(); handleMarkDatePaid(dg.orders, !dg.isPaid); }}
                          className={`text-xs px-2 py-0.5 rounded font-bold border transition-colors ${dg.isPaid ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-white text-gray-600 border-gray-300 hover:border-green-400 hover:text-green-600'}`}
                        >
                          {dg.isPaid ? '취소' : '입금'}
                        </button>
                        <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {/* 상세 품목 (펼쳐진 경우) */}
                    {expanded && (
                      <div className="bg-gray-50 px-4 pb-3 pt-1">
                        {/* 품목 태그 */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {dg.allItems.map((item, idx) => (
                            <span key={idx} className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium border ${item.productName === '일괄 택배비' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-gray-700 border-gray-200'}`}>
                              {item.productName}<span className="ml-1 font-bold">×{item.quantity}</span>
                              <span className="ml-1 text-gray-400">{(item.price * item.quantity).toLocaleString()}원</span>
                            </span>
                          ))}
                        </div>
                        {/* 개별 주문 수정/삭제 */}
                        {dg.orders.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap">
                            {dg.orders.map(order => (
                              <div key={order.id} className="flex gap-1">
                                <button onClick={() => openEditModal(order)} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-200 hover:bg-blue-100">수정</button>
                                <button onClick={() => {
                                  const newAddr = prompt('배송 주소를 입력하세요.\n비워두면 기본 배송지로 복구됩니다.', order.shippingAddress || '');
                                  if (newAddr !== null) updateOrderShippingAddress(order.id, newAddr);
                                }} className="text-xs bg-sky-50 text-sky-600 px-2 py-1 rounded border border-sky-200 hover:bg-sky-100">배송지</button>
                                <button onClick={() => { if (confirm('이 주문을 삭제하시겠습니까?')) deleteOrder(order.id); }}
                                  className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded border border-red-200 hover:bg-red-100">삭제</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ── 택배비 설정 모달 ── */}
      {shippingModalUserId && (() => {
        const group = customerGroups.find(g => g.userId === shippingModalUserId);
        const user = users.find(u => u.phone === shippingModalUserId || u.nickname === shippingModalUserId);
        if (!group) return null;
        const hasShipping = group.orders.some(o => o.items.some(i => i.productName === '일괄 택배비'));
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-xl max-w-sm w-full shadow-2xl">
              <h3 className="text-lg font-bold mb-1">📦 택배비 설정</h3>
              <p className="text-sm text-gray-500 mb-4">{user?.name} 님</p>
              {hasShipping && <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded mb-3">이미 택배비가 청구되어 있습니다.</p>}
              <div className="space-y-2">
                <button onClick={() => handleSetShippingFee(group, 'delivery')}
                  className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 text-sm">
                  🚚 택배 배송 (4,000원 1회 추가)
                </button>
                <button onClick={() => handleSetShippingFee(group, 'pickup')}
                  className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 text-sm">
                  🏪 직접 수령 (택배비 없음)
                </button>
              </div>
              <button onClick={() => setShippingModalUserId(null)} className="w-full mt-3 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-sm">
                취소
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── 주문 수정 모달 ── */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl max-w-lg w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-1">주문 수정</h3>
            <p className="text-sm text-gray-500 mb-4">{editingOrder.userId}</p>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {editItems.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center border border-gray-200 p-2.5 rounded-lg">
                  <span className="font-medium text-sm">{item.productName}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateItemQty(idx, -1)} className="w-8 h-8 bg-gray-100 rounded-lg hover:bg-gray-200 font-bold text-lg">−</button>
                    <span className="w-8 text-center font-bold">{item.quantity}</span>
                    <button onClick={() => updateItemQty(idx, 1)} className="w-8 h-8 bg-gray-100 rounded-lg hover:bg-gray-200 font-bold text-lg">+</button>
                  </div>
                </div>
              ))}
              {editItems.length === 0 && <p className="text-red-500 text-center py-4 text-sm">모든 항목이 삭제되었습니다. 저장 시 주문이 삭제됩니다.</p>}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingOrder(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
              <button onClick={handleSaveEdit} className="px-4 py-2 bg-[#673ab7] text-white rounded-lg font-bold hover:bg-[#5e35b1]">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 일괄 알림톡 모달 ── */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <h3 className="text-xl font-bold mb-1">💬 일괄 알림톡 발송</h3>
            <p className="text-sm text-purple-600 font-medium mb-4">고객 1명당 합산 청구서 1회 발송 — 선택됨: <span className="font-bold text-gray-900">{Object.values(bulkSelection).filter(Boolean).length}명</span></p>
            <div className="flex-1 overflow-y-auto mb-4 border border-gray-200 rounded-lg bg-gray-50 min-h-[40vh]">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-100 sticky top-0">
                  <tr>
                    <th className="p-2.5 w-10 text-center">
                      <input type="checkbox" checked={bulkCustomerTargets.length > 0 && Object.values(bulkSelection).every(Boolean)}
                        onChange={e => { const s = { ...bulkSelection }; bulkCustomerTargets.forEach(t => { s[t.userId] = e.target.checked; }); setBulkSelection(s); }}
                        className="w-4 h-4 accent-yellow-500" />
                    </th>
                    <th className="p-2.5">고객명</th>
                    <th className="p-2.5">연락처</th>
                    <th className="p-2.5 text-center">주문수</th>
                    <th className="p-2.5 text-right">합산금액</th>
                    <th className="p-2.5 text-center">입금</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkCustomerTargets.map(({ userId, orders: customerOrders, totalPrice }) => {
                    const user = users.find(u => u.phone === userId || u.nickname === userId);
                    const allPaid = customerOrders.every(o => o.isPaid);
                    return (
                      <tr key={userId} className="border-b last:border-0 hover:bg-white">
                        <td className="p-2.5 text-center">
                          <input type="checkbox" checked={!!bulkSelection[userId]} onChange={e => setBulkSelection({ ...bulkSelection, [userId]: e.target.checked })} className="w-4 h-4 accent-yellow-500 cursor-pointer" />
                        </td>
                        <td className="p-2.5"><span className="font-bold">{user?.name || '미등록'}</span><span className="text-gray-400 text-xs ml-1">({user?.nickname})</span></td>
                        <td className="p-2.5 text-gray-600 text-xs">{user?.phone || '번호없음'}</td>
                        <td className="p-2.5 text-center"><span className="text-xs bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-full">{customerOrders.length}건</span></td>
                        <td className="p-2.5 text-right text-sm font-mono font-bold">{totalPrice.toLocaleString()}원</td>
                        <td className="p-2.5 text-center"><span className={`text-xs px-2 py-0.5 rounded-full font-bold ${allPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{allPaid ? '완료' : '미입금'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {bulkProgress && (
              <div className="mb-4">
                <div className="w-full bg-gray-200 rounded-full h-2 mb-1.5">
                  <div className="bg-yellow-400 h-2 rounded-full transition-all duration-300" style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>진행률: {bulkProgress.current} / {bulkProgress.total}명</span>
                  <span>성공: <span className="text-green-600 font-bold">{bulkProgress.successes}</span> | 실패: <span className="text-red-600 font-bold">{bulkProgress.fails}</span></span>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsBulkModalOpen(false)} disabled={isBulkSending} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-bold">닫기</button>
              <button onClick={handleBulkSend} disabled={isBulkSending || Object.values(bulkSelection).filter(Boolean).length === 0}
                className="px-5 py-2 bg-yellow-400 text-yellow-900 rounded-lg font-bold hover:bg-yellow-500 disabled:opacity-50">
                {isBulkSending ? '발송 중...' : `✔ ${Object.values(bulkSelection).filter(Boolean).length}명에게 발송`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 합산 청구서 숨김 렌더링 영역 ── */}
      <div style={{ position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -9999 }}>
        {isDownloading && customerGroups.map(group => (
          <div key={group.userId} id={`invoice-render-customer-${safeId(group.userId)}`}>
            <InvoiceTemplate data={buildMergedInvoiceData(group)} hideButtons={true} customId={`invoice-capture-customer-${safeId(group.userId)}`} />
          </div>
        ))}
      </div>

    </div>
  );
}
