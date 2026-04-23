"use client";

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { useApp } from '../../context/AppContext';

export default function OrderItemStatusTab() {
    const { orders, users, products } = useApp();
    
    const [viewMode, setViewMode] = useState<'active' | 'today' | 'yesterday' | 'custom' | 'all'>('active');
    const [customStartDate, setCustomStartDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [customEndDate, setCustomEndDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [productSearch, setProductSearch] = useState('');
    const [sortBy, setSortBy] = useState<'quantity' | 'profit'>('quantity');
    const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

    const todayStr = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

    // Date parser for "YYYY. M. D. ..." format
    const parseKoreanDate = (str: string) => {
        const match = str.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
        if (match) {
            return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
        }
        return new Date(str);
    };

    // 1. Filter Orders by View Mode
    const filteredOrders = orders.filter(order => {
        if (viewMode === 'active') {
            return !order.isArchived;
        } else if (viewMode === 'today') {
            return order.createdAt.startsWith(todayStr);
        } else if (viewMode === 'yesterday') {
            return order.createdAt.startsWith(yesterdayStr);
        } else if (viewMode === 'custom' && customStartDate && customEndDate) {
            const startObj = new Date(customStartDate);
            startObj.setHours(0, 0, 0, 0);
            const endObj = new Date(customEndDate);
            endObj.setHours(23, 59, 59, 999);
            
            const orderDateObj = parseKoreanDate(order.createdAt);
            if (!isNaN(orderDateObj.getTime())) {
                return orderDateObj >= startObj && orderDateObj <= endObj;
            }
            return false;
        }
        return true; // 'all'
    });

    // 2. Extract all items with user info
    let allItems: { user: string; nickname: string; phone: string; productName: string; quantity: number; orderDate: string; price: number; purchasePrice: number }[] = [];
    
    filteredOrders.forEach(order => {
        const user = users.find(u => u.phone === order.userId || u.nickname === order.userId);
        const name = user?.name || '미등록';
        const nickname = user?.nickname || order.userId;
        const phone = user?.phone || '';

        order.items.forEach(item => {
            const currentProduct = products.find(p => p.name === item.productName);
            const actualPurchasePrice = item.purchasePrice || currentProduct?.purchasePrice || 0;

            allItems.push({
                user: name,
                nickname: nickname,
                phone: phone,
                productName: item.productName,
                quantity: item.quantity,
                orderDate: order.createdAt,
                price: item.price,
                purchasePrice: actualPurchasePrice
            });
        });
    });

    // 3. Apply Product Search Filter
    if (productSearch) {
        const term = productSearch.toLowerCase();
        allItems = allItems.filter(i => 
            i.productName.toLowerCase().includes(term)
        );
    }

    // 4. Aggregate Data per Product
    type BuyerInfo = { name: string; nickname: string; qty: number };
    const map: Record<string, { totalQuantity: number, totalRevenue: number, totalProfit: number, missingCost: boolean, buyers: BuyerInfo[] }> = {};
    
    allItems.forEach(i => {
        if (!map[i.productName]) {
            map[i.productName] = {
                totalQuantity: 0,
                totalRevenue: 0,
                totalProfit: 0,
                missingCost: false,
                buyers: []
            };
        }
        
        map[i.productName].totalQuantity += i.quantity;
        map[i.productName].totalRevenue += (i.quantity * i.price);
        
        if (i.purchasePrice === 0 || !i.purchasePrice) {
            map[i.productName].missingCost = true;
        } else {
            map[i.productName].totalProfit += i.quantity * (i.price - i.purchasePrice);
        }
        
        // Aggregate buyers
        const existingBuyer = map[i.productName].buyers.find(b => b.nickname === i.nickname);
        if (existingBuyer) {
            existingBuyer.qty += i.quantity;
        } else {
            map[i.productName].buyers.push({
                name: i.user,
                nickname: i.nickname,
                qty: i.quantity
            });
        }
    });

    let summaryData = Object.entries(map).map(([name, data]) => {
        const currentProduct = products.find(p => p.name === name);
        return {
            productName: name,
            totalQuantity: data.totalQuantity,
            remainingStock: currentProduct ? currentProduct.stock : 0,
            totalRevenue: data.totalRevenue,
            totalProfit: data.totalProfit,
            missingCost: data.missingCost,
            buyers: data.buyers.sort((a,b) => b.qty - a.qty) // sort internal buyers by qty desc
        };
    });

    // Sort summaryData based on SortBy State
    summaryData.sort((a, b) => {
        if (sortBy === 'profit') {
            return b.totalProfit - a.totalProfit;
        }
        return b.totalQuantity - a.totalQuantity; // fallback to quantity
    });

    const handleExcelDownload = () => {
        if (summaryData.length === 0) {
            alert('다운로드할 데이터가 없습니다.');
            return;
        }

        const wb = XLSX.utils.book_new();
        const fileNameSuffix = viewMode === 'active' ? '현재진행중' : viewMode === 'today' ? '오늘' : viewMode === 'yesterday' ? '어제' : viewMode === 'custom' ? `지정일(${customStartDate}~${customEndDate})` : '전체기록';

        const rows = summaryData.map(d => ({
            "판매물품명": d.productName,
            "판매된 수량": d.totalQuantity,
            "남은재고": d.remainingStock
        }));
        
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, "품목별_총수량");

        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
        saveAs(data, `판매품목현황_${fileNameSuffix}_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    const toggleExpand = (productName: string) => {
        if (expandedProduct === productName) {
            setExpandedProduct(null);
        } else {
            setExpandedProduct(productName);
        }
    };

    return (
        <div className="space-y-6">
            {/* Control Panel */}
            <div className="bg-white p-4 rounded shadow-sm flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
                
                {/* View Mode */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-700 whitespace-nowrap text-sm bg-gray-100 px-2 py-1 rounded">조회 기준</span>
                        <select 
                            value={viewMode}
                            onChange={(e) => setViewMode(e.target.value as any)}
                            className="border border-gray-300 rounded px-2 py-1 text-sm font-bold text-gray-700 focus:ring-[#673ab7] outline-none"
                        >
                            <option value="active">📍 진행중(활성)</option>
                            <option value="today">📅 오늘</option>
                            <option value="yesterday">📅 어제</option>
                            <option value="custom">🔍 직접 지정</option>
                            <option value="all">전체 내역</option>
                        </select>
                        {viewMode === 'custom' && (
                            <div className="flex items-center gap-1.5 shrink-0">
                                <input 
                                    type="date" 
                                    value={customStartDate}
                                    onChange={(e) => setCustomStartDate(e.target.value)}
                                    className="border border-gray-300 rounded px-2 py-1 text-sm font-bold text-gray-700 focus:ring-[#673ab7] outline-none h-full max-h-[30px]"
                                />
                                <span className="text-gray-500 font-bold">~</span>
                                <input 
                                    type="date" 
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                    className="border border-gray-300 rounded px-2 py-1 text-sm font-bold text-gray-700 focus:ring-[#673ab7] outline-none h-full max-h-[30px]"
                                />
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-700 whitespace-nowrap text-sm bg-gray-100 px-2 py-1 rounded">정렬 방식</span>
                        <select 
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as 'quantity' | 'profit')}
                            className="border border-gray-300 rounded px-2 py-1 text-sm font-bold text-gray-700 focus:ring-[#673ab7] outline-none"
                        >
                            <option value="quantity">판매수량순</option>
                            <option value="profit">순수익순</option>
                        </select>
                    </div>
                </div>

                {/* Search & Export */}
                <div className="flex flex-col sm:flex-row gap-2">
                    <input 
                        type="text" 
                        placeholder="🔍 품목명 검색..." 
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="border border-gray-300 rounded px-3 py-2 text-sm w-full sm:w-56 focus:ring-[#673ab7] focus:border-[#673ab7] outline-none font-medium"
                    />
                    <button 
                        onClick={handleExcelDownload}
                        className="bg-green-600 text-white font-bold px-4 py-2 rounded shadow-sm hover:bg-green-700 transition flex items-center justify-center gap-2 text-sm shrink-0"
                    >
                        <span>⬇️ 엑셀 다운로드 (심플)</span>
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                    <h2 className="font-bold text-gray-800 flex items-center gap-2">
                        <span>📊 품목별 상세 현황</span>
                    </h2>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-purple-700 bg-purple-100 px-3 py-1 rounded-full shadow-inner">
                            검색된 상품수: {summaryData.length}종
                        </span>
                        <span className="text-sm font-medium text-blue-700 bg-blue-100 px-3 py-1 rounded-full shadow-inner">
                            총 판매수량 합계: {summaryData.reduce((acc, curr) => acc + curr.totalQuantity, 0)}개
                        </span>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-100 text-gray-600 border-b">
                            <tr>
                                <th className="py-2.5 px-3 w-12 text-center whitespace-nowrap">순위</th>
                                <th className="py-2.5 px-3 min-w-[150px]">판매물품명</th>
                                <th className="py-2.5 px-3 text-center whitespace-nowrap">판매수량</th>
                                <th className="py-2.5 px-3 text-center whitespace-nowrap">남은재고</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">총 판매액</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">순수익</th>
                                <th className="py-2.5 px-3 text-center whitespace-nowrap">구매자 확인</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y relative">
                            {summaryData.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-10 text-gray-500 font-medium">조회 및 검색된 데이터가 없습니다.</td></tr>
                            ) : summaryData.map((item, index) => (
                                <React.Fragment key={item.productName}>
                                    <tr className={`transition-colors ${expandedProduct === item.productName ? 'bg-[#f8f5ff]' : 'hover:bg-gray-50'}`}>
                                        <td className="py-2.5 px-3 text-center font-bold text-gray-500">{index + 1}</td>
                                        <td className="py-2.5 px-3 font-bold text-gray-900 border-l border-transparent">
                                            {item.productName}
                                        </td>
                                        <td className="py-2.5 px-3 text-center text-base font-black text-gray-800">
                                            {item.totalQuantity}
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                            {item.remainingStock <= 0 ? (
                                                <span className="text-sm font-black text-red-500">매진</span>
                                            ) : (
                                                <span className="text-base font-black text-gray-800">{item.remainingStock}</span>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-800">
                                            {item.totalRevenue.toLocaleString()}원
                                        </td>
                                        <td className="py-2.5 px-3 text-right">
                                            {item.missingCost ? (
                                                <span className="text-xs font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 uppercase tracking-tight">매입가 누락</span>
                                            ) : (
                                                <span className="font-mono font-bold text-blue-600">{item.totalProfit.toLocaleString()}원</span>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                            <button 
                                                onClick={() => toggleExpand(item.productName)}
                                                className="bg-white border-2 border-gray-300 hover:border-[#673ab7] hover:text-[#673ab7] text-gray-600 rounded px-2 py-0.5 text-xs font-bold transition-colors shadow-sm inline-flex items-center gap-1 active:scale-95"
                                            >
                                                👁️ 확인 {expandedProduct === item.productName ? '▲' : '▼'}
                                            </button>
                                        </td>
                                    </tr>
                                    {/* Accordion Row for Buyers */}
                                    {expandedProduct === item.productName && (
                                        <tr>
                                            <td colSpan={7} className="bg-[#fcfbff] px-3 py-4 border-b-2 border-[#673ab7]/20 shadow-inner">
                                                <div className="max-w-4xl mx-auto bg-white rounded-lg border border-[#e5d9f2] p-3 shadow-sm">
                                                    <h3 className="text-xs font-black text-[#673ab7] mb-2 flex items-center gap-1 border-b border-gray-100 pb-1">
                                                        <span>📋</span> [{item.productName}] 구매자 명단 (총 {item.buyers.length}명)
                                                    </h3>
                                                    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                                        {item.buyers.map((buyer, bIdx) => (
                                                            <li key={bIdx} className="bg-gray-50 border border-gray-100 rounded px-2 py-1.5 flex items-center justify-between text-xs">
                                                                <div className="flex flex-col min-w-0 pr-2">
                                                                    <span className="font-bold text-gray-800 truncate">{buyer.name}</span>
                                                                    <span className="text-gray-400 text-[10px] truncate">{buyer.nickname}</span>
                                                                </div>
                                                                <div className="shrink-0 bg-white border border-gray-200 px-1.5 py-0.5 rounded font-bold text-gray-600 shadow-sm">
                                                                    {buyer.qty}개
                                                                </div>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
