"use client";

import { useState, useMemo } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { useApp, Order, OrderItem } from '../../context/AppContext';
import InvoiceTemplate, { InvoiceData, InvoiceDateGroup } from '../../components/InvoiceTemplate';

// ─────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────

/** 한국어 로케일 날짜 문자열("2026. 5. 30.") 또는 ISO 문자열을 Date로 변환 */
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

/** "2026. 5. 30." → "5/30(토)" */
const formatDisplayDate = (dateStr: string): string => {
  const d = parseKoreanDate(dateStr);
  if (!d) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]})`;
};

/** HTML id로 사용 가능한 안전한 문자열로 변환 */
const safeId = (str: string) => str.replace(/[^a-zA-Z0-9가-힣]/g, '_');

// ─────────────────────────────────────────
// Type for bulk alimtalk target (customer-level, not order-level)
// ─────────────────────────────────────────
interface BulkCustomerTarget {
  userId: string;
  orders: Order[];
  totalPrice: number;
}

// ─────────────────────────────────────────
// Component
// ─────────────────────────────────────────

export default function OrderManagementTab() {
  const {
    products, orders, users,
    markOrderPaid, updateOrder, deleteOrder,
    markOrdersAsExported, addBulkShippingFee, updateOrderShippingAddress,
  } = useApp();

  // ── Filter State ──
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterUnpaid, setFilterUnpaid] = useState(false);
  const [filterOnlyPreparing, setFilterOnlyPreparing] = useState(false);
  const [filterOnlyNotExported, setFilterOnlyNotExported] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [downloadFilter, setDownloadFilter] = useState<'all' | 'paid'>('all');
  const [sortOrder, setSortOrder] = useState<'date_desc' | 'price_desc' | 'price_asc'>('date_desc');
  const [searchQuery, setSearchQuery] = useState('');

  // ── UI State ──
  const [isDownloading, setIsDownloading] = useState(false);
  const [sendingAlimtalk, setSendingAlimtalk] = useState<string | null>(null); // userId
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editItems, setEditItems] = useState<OrderItem[]>([]);

  // ── Bulk Alimtalk State (고객 단위) ──
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkCustomerTargets, setBulkCustomerTargets] = useState<BulkCustomerTarget[]>([]);
  const [bulkSelection, setBulkSelection] = useState<Record<string, boolean>>({}); // key: userId
  const [bulkProgress, setBulkProgress] = useState<{
    current: number; total: number; successes: number; fails: number;
  } | null>(null);
  const [isBulkSending, setIsBulkSending] = useState(false);

  // ─────────────────────────────────────────
  // Quick Date Presets
  // ─────────────────────────────────────────
  const setQuickDate = (preset: 'today' | 'last3' | 'thisWeek' | 'all') => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (preset === 'today') {
      setDateFrom(toIsoDate(today)); setDateTo(toIsoDate(today));
    } else if (preset === 'last3') {
      const from = new Date(today); from.setDate(from.getDate() - 2);
      setDateFrom(toIsoDate(from)); setDateTo(toIsoDate(today));
    } else if (preset === 'thisWeek') {
      const from = new Date(today);
      const day = from.getDay();
      from.setDate(from.getDate() + (day === 0 ? -6 : 1 - day));
      setDateFrom(toIsoDate(from)); setDateTo(toIsoDate(today));
    } else {
      setDateFrom(''); setDateTo('');
    }
  };

  // ─────────────────────────────────────────
  // Filter & Sort Logic
  // ─────────────────────────────────────────
  const activeOrders = showArchived ? orders : orders.filter(o => !o.isArchived);

  const filteredOrders = useMemo(() => {
    let result = [...activeOrders];

    if (dateFrom || dateTo) {
      result = result.filter(o => {
        const d = parseKoreanDate(o.createdAt || '');
        if (!d) return true;
        if (dateFrom && d < new Date(dateFrom)) return false;
        if (dateTo) {
          const to = new Date(dateTo); to.setDate(to.getDate() + 1);
          if (d >= to) return false;
        }
        return true;
      });
    }

    if (filterUnpaid) result = result.filter(o => !o.isPaid);

    if (searchQuery) {
      result = result.filter(o => {
        const user = users.find(u => u.phone === o.userId || u.nickname === o.userId);
        const term = searchQuery.toLowerCase();
        return (
          user?.name?.toLowerCase().includes(term) ||
          user?.nickname?.toLowerCase().includes(term) ||
          user?.phone?.includes(term)
        );
      });
    }

    result.sort((a, b) => {
      if (sortOrder === 'price_desc') return b.totalPrice - a.totalPrice;
      if (sortOrder === 'price_asc') return a.totalPrice - b.totalPrice;
      return b.id.localeCompare(a.id);
    });

    return result;
  }, [activeOrders, dateFrom, dateTo, filterUnpaid, searchQuery, sortOrder, users]);

  // ─────────────────────────────────────────
  // Customer Card Groups
  // ─────────────────────────────────────────
  const customerGroups = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of filteredOrders) {
      const existing = map.get(order.userId) || [];
      map.set(order.userId, [...existing, order]);
    }
    const groups: { userId: string; orders: Order[] }[] = [];
    map.forEach((customerOrders, userId) => {
      const sorted = [...customerOrders].sort((a, b) => {
        const da = parseKoreanDate(a.createdAt || '');
        const db = parseKoreanDate(b.createdAt || '');
        if (!da || !db) return 0;
        return da.getTime() - db.getTime();
      });
      groups.push({ userId, orders: sorted });
    });
    return groups;
  }, [filteredOrders]);

  // ─────────────────────────────────────────
  // Merged Invoice Builder (고객 1명 → 날짜별 합산 청구서)
  // ─────────────────────────────────────────
  const buildMergedInvoiceData = (userId: string, customerOrders: Order[]): InvoiceData => {
    const user = users.find(u => u.phone === userId || u.nickname === userId);

    const sortedOrders = [...customerOrders].sort((a, b) => {
      const da = parseKoreanDate(a.createdAt || '');
      const db = parseKoreanDate(b.createdAt || '');
      if (!da || !db) return 0;
      return da.getTime() - db.getTime();
    });

    const dateGroups: InvoiceDateGroup[] = sortedOrders.map(order => ({
      date: formatDisplayDate(order.createdAt || ''),
      items: order.items.map(i => ({ name: i.productName, quantity: i.quantity, price: i.price })),
      subtotal: order.totalPrice,
    }));

    const totalPrice = sortedOrders.reduce((s, o) => s + o.totalPrice, 0);

    const periodLabel = sortedOrders.length === 1
      ? formatDisplayDate(sortedOrders[0].createdAt || '')
      : `${formatDisplayDate(sortedOrders[0].createdAt || '')} ~ ${formatDisplayDate(sortedOrders[sortedOrders.length - 1].createdAt || '')}`;

    return {
      customerName: user?.name || '미등록',
      customerPhone: user?.phone,
      customerNickname: user?.nickname,
      address: sortedOrders[0]?.shippingAddress || user?.address || '',
      date: periodLabel,
      items: [],
      totalPrice,
      bankName: '새마을금고',
      accountNumber: '010-6269-9612',
      accountHolder: '보라몰',
      isPaid: sortedOrders.every(o => o.isPaid),
      dateGroups,
    };
  };

  /** 알림톡용 합산 청구서 URL 생성 */
  const buildMergedInvoiceUrl = (userId: string): string => {
    const params = new URLSearchParams({ userId });
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    return `boramall.vercel.app/invoice/merged?${params.toString()}`;
  };

  // ─────────────────────────────────────────
  // Statistics
  // ─────────────────────────────────────────
  const getRevenueExShipping = (order: Order) => {
    const shipFee = order.items.filter(i => i.productName === '일괄 택배비')
      .reduce((s, i) => s + i.price * i.quantity, 0);
    return order.totalPrice - shipFee;
  };

  const totalOrders = filteredOrders.length;
  const totalRevenue = filteredOrders.reduce((sum, o) => sum + getRevenueExShipping(o), 0);
  const paidOrders = filteredOrders.filter(o => o.isPaid);
  const paidCount = paidOrders.length;
  const paidTotal = paidOrders.reduce((sum, o) => sum + getRevenueExShipping(o), 0);
  const unpaidCount = filteredOrders.filter(o => !o.isPaid).length;
  const unpaidTotal = filteredOrders.filter(o => !o.isPaid).reduce((sum, o) => sum + getRevenueExShipping(o), 0);
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
  // Handlers
  // ─────────────────────────────────────────

  /** 미입금 주문 전체에 택배비 추가 (기간 필터 기준) */
  const handleAddBulkShippingFee = () => {
    const unpaid = filteredOrders.filter(o => !o.isPaid);
    if (unpaid.length === 0) { alert('현재 목록에 미입금 주문이 없습니다.'); return; }
    const noShip = unpaid.filter(o => !o.items.some(i => i.productName === '일괄 택배비'));
    if (noShip.length === 0) { alert('이미 모든 미입금 주문에 일괄 택배비가 청구되어 있습니다.'); return; }
    if (!confirm(`기간 내 택배비 미청구 미입금 주문 ${noShip.length}건에 각 4,000원을 추가하시겠습니까?`)) return;
    addBulkShippingFee(noShip.map(o => o.id));
    alert(`${noShip.length}건에 일괄 택배비 4,000원이 추가되었습니다.`);
  };

  /** 고객 1명당 1장 합산 청구서 다운로드 (ZIP) */
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
      await new Promise(r => setTimeout(r, 600)); // React 렌더링 대기
      const originalScrollY = window.scrollY;
      window.scrollTo(0, 0);
      let count = 0;

      for (const { userId, orders: customerOrders } of groupsToDownload) {
        const user = users.find(u => u.phone === userId || u.nickname === userId);
        const el = document.getElementById(`invoice-render-customer-${safeId(userId)}`);
        if (el) {
          await toPng(el, { cacheBust: true }); // 캐시 워밍
          await new Promise(r => setTimeout(r, 50));

          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:672px';
          document.body.appendChild(wrapper);
          const clone = el.cloneNode(true) as HTMLElement;
          wrapper.appendChild(clone);

          const dataUrl = await toPng(clone, {
            cacheBust: true, pixelRatio: 2, backgroundColor: '#ffffff',
            style: { transform: 'scale(1)', transformOrigin: 'top left', width: '672px', minWidth: '672px', margin: '0' },
            width: 672, height: el.scrollHeight,
          });
          document.body.removeChild(wrapper);

          const displayId = user?.nickname || userId;
          const totalPrice = customerOrders.reduce((s, o) => s + o.totalPrice, 0);
          const filename = `${user?.name || displayId}_${displayId}_${periodStr}_합산청구서.png`;
          folder?.file(filename, dataUrl.split(',')[1], { base64: true });
          count++;
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `BoraMall_합산청구서_${periodStr}.zip`);
      window.scrollTo(0, originalScrollY);
      alert(`${count}명의 합산 청구서를 다운로드했습니다.`);
    } catch (e) {
      console.error(e);
      alert('다운로드 중 오류가 발생했습니다.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleConsignmentExport = async () => {
    const consignmentData: Record<string, Record<string, string | number>[]> = {};
    let hasConsignment = false;
    const ordersToExport = downloadFilter === 'paid' ? filteredOrders.filter(o => o.isPaid) : filteredOrders;

    ordersToExport.forEach(order => {
      const user = users.find(u => u.phone === order.userId || u.nickname === order.userId);
      order.items.forEach(item => {
        if (item.isConsignment && item.vendorName) {
          hasConsignment = true;
          if (!consignmentData[item.vendorName]) consignmentData[item.vendorName] = [];
          consignmentData[item.vendorName].push({
            '수취인명': user?.name || '', '전화번호': user?.phone || '',
            '회원번호(닉네임)': user?.nickname || '',
            '배송주소': order.shippingAddress || user?.address || '',
            '상품명': item.productName, '수량': item.quantity,
            '주문일시': order.createdAt, '입금상태': order.isPaid ? '입금완료' : '미입금',
          });
        }
      });
    });

    if (!hasConsignment) { alert('현재 목록에 위탁 배송 상품이 없습니다.'); return; }
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder('업체별_발주서');
      Object.keys(consignmentData).forEach(vendor => {
        const rows = consignmentData[vendor];
        const header = Object.keys(rows[0]).join(',');
        const csv = '\uFEFF' + header + '\n' + rows.map(row =>
          Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
        folder?.file(`${vendor}_발주서.csv`, csv);
      });
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `위탁_발주서_${periodStr}.zip`);
      alert(`${Object.keys(consignmentData).length}개 업체의 발주서 다운로드가 완료되었습니다.`);
    } catch (e) { console.error(e); alert('발주서 다운로드 중 오류가 발생했습니다.');
    } finally { setIsDownloading(false); }
  };

  const handleLotteExcelDownload = () => {
    const ordersToExport = filteredOrders
      .filter(o => o.isPaid)
      .filter(o => filterOnlyPreparing ? (!o.deliveryStatus || o.deliveryStatus === '배송준비중') : true)
      .filter(order => order.items.some(item => !item.isConsignment))
      .filter(o => filterOnlyNotExported ? !o.isExportedToExcel : true);

    if (ordersToExport.length === 0) {
      alert(`다운로드할 택배 배송건(위탁 제외)이 없습니다.` +
        (filterOnlyPreparing || filterOnlyNotExported ? '\n(필터 조건에 의해 제외된 건이 있을 수 있습니다.)' : ''));
      return;
    }
    if (!confirm(`총 ${ordersToExport.length}건의 배송 엑셀을 다운로드합니다.\n다운로드 후 해당 건들은 '추출 완료' 상태로 변경됩니다.\n\n진행하시겠습니까?`)) return;

    const headers = ['주문번호', '보내는사람(지정)', '전화번호1(지정)', '전화번호2(지정)', '우편번호(지정)', '주소(지정)',
      '받는사람', '전화번호1', '전화번호2', '우편번호', '주소', '상품명1', '상품상세1', '수량(A타입)', '배송메시지', '운임구분', '운임', '운송장번호'];
    let orderNum = 1;
    const csvRows = ordersToExport.map(order => {
      const user = users.find(u => u.phone === order.userId || u.nickname === order.userId);
      const normalItems = order.items.filter(item => !item.isConsignment);
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

  /** 개별 주문 단건 알림톡 */
  const handleSendAlimtalk = async (order: Order, userName: string, userPhone: string) => {
    if (!userPhone) { alert('고객 전화번호가 없습니다.'); return; }
    if (!confirm(`${userName} 님에게 알림톡 청구서를 발송하시겠습니까?`)) return;
    setSendingAlimtalk(order.id);
    try {
      const res = await fetch('/api/alimtalk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, name: userName, phone: userPhone, totalPrice: order.totalPrice }),
      });
      const data = await res.json();
      alert(data.success ? '알림톡 발송 성공!' : '알림톡 발송 실패: ' + data.error);
    } catch { alert('알림톡 발송 중 오류가 발생했습니다.');
    } finally { setSendingAlimtalk(null); }
  };

  /** 고객 카드에서 합산 알림톡 발송 (해당 고객의 기간 내 전체 합산 금액으로 1회 발송) */
  const handleSendMergedAlimtalk = async (userId: string, customerOrders: Order[]) => {
    const user = users.find(u => u.phone === userId || u.nickname === userId);
    const phone = user?.phone || '';
    const name = user?.name || '고객';
    if (!phone) { alert('고객 전화번호가 없습니다.'); return; }
    if (!confirm(`${name} 님에게 기간 합산 알림톡을 발송하시겠습니까?\n총 ${customerOrders.length}건 / 합계 ${customerOrders.reduce((s, o) => s + o.totalPrice, 0).toLocaleString()}원`)) return;

    setSendingAlimtalk(userId);
    try {
      const totalPrice = customerOrders.reduce((s, o) => s + o.totalPrice, 0);
      const invoiceUrl = buildMergedInvoiceUrl(userId);
      const res = await fetch('/api/alimtalk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: customerOrders[0].id, name, phone, totalPrice, invoiceUrl }),
      });
      const data = await res.json();
      alert(data.success ? '합산 알림톡 발송 성공!' : '알림톡 발송 실패: ' + data.error);
    } catch { alert('알림톡 발송 중 오류가 발생했습니다.');
    } finally { setSendingAlimtalk(null); }
  };

  /** 일괄 알림톡 모달 열기 — 고객 단위로 중복 제거 */
  const openBulkModal = () => {
    const baseOrders = downloadFilter === 'paid' ? filteredOrders.filter(o => o.isPaid) : filteredOrders;
    if (baseOrders.length === 0) { alert('발송 대상이 없습니다.'); return; }

    // 고객별 그룹화
    const map = new Map<string, Order[]>();
    for (const order of baseOrders) {
      const existing = map.get(order.userId) || [];
      map.set(order.userId, [...existing, order]);
    }
    const targets: BulkCustomerTarget[] = [];
    map.forEach((orders, userId) => {
      targets.push({ userId, orders, totalPrice: orders.reduce((s, o) => s + o.totalPrice, 0) });
    });

    setBulkCustomerTargets(targets);
    const initialSelection: Record<string, boolean> = {};
    targets.forEach(t => { initialSelection[t.userId] = true; });
    setBulkSelection(initialSelection);
    setIsBulkModalOpen(true);
    setBulkProgress(null);
  };

  /** 고객 1명당 1회 일괄 발송 */
  const handleBulkSend = async () => {
    const selected = bulkCustomerTargets.filter(t => bulkSelection[t.userId]);
    if (selected.length === 0) { alert('발송할 대상을 선택해 주세요.'); return; }
    if (!confirm(`총 ${selected.length}명에게 합산 알림톡을 일괄 발송하시겠습니까?\n(고객 1명당 1회 발송)`)) return;

    setIsBulkSending(true);
    setBulkProgress({ current: 0, total: selected.length, successes: 0, fails: 0 });
    let successCount = 0, failCount = 0;

    for (let i = 0; i < selected.length; i++) {
      const { userId, orders: customerOrders, totalPrice } = selected[i];
      const user = users.find(u => u.phone === userId || u.nickname === userId);
      const phone = user?.phone || '';

      if (!phone) {
        failCount++;
        setBulkProgress({ current: i + 1, total: selected.length, successes: successCount, fails: failCount });
        continue;
      }

      try {
        const invoiceUrl = buildMergedInvoiceUrl(userId);
        const res = await fetch('/api/alimtalk', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: customerOrders[0].id,
            name: user?.name || '고객',
            phone, totalPrice, invoiceUrl,
          }),
        });
        const data = await res.json();
        if (data.success) successCount++; else failCount++;
      } catch { failCount++; }

      setBulkProgress({ current: i + 1, total: selected.length, successes: successCount, fails: failCount });
      await new Promise(r => setTimeout(r, 300));
    }

    setIsBulkSending(false);
    alert(`발송이 완료되었습니다.\n성공: ${successCount}명 | 실패: ${failCount}명`);
  };

  /** 고객의 기간 내 모든 주문을 한 번에 입금 처리 */
  const handleMarkAllPaid = (customerOrders: Order[], isPaid: boolean) => {
    const unprocessed = customerOrders.filter(o => o.isPaid !== isPaid);
    if (unprocessed.length === 0) return;
    unprocessed.forEach(o => markOrderPaid(o.id, isPaid));
  };

  const openEditModal = (order: Order) => {
    setEditingOrder(order);
    setEditItems(order.items.map((i: OrderItem) => ({ ...i })));
  };

  const handleSaveEdit = () => {
    if (editingOrder) { updateOrder(editingOrder.id, editItems); setEditingOrder(null); setEditItems([]); }
  };

  const updateItemQty = (index: number, change: number) => {
    const newItems = [...editItems];
    const item = newItems[index];
    const newQty = item.quantity + change;
    if (newQty <= 0) { if (confirm(`${item.productName}을(를) 삭제하시겠습니까?`)) newItems.splice(index, 1); }
    else { item.quantity = newQty; }
    setEditItems(newItems);
  };

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── 통계 카드 (기간 필터 기준) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-[#673ab7]">
          <h2 className="text-gray-500 text-xs font-medium mb-1">조회 매출 ({totalOrders}건 / {customerGroups.length}명)</h2>
          <p className="text-xl font-bold text-[#673ab7]">{totalRevenue.toLocaleString()}원</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-500">
          <h2 className="text-gray-500 text-xs font-medium mb-1">예상 순이익</h2>
          <p className="text-xl font-bold text-blue-600">{totalProfit.toLocaleString()}원</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-green-500 relative">
          <h2 className="text-gray-500 text-xs font-medium mb-1">입금액 ({paidCount}건)</h2>
          <p className="text-xl font-bold text-green-600">{paidTotal.toLocaleString()}원</p>
          <span className="absolute top-3 right-3 text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">{paidRate}%</span>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-yellow-500">
          <h2 className="text-gray-500 text-xs font-medium mb-1">미입금 ({unpaidCount}건)</h2>
          <p className="text-xl font-bold text-yellow-600">{unpaidTotal.toLocaleString()}원</p>
        </div>
      </div>

      {/* ── 날짜 범위 필터 ── */}
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-gray-700 whitespace-nowrap">📅 조회 기간</span>
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#673ab7] outline-none" />
            <span className="text-gray-400 font-bold">~</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#673ab7] outline-none" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[{ key: 'today', label: '오늘' }, { key: 'last3', label: '최근 3일' }, { key: 'thisWeek', label: '이번 주' }, { key: 'all', label: '전체' }]
              .map(({ key, label }) => (
                <button key={key} onClick={() => setQuickDate(key as 'today' | 'last3' | 'thisWeek' | 'all')}
                  className="text-xs px-3 py-1.5 rounded-full border border-[#673ab7] text-[#673ab7] hover:bg-[#673ab7] hover:text-white transition-colors font-medium">
                  {label}
                </button>
              ))}
          </div>
          {(dateFrom || dateTo) && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full font-bold">
              {filteredOrders.length}건 / {customerGroups.length}명
            </span>
          )}
        </div>
      </div>

      {/* ── 필터 & 액션 컨트롤 ── */}
      <div className="flex flex-col xl:flex-row justify-between xl:items-center bg-white p-4 rounded-lg shadow-sm gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={filterUnpaid} onChange={e => setFilterUnpaid(e.target.checked)} className="w-4 h-4 accent-[#673ab7]" />
            <span className="text-sm font-bold text-gray-700 whitespace-nowrap">미입금만</span>
          </label>
          <div className="w-px h-4 bg-gray-300 hidden sm:block" />
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="w-4 h-4 accent-gray-500" />
            <span className="text-sm font-bold text-gray-700 whitespace-nowrap">📦 보관함 포함</span>
          </label>
          <div className="w-px h-4 bg-gray-300 hidden sm:block" />
          <label className="flex items-center gap-1.5 cursor-pointer select-none" title="체크 시 배송중/완료된 주문 제외">
            <input type="checkbox" checked={filterOnlyPreparing} onChange={e => setFilterOnlyPreparing(e.target.checked)} className="w-4 h-4 accent-blue-500" />
            <span className="text-sm font-bold text-gray-700 whitespace-nowrap">🚚 배송준비중만</span>
          </label>
          <div className="w-px h-4 bg-gray-300 hidden sm:block" />
          <label className="flex items-center gap-1.5 cursor-pointer select-none" title="체크 시 이미 엑셀로 추출된 건 제외">
            <input type="checkbox" checked={filterOnlyNotExported} onChange={e => setFilterOnlyNotExported(e.target.checked)} className="w-4 h-4 accent-[#da291c]" />
            <span className="text-sm font-bold text-gray-700 whitespace-nowrap">🌟 미추출건만</span>
          </label>
          <div className="w-px h-4 bg-gray-300 hidden sm:block" />
          <select value={downloadFilter} onChange={e => setDownloadFilter(e.target.value as 'all' | 'paid')}
            className="border border-gray-300 rounded px-2 py-1 text-xs font-bold text-gray-700 bg-gray-50 focus:ring-1 focus:ring-[#673ab7] outline-none">
            <option value="all">다운로드: 전체</option>
            <option value="paid">다운로드: ✅ 입금완료만</option>
          </select>
          <input type="text" placeholder="🔍 이름·닉네임 검색" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm w-36 focus:ring-1 focus:ring-[#673ab7] outline-none" />
        </div>

        <div className="flex flex-wrap justify-start xl:justify-end gap-2">
          <button onClick={handleAddBulkShippingFee}
            className="bg-indigo-100 text-indigo-700 font-bold px-3 py-2 rounded hover:bg-indigo-200 border border-indigo-200 text-sm whitespace-nowrap">
            💸 일괄 택배비
          </button>
          <button onClick={handleConsignmentExport} disabled={isDownloading || filteredOrders.length === 0}
            className="bg-teal-600 text-white px-3 py-2 rounded font-bold hover:bg-teal-700 disabled:bg-gray-400 text-sm whitespace-nowrap">
            {isDownloading ? '처리 중...' : '🚚 위탁 발주서'}
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
            {isDownloading ? '생성 중...' : '📥 합산 청구서 다운'}
          </button>
        </div>
      </div>

      {/* ── 고객 카드 목록 ── */}
      <div className="space-y-3">
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
        ) : customerGroups.map(({ userId, orders: customerOrders }) => {
          const user = users.find(u => u.phone === userId || u.nickname === userId);
          const customerTotal = customerOrders.reduce((s, o) => s + o.totalPrice, 0);
          const allPaid = customerOrders.every(o => o.isPaid);
          const anyPaid = customerOrders.some(o => o.isPaid);

          return (
            <div key={userId} className={`bg-white rounded-lg shadow-sm border-l-4 overflow-hidden ${allPaid ? 'border-green-400' : anyPaid ? 'border-yellow-400' : 'border-gray-300'}`}>

              {/* 고객 헤더 */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-3 flex-wrap min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-bold text-gray-900 text-base">{user?.name || '미등록'}</span>
                    <span className="text-gray-400 text-sm">({user?.nickname || userId})</span>
                  </div>
                  {user?.phone && <span className="text-xs text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded">📞 {user.phone}</span>}
                  {(customerOrders[0]?.shippingAddress || user?.address) && (
                    <span className="text-xs text-gray-400 hidden md:inline truncate max-w-xs">🏠 {customerOrders[0]?.shippingAddress || user?.address}</span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${allPaid ? 'bg-green-100 text-green-700' : anyPaid ? 'bg-yellow-100 text-yellow-800' : 'bg-red-50 text-red-600'}`}>
                    {allPaid ? '✅ 전체 입금완료' : anyPaid ? '⚠️ 일부 입금' : '❌ 미입금'}
                  </span>
                  <span className="font-bold text-gray-900">{customerTotal.toLocaleString()}원</span>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{customerOrders.length}건</span>

                  {/* 고객 수준 액션 버튼 */}
                  {!allPaid && (
                    <button onClick={() => handleMarkAllPaid(customerOrders, true)}
                      className="text-xs bg-green-100 text-green-700 font-bold px-2.5 py-1 rounded border border-green-200 hover:bg-green-200 transition-colors whitespace-nowrap">
                      ✅ 전체 입금처리
                    </button>
                  )}
                  <button onClick={() => handleSendMergedAlimtalk(userId, customerOrders)}
                    disabled={sendingAlimtalk === userId}
                    className="text-xs bg-yellow-100 text-yellow-800 font-bold px-2.5 py-1 rounded border border-yellow-200 hover:bg-yellow-200 disabled:opacity-50 transition-colors whitespace-nowrap">
                    {sendingAlimtalk === userId ? '발송중..' : '💬 합산 알림톡'}
                  </button>
                  <a href={`/invoice/merged?userId=${encodeURIComponent(userId)}${dateFrom ? `&from=${dateFrom}` : ''}${dateTo ? `&to=${dateTo}` : ''}`}
                    target="_blank"
                    className="text-xs bg-[#673ab7] text-white font-bold px-2.5 py-1 rounded hover:bg-[#5e35b1] transition-colors whitespace-nowrap">
                    📋 합산 청구서
                  </a>
                </div>
              </div>

              {/* 날짜별 주문 목록 */}
              <div className="divide-y divide-gray-100">
                {customerOrders.map(order => (
                  <div key={order.id} className={`px-4 py-3 transition-colors ${order.isPaid ? 'bg-green-50/30' : 'bg-white'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-1.5 mb-2">
                          <span className="text-xs font-bold text-[#673ab7] bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
                            {formatDisplayDate(order.createdAt || '')}
                          </span>
                          {order.isExportedToExcel && <span className="text-xs bg-pink-100 text-pink-700 px-2 py-0.5 rounded font-bold">✓ 추출됨</span>}
                          {order.isPaid && order.deliveryStatus && (
                            <span className={`text-xs px-2 py-0.5 rounded font-medium border ${
                              order.deliveryStatus === '배송중' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              order.deliveryStatus === '배송완료' ? 'bg-gray-100 text-gray-600 border-gray-200' :
                              ['취소완료', '반품요청', '반품완료', '교환요청', '교환완료'].includes(order.deliveryStatus) ? 'bg-red-50 text-red-700 border-red-200' :
                              'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>{order.deliveryStatus}</span>
                          )}
                          {order.trackingNumber && <span className="text-xs text-gray-400 font-mono select-all">({order.trackingNumber})</span>}
                        </div>

                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {order.items.map((item, idx) => (
                            <span key={idx} className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${
                              item.productName === '일괄 택배비' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-gray-100 text-gray-700 border border-gray-200'
                            }`}>
                              {item.productName}<span className="ml-1 font-bold">×{item.quantity}</span>
                            </span>
                          ))}
                        </div>

                        <p className="text-xs text-gray-500">
                          소계: <span className="font-bold text-gray-800 font-mono">{order.totalPrice.toLocaleString()}원</span>
                        </p>
                      </div>

                      {/* 주문별 액션 */}
                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        <label className="flex items-center gap-1 cursor-pointer text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 px-2 py-1 rounded hover:bg-gray-100">
                          <input type="checkbox" checked={order.isPaid} onChange={e => markOrderPaid(order.id, e.target.checked)} className="w-3.5 h-3.5 accent-green-600 cursor-pointer" />
                          입금
                        </label>
                        <a href={`/invoice/${order.id}`} target="_blank" className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-medium hover:bg-gray-200 border border-gray-200">
                          청구서
                        </a>
                        <button onClick={() => handleSendAlimtalk(order, user?.name || '고객', user?.phone || '')} disabled={sendingAlimtalk === order.id}
                          className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-bold hover:bg-yellow-200 disabled:opacity-50 border border-yellow-200">
                          {sendingAlimtalk === order.id ? '발송중..' : '💬'}
                        </button>
                        <button onClick={() => openEditModal(order)} className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-medium hover:bg-blue-100 border border-blue-200">수정</button>
                        <button onClick={() => {
                          const newAddr = prompt('이 주문건에만 적용할 배송 주소를 입력하세요.\n비워두면 기본 배송지로 복구됩니다.', order.shippingAddress || '');
                          if (newAddr !== null) updateOrderShippingAddress(order.id, newAddr);
                        }} className="bg-sky-50 text-sky-600 px-2 py-1 rounded text-xs font-medium hover:bg-sky-100 border border-sky-200">배송지</button>
                        <button onClick={() => { if (confirm('이 주문을 삭제하시겠습니까? 영구 삭제됩니다.')) deleteOrder(order.id); }}
                          className="bg-red-50 text-red-700 px-2 py-1 rounded text-xs font-medium hover:bg-red-100 border border-red-200">삭제</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

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

      {/* ── 일괄 알림톡 모달 (고객 단위, 중복 제거) ── */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <h3 className="text-xl font-bold mb-1">💬 일괄 알림톡 발송</h3>
            <p className="text-sm text-purple-600 font-medium mb-1">
              {dateFrom && dateTo ? `📅 ${dateFrom} ~ ${dateTo} 기간 기준` : '현재 필터 기준'}
              {' '}— 고객 1명당 합산 청구서 1회 발송
            </p>
            <p className="text-sm text-gray-500 mb-4">
              선택됨: <span className="font-bold text-gray-900">{Object.values(bulkSelection).filter(Boolean).length}명</span> / 전체 {bulkCustomerTargets.length}명
            </p>

            <div className="flex-1 overflow-y-auto mb-4 border border-gray-200 rounded-lg bg-gray-50 min-h-[40vh]">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-100 sticky top-0">
                  <tr>
                    <th className="p-2.5 w-10 text-center">
                      <input type="checkbox"
                        checked={bulkCustomerTargets.length > 0 && Object.values(bulkSelection).every(Boolean)}
                        onChange={e => {
                          const newSel = { ...bulkSelection };
                          bulkCustomerTargets.forEach(t => { newSel[t.userId] = e.target.checked; });
                          setBulkSelection(newSel);
                        }}
                        className="w-4 h-4 accent-yellow-500" />
                    </th>
                    <th className="p-2.5">고객명</th>
                    <th className="p-2.5">연락처</th>
                    <th className="p-2.5 text-center">주문수</th>
                    <th className="p-2.5 text-right">합산금액</th>
                    <th className="p-2.5 text-center">입금상태</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkCustomerTargets.map(({ userId, orders: customerOrders, totalPrice }) => {
                    const user = users.find(u => u.phone === userId || u.nickname === userId);
                    const allPaid = customerOrders.every(o => o.isPaid);
                    return (
                      <tr key={userId} className="border-b last:border-0 hover:bg-white transition-colors">
                        <td className="p-2.5 text-center">
                          <input type="checkbox" checked={!!bulkSelection[userId]}
                            onChange={e => setBulkSelection({ ...bulkSelection, [userId]: e.target.checked })}
                            className="w-4 h-4 accent-yellow-500 cursor-pointer" />
                        </td>
                        <td className="p-2.5">
                          <span className="font-bold">{user?.name || '미등록'}</span>
                          <span className="text-gray-400 text-xs ml-1">({user?.nickname})</span>
                        </td>
                        <td className="p-2.5 text-gray-600 text-xs">{user?.phone || '번호없음'}</td>
                        <td className="p-2.5 text-center">
                          <span className="text-xs bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-full">{customerOrders.length}건</span>
                        </td>
                        <td className="p-2.5 text-right text-sm font-mono font-bold">{totalPrice.toLocaleString()}원</td>
                        <td className="p-2.5 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${allPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {allPaid ? '완료' : '미입금'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {bulkProgress && (
              <div className="mb-4">
                <div className="w-full bg-gray-200 rounded-full h-2 mb-1.5">
                  <div className="bg-yellow-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>진행률: {bulkProgress.current} / {bulkProgress.total}명</span>
                  <span>성공: <span className="text-green-600 font-bold">{bulkProgress.successes}</span> | 실패: <span className="text-red-600 font-bold">{bulkProgress.fails}</span></span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setIsBulkModalOpen(false)} disabled={isBulkSending} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-bold">닫기</button>
              <button onClick={handleBulkSend}
                disabled={isBulkSending || Object.values(bulkSelection).filter(Boolean).length === 0}
                className="px-5 py-2 bg-yellow-400 text-yellow-900 rounded-lg font-bold hover:bg-yellow-500 disabled:opacity-50">
                {isBulkSending ? '발송 중...' : `✔ ${Object.values(bulkSelection).filter(Boolean).length}명에게 발송`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 합산 청구서 숨김 렌더링 영역 (고객 1명 1장) ── */}
      <div style={{ position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -9999 }}>
        {isDownloading && customerGroups.map(({ userId, orders: customerOrders }) => {
          const invoiceData = buildMergedInvoiceData(userId, customerOrders);
          return (
            <div key={userId} id={`invoice-render-customer-${safeId(userId)}`}>
              <InvoiceTemplate data={invoiceData} hideButtons={true} customId={`invoice-capture-customer-${safeId(userId)}`} />
            </div>
          );
        })}
      </div>

    </div>
  );
}
