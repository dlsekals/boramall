"use client";

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { useApp, Order, OrderItem } from '../../context/AppContext';

export default function OrderItemStatusTab() {
    const { orders, users } = useApp();
    
    const [viewMode, setViewMode] = useState<'active' | 'today' | 'yesterday' | 'all'>('active');
    const [customerSearch, setCustomerSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');

    const todayStr = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

    // 1. Filter Orders by View Mode
    const filteredOrders = orders.filter(order => {
        if (viewMode === 'active') {
            return !order.isArchived;
        } else if (viewMode === 'today') {
            return order.createdAt.startsWith(todayStr);
        } else if (viewMode === 'yesterday') {
            return order.createdAt.startsWith(yesterdayStr);
        }
        return true; // 'all'
    });

    // 2. Extract all items with user info
    let allItems: { user: string; nickname: string; phone: string; productName: string; quantity: number; orderDate: string }[] = [];
    
    filteredOrders.forEach(order => {
        const user = users.find(u => u.phone === order.userId || u.nickname === order.userId);
        const name = user?.name || '미등록';
        const nickname = user?.nickname || order.userId;
        const phone = user?.phone || '';

        order.items.forEach(item => {
            // Ignore shipping fee if it's not a real product, but usually it is "일괄 택배비"
            // We might want to keep it or filter it. Let's keep it but they can visually ignore it.
            allItems.push({
                user: name,
                nickname: nickname,
                phone: phone,
                productName: item.productName,
                quantity: item.quantity,
                orderDate: order.createdAt
            });
        });
    });

    // 3. Apply Search Filters
    if (customerSearch) {
        const term = customerSearch.toLowerCase();
        allItems = allItems.filter(i => 
            i.user.toLowerCase().includes(term) || 
            i.nickname.toLowerCase().includes(term) || 
            i.phone.includes(term)
        );
    }

    if (productSearch) {
        const term = productSearch.toLowerCase();
        allItems = allItems.filter(i => 
            i.productName.toLowerCase().includes(term)
        );
    }

    // 4. Group data for display based on search mode
    
    // Default View: Group by Product Name (Total Quantities)
    // When no specific customer/product search is active, show the aggregated product stats
    const displayMode = (customerSearch && !productSearch) ? 'byCustomer' : (productSearch && !customerSearch) ? 'byProduct' : (customerSearch && productSearch) ? 'list' : 'summary';

    let summaryData: { productName: string; totalQuantity: number }[] = [];
    if (displayMode === 'summary') {
        const map: Record<string, number> = {};
        allItems.forEach(i => {
            map[i.productName] = (map[i.productName] || 0) + i.quantity;
        });
        summaryData = Object.entries(map).map(([name, qty]) => ({ productName: name, totalQuantity: qty }));
        summaryData.sort((a, b) => b.totalQuantity - a.totalQuantity);
    }

    const handleExcelDownload = () => {
        if (summaryData.length === 0 && allItems.length === 0) {
            alert('다운로드할 데이터가 없습니다.');
            return;
        }

        const wb = XLSX.utils.book_new();
        
        let ws: XLSX.WorkSheet;
        const fileNameSuffix = viewMode === 'active' ? '현재진행중' : viewMode === 'today' ? '오늘' : viewMode === 'yesterday' ? '어제' : '전체기록';

        if (displayMode === 'summary') {
            // Summary Excel: Product Name, Total Quantity
            const rows = summaryData.map(d => ({
                "상품명": d.productName,
                "총 판매수량": d.totalQuantity
            }));
            ws = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, "품목별_총수량");
        } else {
            // List Excel for searches
            const rows = allItems.map(d => ({
                "고객명": d.user,
                "닉네임/ID": d.nickname,
                "연락처": d.phone,
                "상품명": d.productName,
                "수량": d.quantity,
                "주문일시": d.orderDate
            }));
            ws = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, "상세_내역");
        }

        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
        saveAs(data, `주문물품현황_${fileNameSuffix}_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    return (
        <div className="space-y-6">
            {/* Control Panel */}
            <div className="bg-white p-4 rounded shadow-sm flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
                
                {/* View Mode */}
                <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-700 whitespace-nowrap text-sm">조회 기준:</span>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button
                            onClick={() => setViewMode('active')}
                            className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded transition-colors ${viewMode === 'active' ? 'bg-white shadow text-[#673ab7]' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            📍 진행중(활성)
                        </button>
                        <button
                            onClick={() => setViewMode('today')}
                            className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded transition-colors ${viewMode === 'today' ? 'bg-white shadow text-[#673ab7]' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            📅 오늘
                        </button>
                        <button
                            onClick={() => setViewMode('yesterday')}
                            className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded transition-colors ${viewMode === 'yesterday' ? 'bg-white shadow text-[#673ab7]' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            📅 어제
                        </button>
                        <button
                            onClick={() => setViewMode('all')}
                            className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded transition-colors ${viewMode === 'all' ? 'bg-white shadow text-[#673ab7]' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            전체 내역
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="flex flex-col sm:flex-row gap-2">
                    <input 
                        type="text" 
                        placeholder="🔍 고객명/닉네임 검색..." 
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="border border-gray-300 rounded px-3 py-2 text-sm w-full sm:w-48 focus:ring-[#673ab7] focus:border-[#673ab7] outline-none"
                    />
                    <input 
                        type="text" 
                        placeholder="🔍 품목명 검색..." 
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="border border-gray-300 rounded px-3 py-2 text-sm w-full sm:w-48 focus:ring-[#673ab7] focus:border-[#673ab7] outline-none"
                    />
                </div>

                <div className="flex justify-end shrink-0">
                    <button 
                        onClick={handleExcelDownload}
                        className="bg-green-600 text-white font-bold px-4 py-2 rounded shadow-sm hover:bg-green-700 transition flex items-center justify-center gap-2 text-sm"
                    >
                        <span>⬇️ 엑셀 다운로드</span>
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                    <h2 className="font-bold text-gray-800 flex items-center gap-2">
                        {displayMode === 'summary' && <span>📊 품목별 총 판매 현황</span>}
                        {displayMode === 'byCustomer' && <span>👤 특정 고객 구매 내역</span>}
                        {displayMode === 'byProduct' && <span>📦 특정 품목 구매자 목록</span>}
                        {displayMode === 'list' && <span>📋 상세 검색 결과</span>}
                    </h2>
                    <span className="text-sm font-medium text-purple-700 bg-purple-100 px-2 py-1 rounded">
                        {displayMode === 'summary' 
                            ? `총 ${summaryData.length}개 품목 판매됨` 
                            : `검색된 총 수량: ${allItems.reduce((sum, item) => sum + item.quantity, 0)}개 (주문 ${allItems.length}건)`}
                    </span>
                </div>

                <div className="overflow-x-auto">
                    {displayMode === 'summary' ? (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-100 text-gray-600 border-b">
                                <tr>
                                    <th className="py-2 px-4 w-16 text-center">순위</th>
                                    <th className="py-2 px-4">상품명</th>
                                    <th className="py-2 px-4 text-center">총 판매 수량</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {summaryData.length === 0 ? (
                                    <tr><td colSpan={3} className="text-center py-8 text-gray-500">데이터가 없습니다.</td></tr>
                                ) : summaryData.map((item, index) => (
                                    <tr key={item.productName} className="hover:bg-gray-50 transition-colors">
                                        <td className="py-2 px-4 text-center font-bold text-gray-500">{index + 1}</td>
                                        <td className="py-2 px-4 font-bold text-gray-800">{item.productName}</td>
                                        <td className="py-2 px-4 text-center">
                                            <span className="inline-block bg-purple-100 text-purple-800 rounded px-3 py-1 font-bold">
                                                {item.totalQuantity}개
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-100 text-gray-600 border-b">
                                <tr>
                                    <th className="py-2 px-4">고객명 (ID)</th>
                                    <th className="py-2 px-4">주문 상품</th>
                                    <th className="py-2 px-4 text-center w-24">수량</th>
                                    <th className="py-2 px-4 text-center hidden sm:table-cell">주문일시</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {allItems.length === 0 ? (
                                    <tr><td colSpan={4} className="text-center py-8 text-gray-500">검색 결과가 없습니다.</td></tr>
                                ) : allItems.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()).map((item, index) => (
                                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                                        <td className="py-2 px-4">
                                            <div className="font-bold text-gray-800">{item.user}</div>
                                            <div className="text-xs text-gray-500">{item.nickname}</div>
                                        </td>
                                        <td className="py-2 px-4 font-bold text-[#673ab7]">{item.productName}</td>
                                        <td className="py-2 px-4 text-center">
                                            <span className="inline-block bg-gray-200 text-gray-800 rounded px-2 py-0.5 font-bold">
                                                {item.quantity}
                                            </span>
                                        </td>
                                        <td className="py-2 px-4 text-center hidden sm:table-cell text-xs text-gray-500">
                                            {item.orderDate}
                                        </td>
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
