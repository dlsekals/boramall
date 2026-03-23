"use client";

import { useState } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { useApp, Order, OrderItem } from '../../context/AppContext';
import InvoiceTemplate, { InvoiceData } from '../../components/InvoiceTemplate';

export default function OrderManagementTab() {
  const { orders, users, markOrderPaid, updateOrder, deleteOrder, mergeDuplicateOrders, markOrdersAsExported } = useApp();
  const [filterUnpaid, setFilterUnpaid] = useState(false);
  const [downloadFilter, setDownloadFilter] = useState<'all' | 'paid'>('all'); // Add download filter state
  const [filterOnlyPreparing, setFilterOnlyPreparing] = useState(false);
  const [filterOnlyNotExported, setFilterOnlyNotExported] = useState(true); // 기본적으로 안 뽑은 것만
  const [sortOrder, setSortOrder] = useState<'date_desc' | 'price_desc' | 'price_asc'>('date_desc');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [sendingAlimtalk, setSendingAlimtalk] = useState<string | null>(null);

  // Edit State
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editItems, setEditItems] = useState<OrderItem[]>([]);
  
  // Expand order items State
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
      setExpandedOrders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Hide physically archived orders from the active list
  const activeOrders = orders.filter(o => !o.isArchived);

  // Sorting logic based on sortOrder state
  const sortedOrders = [...activeOrders].sort((a, b) => {
      if (sortOrder === 'price_desc') {
          return b.totalPrice - a.totalPrice;
      } else if (sortOrder === 'price_asc') {
          return a.totalPrice - b.totalPrice;
      }
      return b.id.localeCompare(a.id); // Default Date (ID) Descending: Newest first
  });

  const tempFiltered = filterUnpaid 
    ? sortedOrders.filter(o => !o.isPaid)
    : sortedOrders;

  const filteredOrders = tempFiltered.filter(o => {
    if (!searchQuery) return true;
    const user = users.find(u => u.phone === o.userId || u.nickname === o.userId);
    const term = searchQuery.toLowerCase();
    const matchName = user?.name?.toLowerCase().includes(term);
    const matchNick = user?.nickname?.toLowerCase().includes(term);
    return matchName || matchNick;
  });

  // Group orders purely for visual list display.
  // Iterate through sorted, if user seen, skip. If not seen, add all their orders.
  const groupedOrders: Order[] = [];
  const seenUserIds = new Set<string>();
  
  for (const order of filteredOrders) {
      if (!seenUserIds.has(order.userId)) {
          seenUserIds.add(order.userId);
          // Find all orders for this user in filtered list
          const userOrders = filteredOrders.filter(o => o.userId === order.userId);
          groupedOrders.push(...userOrders);
      }
  }

  const handleAddBulkShippingFee = () => {
      const unpaidOrders = filteredOrders.filter(o => !o.isPaid);
      if (unpaidOrders.length === 0) {
          alert('현재 목록에 조건을 만족하는 미입금 주문이 없습니다.');
          return;
      }
      
      const ordersWithoutShipping = unpaidOrders.filter(o => !o.items.some(item => item.productName === "일괄 택배비"));

      if (ordersWithoutShipping.length === 0) {
          alert('이미 모든 미입금 주문에 일괄 택배비가 청구되어 있습니다.');
          return;
      }
      
      if (!confirm(`현재 보고 계신 목록의 미입금 주문 중, 택배비가 청구되지 않은 총 ${ordersWithoutShipping.length}건에 대해 각각 4,000원의 일괄 택배비를 추가하시겠습니까?`)) return;

      ordersWithoutShipping.forEach(order => {
         const newItems = [...order.items, {
             productName: "일괄 택배비",
             price: 4000,
             quantity: 1,
             purchasePrice: 0,
             isConsignment: false
         }];
         updateOrder(order.id, newItems);
      });
      
      alert(`${ordersWithoutShipping.length}건의 주문에 일괄 택배비 4,000원이 추가되었습니다.`);
  };

  const handleBulkDownload = async () => {
    const ordersToDownload = downloadFilter === 'paid' 
        ? filteredOrders.filter(o => o.isPaid) 
        : filteredOrders;

    if (ordersToDownload.length === 0) {
        alert("다운로드할 주문이 없습니다.");
        return;
    }
    
    setIsDownloading(true);
    const zip = new JSZip();
    const { toPng } = await import('html-to-image');

    try {
        const folder = zip.folder("Invoices");
        await new Promise(r => setTimeout(r, 500)); 

        const originalScrollY = window.scrollY;
        window.scrollTo(0, 0);

        let count = 0;
        for (const order of ordersToDownload) {
            const el = document.getElementById(`invoice-render-${order.id}`);
            if (el) {
                // Prevent duplicate DOM cache bug by using the dual-render pass
                await toPng(el, { cacheBust: true });
                await new Promise(r => setTimeout(r, 50));
                const dataUrl = await toPng(el, { 
                    cacheBust: true, 
                    pixelRatio: 2, 
                    backgroundColor: '#ffffff', 
                    style: { transform: 'scale(1)', transformOrigin: 'top left', width: '672px', maxWidth: '672px' },
                    width: 672, 
                    height: el.scrollHeight 
                });
                const base64Data = dataUrl.split(',')[1];
                const user = users.find(u => u.phone === order.userId || u.nickname === order.userId);
                const displayId = user?.nickname || order.userId;
                const filename = `${user?.name || displayId}_${displayId}_${order.id}_Invoice.png`;
                folder?.file(filename, base64Data, { base64: true });
                count++;
            }
        }

        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `BoraMall_Invoices_${new Date().toISOString().slice(0,10)}.zip`);
        
        window.scrollTo(0, originalScrollY);
        alert(`${count}개의 청구서를 다운로드했습니다.`);

    } catch (e) {
        console.error(e);
        alert("다운로드 중 오류가 발생했습니다.");
    } finally {
        setIsDownloading(false);
    }
  };

  const handleConsignmentExport = async () => {
      // 1. Filter orders for consignment items
      const consignmentData: Record<string, Record<string, string | number>[]> = {}; // Map of vendorName -> array of row data
      
      let hasConsignment = false;

      const ordersToExport = downloadFilter === 'paid' 
          ? filteredOrders.filter(o => o.isPaid) 
          : filteredOrders;

      ordersToExport.forEach(order => {
          const user = users.find(u => u.phone === order.userId || u.nickname === order.userId);
          
          order.items.forEach(item => {
              if (item.isConsignment && item.vendorName) {
                  hasConsignment = true;
                  if (!consignmentData[item.vendorName]) {
                      consignmentData[item.vendorName] = [];
                  }
                  
                  consignmentData[item.vendorName].push({
                      '수취인명': user?.name || '',
                      '전화번호': user?.phone || '',
                      '회원번호(닉네임)': user?.nickname || '',
                      '배송주소': user?.address || '',
                      '상품명': item.productName,
                      '수량': item.quantity,
                      '주문일시': order.createdAt,
                      '입금상태': order.isPaid ? '입금완료' : '미입금'
                  });
              }
          });
      });

      if (!hasConsignment) {
          alert("현재 보기 목록에 위탁 배송 상품 주문이 없습니다.");
          return;
      }

      setIsDownloading(true);
      try {
          const zip = new JSZip();
          const folder = zip.folder("업체별_발주서");

          // For each vendor, create a CSV file and add to ZIP
          Object.keys(consignmentData).forEach(vendor => {
              const rows = consignmentData[vendor];
              const header = Object.keys(rows[0]).join(',');
              const csvContent = "\uFEFF" + header + "\n" + rows.map(row => {
                  return Object.values(row).map(v => {
                      const str = String(v).replace(/"/g, '""');
                      return `"${str}"`;
                  }).join(',');
              }).join('\n');
              
              folder?.file(`${vendor}_발주서.csv`, csvContent);
          });

          const content = await zip.generateAsync({ type: "blob" });
          saveAs(content, `위탁_발주서_${new Date().toISOString().slice(0,10)}.zip`);
          alert(`${Object.keys(consignmentData).length}개 업체의 발주서 다운로드가 완료되었습니다.`);

      } catch (e) {
          console.error(e);
          alert("발주서 다운로드 중 오류가 발생했습니다.");
      } finally {
          setIsDownloading(false);
      }
  };

  const handleLotteExcelDownload = () => {
      // 1. Filter out orders that ONLY contain consignment items. (We only ship non-consignment items)
      // 2. 강제로 입금 완료(isPaid === true)된 주문만 추출하도록 고정합니다. 택배 발송은 입금된 건만 진행하기 때문입니다.
      // 3. '배송준비중만' 체크 박스가 켜져있다면, 다른 상태(예: 배송중, 완료, 취소 등)는 제외합니다.
      // 4. '미추출건만' 필터가 켜져있다면 이미 엑셀로 뽑은 내역은 제외합니다.
      const ordersToExport = filteredOrders
          .filter(o => o.isPaid)
          .filter(o => filterOnlyPreparing ? (!o.deliveryStatus || o.deliveryStatus === '배송준비중') : true)
          .filter(order => order.items.some(item => !item.isConsignment))
          .filter(o => filterOnlyNotExported ? !o.isExportedToExcel : true);
      
      if (ordersToExport.length === 0) {
          alert(`다운로드할 택배 배송건(위탁제외)이 없습니다.${filterOnlyPreparing || filterOnlyNotExported ? "\n(현재 필터링 조건에 의해 발송 처리되었거나 이미 엑셀로 추출된 건이 제외되었을 수 있습니다.)" : ""}`);
          return;
      }
      
      if (!confirm(`총 ${ordersToExport.length}건의 신규 배송 엑셀을 다운로드합니다.\n다운로드 후 해당 건들은 '추출 완료' 상태로 변경되어 다음 다운로드 시 자동으로 제외됩니다.\n\n진행하시겠습니까?`)) {
          return;
      }

      const headers = [
          "주문번호", "보내는사람(지정)", "전화번호1(지정)", "전화번호2(지정)", "우편번호(지정)", "주소(지정)", 
          "받는사람", "전화번호1", "전화번호2", "우편번호", "주소", 
          "상품명1", "상품상세1", "수량(A타입)", "배송메시지", "운임구분", "운임", "운송장번호"
      ];

      let orderNum = 1;
      const csvRows = ordersToExport.map(order => {
          const user = users.find(u => u.phone === order.userId || u.nickname === order.userId);
          
          // 위탁 아닌 메인 상품 1개 찾기
          const normalItems = order.items.filter(item => !item.isConsignment);
          let productName = normalItems.length > 0 ? normalItems[0].productName : "";
          if (normalItems.length > 1) {
              productName += ` 외 ${normalItems.length - 1}건`;
          }

          const row = [
              orderNum++,               // A: 주문번호
              "보라몰",                   // B: 보내는사람(지정)
              "",                       // C: 전화번호1(지정)
              "",                       // D: 전화번호2(지정)
              "",                       // E: 우편번호(지정)
              "",                       // F: 주소(지정)
              user?.name || "",         // G: 받는사람
              user?.phone || "",        // H: 전화번호1
              "",                       // I: 전화번호2
              "",                       // J: 우편번호 (일단 빈칸으로 둠 - 주소에 통계)
              user?.address || "",      // K: 주소
              productName,              // L: 상품명1
              "",                       // M: 상품상세1
              1,                        // N: 수량(A타입) - 빈칸 시 롯데택배 시스템 오류 발생하므로 기본값 1 입력 (어차피 내품 수량이 아님)
              "",                       // O: 배송메시지
              "",                       // P: 운임구분
              "",                       // Q: 운임
              ""                        // R: 운송장번호
          ];
          return row;
      });

      // Create worksheet and workbook
      const wsData = [headers, ...csvRows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      
      // Force "수량(A타입)" (column N, index 13) to be treated strictly as numeric
      // Not strictly necessary as we passed number `1`, but good for safety
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "롯데택배_발송목록");
      
      // Generate Excel file buffer
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
      
      saveAs(data, `롯데택배_발송목록_${new Date().toISOString().slice(0,10)}.xlsx`);
      
      // Update exported status
      markOrdersAsExported(ordersToExport.map(o => o.id));
  };

  const handleSendAlimtalk = async (order: Order, userName: string, userPhone: string) => {
      if (!userPhone) {
          alert("고객 전화번호가 없습니다. 알림톡을 발송할 수 없습니다.");
          return;
      }
      if (!confirm(`${userName} 님에게 알림톡 청구서를 발송하시겠습니까?`)) return;

      setSendingAlimtalk(order.id);
      try {
          const res = await fetch('/api/alimtalk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  orderId: order.id,
                  name: userName,
                  phone: userPhone,
                  totalPrice: order.totalPrice
              })
          });
          const data = await res.json();
          if (data.success) {
              alert("알림톡 발송 성공!");
          } else {
              alert("알림톡 발송 실패: " + data.error);
          }
      } catch (err) {
          alert("알림톡 발송 중 오류가 발생했습니다.");
          console.error(err);
      } finally {
          setSendingAlimtalk(null);
      }
  };

  const openEditModal = (order: Order) => {
      setEditingOrder(order);
      // Deep copy items to avoid mutating state directly
      setEditItems(order.items.map((i: OrderItem) => ({ ...i })));
  };

  const handleSaveEdit = () => {
      // ... existing code ...
      if (editingOrder) {
          updateOrder(editingOrder.id, editItems);
          setEditingOrder(null);
          setEditItems([]);
      }
  };

  const updateItemQty = (index: number, change: number) => {
      // ... existing code ...
      const newItems = [...editItems];
      const item = newItems[index];
      const newQty = item.quantity + change;
      
      if (newQty <= 0) {
          if (confirm(`${item.productName}을(를) 주문에서 삭제하시겠습니까?`)) {
              newItems.splice(index, 1);
          }
      } else {
          item.quantity = newQty;
      }
      setEditItems(newItems);
  };

  // --- Statistics Calculations ---
  // Ensure we use only activeOrders here as well, so the top stats reflect the current list
  const totalOrders = activeOrders.length;
  const totalRevenue = activeOrders.reduce((sum, order) => sum + order.totalPrice, 0);
  
  const paidOrders = activeOrders.filter(o => o.isPaid);
  const paidCount = paidOrders.length;
  const paidTotal = paidOrders.reduce((sum, order) => sum + order.totalPrice, 0);
  
  const unpaidOrders = activeOrders.filter(o => !o.isPaid);
  const unpaidCount = unpaidOrders.length;
  const unpaidTotal = unpaidOrders.reduce((sum, order) => sum + order.totalPrice, 0);

  const paidRate = totalRevenue > 0 ? ((paidTotal / totalRevenue) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      
      {/* Top Stats Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded shadow-sm border-l-4 border-[#673ab7]">
              <h2 className="text-gray-500 text-sm font-medium mb-1">총 매출 (총 {totalOrders}건)</h2>
              <p className="text-2xl font-bold text-[#673ab7]">
                  {totalRevenue.toLocaleString()}원
              </p>
          </div>
          
          <div className="bg-white p-4 rounded shadow-sm border-l-4 border-green-500 relative">
              <h2 className="text-gray-500 text-sm font-medium mb-1">총 입금액 (총 {paidCount}건)</h2>
              <p className="text-2xl font-bold text-green-600">
                  {paidTotal.toLocaleString()}원
              </p>
              <div className="absolute top-4 right-4 text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">
                  입금률 {paidRate}%
              </div>
          </div>
          
          <div className="bg-white p-4 rounded shadow-sm border-l-4 border-yellow-500">
              <h2 className="text-gray-500 text-sm font-medium mb-1">미입금액 (총 {unpaidCount}건)</h2>
              <p className="text-2xl font-bold text-yellow-600">
                  {unpaidTotal.toLocaleString()}원
              </p>
          </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col xl:flex-row justify-between xl:items-center bg-white p-4 rounded shadow-sm gap-4">
        {/* Left Controls: Checkboxes & Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                    type="checkbox" 
                    checked={filterUnpaid} 
                    onChange={(e) => setFilterUnpaid(e.target.checked)}
                    className="w-5 h-5 accent-[#673ab7]"
                />
                <span className="font-bold text-gray-700 whitespace-nowrap">미입금 (보기)</span>
            </label>
            <div className="h-4 sm:h-6 w-px bg-gray-300 mx-1 hidden sm:block"></div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                    type="checkbox" 
                    checked={filterOnlyPreparing} 
                    onChange={(e) => setFilterOnlyPreparing(e.target.checked)}
                    className="w-5 h-5 accent-blue-500"
                />
                <span className="font-bold text-gray-700 whitespace-nowrap" title="체크 시 엑셀 다운로드에서 '배송중/완료'된 예전 주문을 제외합니다.">📦 배송준비중만</span>
            </label>
            <div className="h-4 sm:h-6 w-px bg-gray-300 mx-1 hidden sm:block"></div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                    type="checkbox" 
                    checked={filterOnlyNotExported} 
                    onChange={(e) => setFilterOnlyNotExported(e.target.checked)}
                    className="w-5 h-5 accent-[#da291c]"
                />
                <span className="font-bold text-gray-700 whitespace-nowrap" title="체크 시 이전에 이미 엑셀로 뽑았던 주문은 제외하고 새 주문만 뽑습니다.">🌟 미추출 신규건만</span>
            </label>
            <div className="h-4 sm:h-6 w-px bg-gray-300 mx-1 hidden sm:block"></div>
            <div className="flex items-center gap-2 mt-2 sm:mt-0">
                <span className="text-sm font-bold text-gray-600 whitespace-nowrap">다운로드 대상:</span>
                <select 
                    value={downloadFilter} 
                    onChange={(e) => setDownloadFilter(e.target.value as 'all' | 'paid')}
                    className="border border-gray-300 rounded p-1 text-sm font-bold text-gray-700 bg-gray-50 focus:ring-1 focus:ring-[#673ab7] outline-none"
                >
                    <option value="all">전체 (목록 기준)</option>
                    <option value="paid">✅ 입금완료건만</option>
                </select>
            </div>
            
            <div className="flex items-center gap-2 mt-2 sm:mt-0 w-full sm:w-auto flex-1 max-w-xs">
                <input 
                    type="text" 
                    placeholder="🔍 이름, 닉네임 검색..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:ring-[#673ab7] focus:border-[#673ab7] outline-none"
                />
            </div>
        </div>
        
        {/* Right Controls: Action Buttons */}
        <div className="flex flex-wrap justify-start xl:justify-end gap-2 w-full xl:w-auto">
            <button 
                onClick={handleAddBulkShippingFee}
                className="bg-indigo-100 text-indigo-700 font-bold px-3 py-2 sm:px-4 rounded hover:bg-indigo-200 border border-indigo-200 shadow-sm flex items-center justify-center gap-1 sm:gap-2 text-sm sm:text-base flex-1 sm:flex-none"
            >
                💸 일괄 택배비
            </button>
            <button 
                onClick={() => {
                    const result = mergeDuplicateOrders();
                    alert(result.message);
                }}
                className="bg-orange-100 text-orange-700 font-bold px-3 py-2 sm:px-4 rounded hover:bg-orange-200 border border-orange-200 shadow-sm flex items-center justify-center gap-1 sm:gap-2 text-sm sm:text-base flex-1 sm:flex-none"
            >
                🔄 동일인 합치기
            </button>
            <button 
                onClick={handleConsignmentExport}
                disabled={isDownloading || filteredOrders.length === 0}
                className="bg-teal-600 text-white px-3 py-2 sm:px-4 rounded font-bold hover:bg-teal-700 disabled:bg-gray-400 flex items-center justify-center gap-1 sm:gap-2 shadow-sm text-sm sm:text-base flex-1 sm:flex-none"
            >
                {isDownloading ? '처리 중...' : '🚚 위탁 발주서'}
            </button>
            <button 
                onClick={handleLotteExcelDownload}
                disabled={isDownloading || filteredOrders.length === 0}
                className="bg-[#da291c] text-white px-3 py-2 sm:px-4 rounded font-bold hover:bg-[#b01c13] disabled:bg-gray-400 flex items-center justify-center gap-1 sm:gap-2 shadow-sm text-sm sm:text-base flex-1 sm:flex-none"
            >
                📦 롯데택배 엑셀
            </button>
            <button 
                onClick={handleBulkDownload}
                disabled={isDownloading || filteredOrders.length === 0}
                className="bg-[#673ab7] text-white px-3 py-2 sm:px-4 rounded font-bold hover:bg-[#5e35b1] disabled:bg-gray-400 flex items-center justify-center gap-1 sm:gap-2 shadow-sm text-sm sm:text-base flex-1 sm:flex-none"
            >
                {isDownloading ? '생성 중...' : '📥 청구서 다운'}
            </button>
        </div>
      </div>

      {/* Order List */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-base">
                <thead className="bg-gray-50 text-gray-500 font-medium border-b">
                    <tr>
                        <th className="py-0.5 px-1 sm:py-1 sm:px-4 w-10 sm:w-20 text-center whitespace-nowrap">상태</th>
                        <th className="py-0.5 px-1 sm:py-1 sm:px-4 whitespace-nowrap">구매자</th>
                        <th className="py-0.5 px-1 sm:py-1 sm:px-4 whitespace-nowrap min-w-[120px]">내역</th>
                        <th className="py-0.5 px-1 sm:py-1 sm:px-4 text-right whitespace-nowrap">
                            <button 
                                onClick={() => {
                                    if (sortOrder === 'date_desc') setSortOrder('price_desc');
                                    else if (sortOrder === 'price_desc') setSortOrder('price_asc');
                                    else setSortOrder('date_desc');
                                }}
                                className="flex items-center justify-end w-full gap-1 hover:text-gray-700 transition-colors focus:outline-none"
                                title="금액순 정렬"
                            >
                                금액
                                <span className="text-xs text-gray-400">
                                    {sortOrder === 'price_desc' && '▼'}
                                    {sortOrder === 'price_asc' && '▲'}
                                    {sortOrder === 'date_desc' && '↕'}
                                </span>
                            </button>
                        </th>
                        <th className="py-0.5 px-1 sm:py-1 sm:px-4 text-center whitespace-nowrap">입금</th>
                        <th className="py-0.5 px-1 sm:py-1 sm:px-4 text-center whitespace-nowrap">관리</th>
                    </tr>
                </thead>
                <tbody className="divide-y relative">
                    {groupedOrders.length === 0 ? (
                        <tr><td colSpan={6} className="p-8 text-center text-gray-500">주문 내역이 없습니다.</td></tr>
                    ) : groupedOrders.map((order, index) => {
                        const user = users.find(u => u.phone === order.userId || u.nickname === order.userId);
                        
                        // Check if this is a consecutive order from the same user to visually group them
                        const isConsecutiveSameUser = index > 0 && groupedOrders[index-1].userId === order.userId;
                        
                        return (
                            <tr key={order.id} className={`${order.isPaid ? 'bg-green-50' : 'bg-white'} ${isConsecutiveSameUser ? 'border-t-0 bg-gray-50/50' : ''} hover:bg-gray-50 transition-colors`}>
                                <td className="py-0.5 px-1 sm:py-1 sm:px-4 text-center">
                                    <span className={`px-1 py-0.5 sm:px-3 sm:py-0.5 rounded text-[10px] sm:text-sm font-bold whitespace-nowrap ${order.isPaid ? 'bg-green-200 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                        {order.isPaid ? '완료' : '대기'}
                                    </span>
                                </td>
                                <td className="py-0.5 px-1 sm:py-1 sm:px-4 whitespace-nowrap min-w-[100px]">
                                    <div className="flex flex-col">
                                        <div>
                                            <span className="font-bold">{user?.name || '미등록'}</span>
                                            <span className="text-xs sm:text-sm text-gray-500 ml-1">({user?.nickname || order.userId})</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 h-4">
                                            {user?.phone && (
                                                <span className="text-[11px] sm:text-xs text-gray-600 font-medium tracking-tight">
                                                    📞 {user.phone}
                                                </span>
                                            )}
                                            {/* Display Order Date right below the name */}
                                            <span className="text-[10px] sm:text-xs text-blue-600 font-medium border-l border-gray-300 pl-2 h-3 leading-3 flex items-center">
                                               구매일: {order.createdAt?.split(' ')[0] || '-'}
                                            </span>
                                        </div>
                                        {order.isPaid && (
                                            <div className="flex flex-wrap items-center gap-1 mt-1">
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm border ${
                                                    order.deliveryStatus === '배송중' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                    order.deliveryStatus === '배송완료' ? 'bg-gray-100 text-gray-700 border-gray-200' :
                                                    ['취소완료', '반품요청', '반품완료', '교환요청', '교환완료'].includes(order.deliveryStatus || '') ? 'bg-red-50 text-red-700 border-red-200' :
                                                    'bg-amber-50 text-amber-700 border-amber-200' // default 배송준비중
                                                }`}>
                                                    {order.deliveryStatus || '배송준비중'}
                                                </span>
                                                {order.trackingNumber && <span className="text-[10px] text-gray-500 font-mono select-all tracking-tighter sm:tracking-normal">({order.trackingNumber})</span>}
                                            </div>
                                         )}
                                     </div>
                                </td>
                                <td className="py-0.5 px-1 sm:py-1 sm:px-4">
                                    <button 
                                        onClick={() => toggleExpand(order.id)}
                                        className="text-xs sm:text-sm text-gray-700 font-bold bg-white px-2 py-0.5 border border-gray-300 rounded shadow-sm hover:bg-gray-50 flex items-center gap-1"
                                    >
                                        🛒 구매내역 {expandedOrders[order.id] ? '▲' : '▼'}
                                    </button>
                                    {expandedOrders[order.id] && (
                                        <ul className="mt-1 text-xs sm:text-sm text-gray-600 space-y-0.5 bg-gray-50 p-2 rounded border border-gray-200 shadow-inner inline-block">
                                            {order.items.map((item, idx) => (
                                                <li key={idx} className="whitespace-nowrap flex justify-between gap-4">
                                                    <span>{item.productName}</span>
                                                    <span className="text-gray-500 font-medium">x{item.quantity}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </td>
                                <td className="py-0.5 px-1 sm:py-1 sm:px-4 text-right font-mono font-bold whitespace-nowrap text-xs sm:text-base">
                                    {order.totalPrice.toLocaleString()}
                                </td>
                                <td className="py-0.5 px-1 sm:py-1 sm:px-4 text-center">
                                    <input 
                                        type="checkbox"
                                        checked={order.isPaid}
                                        onChange={(e) => markOrderPaid(order.id, e.target.checked)}
                                        className="w-4 h-4 sm:w-5 sm:h-5 accent-green-600 cursor-pointer"
                                    />
                                </td>
                                <td className="py-0.5 px-1 sm:py-1 sm:px-4 text-center space-x-1 sm:space-x-2 whitespace-nowrap">
                                    {order.isExportedToExcel && (
                                        <span className="inline-block bg-pink-100 text-pink-700 px-1 py-0.5 sm:px-2 sm:py-1.5 rounded text-[10px] sm:text-xs font-bold mr-1">
                                            ✓ 추출됨
                                        </span>
                                    )}
                                    <a 
                                        href={`/invoice/${order.id}`} 
                                        target="_blank" 
                                        className="inline-block bg-gray-100 text-gray-700 px-1 py-0.5 sm:px-3 sm:py-1.5 rounded text-[10px] sm:text-sm font-medium hover:bg-gray-200"
                                    >
                                        청구서
                                    </a>
                                    <button
                                        onClick={() => handleSendAlimtalk(order, user?.name || '고객', user?.phone || '')}
                                        disabled={sendingAlimtalk === order.id}
                                        className="bg-yellow-100 text-yellow-800 px-1 py-0.5 sm:px-3 sm:py-1.5 rounded text-[10px] sm:text-sm font-bold hover:bg-yellow-200 disabled:opacity-50"
                                    >
                                        {sendingAlimtalk === order.id ? '발송중..' : '💬 알림톡'}
                                    </button>
                                    <button
                                        onClick={() => openEditModal(order)}
                                        className="bg-blue-100 text-blue-700 px-1 py-0.5 sm:px-3 sm:py-1.5 rounded text-[10px] sm:text-sm font-medium hover:bg-blue-200"
                                    >
                                        수정
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (confirm('정말로 이 주문을 삭제하시겠습니까? 관련 입금 상태 및 내역이 모두 영구히 삭제됩니다.')) {
                                                deleteOrder(order.id);
                                            }
                                        }}
                                        className="bg-red-100 text-red-700 px-1 py-0.5 sm:px-3 sm:py-1.5 rounded text-[10px] sm:text-sm font-medium hover:bg-red-200"
                                    >
                                        삭제
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingOrder && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white p-6 rounded-lg max-w-lg w-full">
                  <h3 className="text-xl font-bold mb-4">주문 수정 ({editingOrder.userId})</h3>
                  
                  <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                      {editItems.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center border p-2 rounded">
                              <span className="font-medium">{item.productName}</span>
                              <div className="flex items-center gap-2">
                                  <button onClick={() => updateItemQty(idx, -1)} className="w-8 h-8 bg-gray-200 rounded hover:bg-gray-300 font-bold">-</button>
                                  <span className="w-8 text-center">{item.quantity}</span>
                                  <button onClick={() => updateItemQty(idx, 1)} className="w-8 h-8 bg-gray-200 rounded hover:bg-gray-300 font-bold">+</button>
                              </div>
                          </div>
                      ))}
                      {editItems.length === 0 && (
                          <p className="text-red-500 text-center py-4">모든 항목이 삭제되었습니다. 저장 시 주문이 삭제됩니다.</p>
                      )}
                  </div>

                  <div className="flex justify-end gap-2">
                      <button 
                          onClick={() => setEditingOrder(null)}
                          className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                      >
                          취소
                      </button>
                      <button 
                          onClick={handleSaveEdit}
                          className="px-4 py-2 bg-[#673ab7] text-white rounded font-bold hover:bg-[#5e35b1]"
                      >
                          저장 (Save)
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Hidden Render Area for Bulk Download */}
      <div style={{ position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -9999 }}>
        {isDownloading && filteredOrders.map(order => {
             // ... [Keeping existing render logic] ...
             const user = users.find(u => u.phone === order.userId || u.nickname === order.userId);
             if (!user) return null;
            
            const data: InvoiceData = {
                customerName: user.name,
                customerPhone: user.phone,
                customerNickname: user.nickname,
                address: user.address,
                date: order.createdAt,
                items: order.items.map(i => ({
                    name: i.productName, quantity: i.quantity, price: i.price
                })),
                totalPrice: order.totalPrice,
                bankName: "새마을금고",
                accountNumber: "010-6269-9612",
                accountHolder: "보라몰",
                isPaid: order.isPaid
            };

            return (
                <div key={order.id} id={`invoice-render-${order.id}`}>
                    <InvoiceTemplate data={data} hideButtons={true} customId={`invoice-capture-${order.id}`} />
                </div>
            );
        })}
      </div>

    </div>
  );
}
