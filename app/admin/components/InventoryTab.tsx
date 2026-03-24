"use client";

import { useState, useMemo } from 'react';
import { useApp, Product } from '../../context/AppContext';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export default function InventoryTab() {
  const { products, addProduct, updateProduct, deleteProduct, toggleProductActive, toggleAllProductsActive, resetOrders } = useApp();
  
  // New Product Form State
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    purchasePrice: '',
    stock: '',
    isConsignment: false,
    vendorName: '',
    expirationDate: '',
    onlineLowestPrice: ''
  });

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.stock) return;

    const product: Product = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: newProduct.name,
      price: newProduct.price ? Number(newProduct.price) : 0,
      purchasePrice: newProduct.purchasePrice ? Number(newProduct.purchasePrice) : 0,
      stock: Number(newProduct.stock),
      isActive: true, // Default to active
      updatedAt: new Date().toISOString(),
      isConsignment: newProduct.isConsignment,
      vendorName: newProduct.isConsignment ? newProduct.vendorName : undefined,
      expirationDate: newProduct.expirationDate || undefined,
      onlineLowestPrice: newProduct.onlineLowestPrice ? Number(newProduct.onlineLowestPrice) : undefined
    };

    addProduct(product);
    setNewProduct({ name: '', price: '', purchasePrice: '', stock: '', isConsignment: false, vendorName: '', expirationDate: '', onlineLowestPrice: '' });
  };

  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [showConsignmentOnly, setShowConsignmentOnly] = useState(false);
  
  // Sort State
  const [sortConfig, setSortConfig] = useState<{ key: 'date' | 'stock' | 'expirationDate', direction: 'desc' | 'asc' }>({ key: 'date', direction: 'desc' });

  const parseExpDate = (dateStr?: string) => {
      if (!dateStr) return Infinity;
      if (dateStr.length === 6) {
          const year = '20' + dateStr.substring(0,2);
          const month = dateStr.substring(2,4);
          const day = dateStr.substring(4,6);
          return new Date(`${year}-${month}-${day}`).getTime();
      }
      return new Date(dateStr).getTime();
  };

  const formatDisplayDate = (val?: string) => {
      if (!val) return '';
      const raw = val.replace(/[^0-9]/g, '');
      if (raw.length <= 2) return raw;
      if (raw.length <= 4) return `${raw.substring(0, 2)}-${raw.substring(2)}`;
      return `${raw.substring(0, 2)}-${raw.substring(2, 4)}-${raw.substring(4, 6)}`;
  };

  const filteredAndSortedProducts = useMemo(() => {
    let result = [...products];
    
    if (searchTerm) {
        result = result.filter(p => p.name.includes(searchTerm));
    }
    
    if (showConsignmentOnly) {
        result = result.filter(p => p.isConsignment);
    }
    
    result.sort((a, b) => {
      let comparison = 0;
      if (sortConfig.key === 'date') {
          const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          
          if (timeA !== timeB) {
              comparison = timeA - timeB;
          } else {
              // Fallback to ID-based numeric comparison if timestamps are equal
              comparison = Number(a.id) - Number(b.id);
          }
      } else if (sortConfig.key === 'stock') {
          comparison = a.stock - b.stock;
      } else if (sortConfig.key === 'expirationDate') {
          const dateA = parseExpDate(a.expirationDate);
          const dateB = parseExpDate(b.expirationDate);
          comparison = dateA - dateB;
      }
      
      // Secondary sort by name for stability
      if (comparison === 0) {
          comparison = a.name.localeCompare(b.name);
      }
      
      return sortConfig.direction === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [products, searchTerm, showConsignmentOnly, sortConfig]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [frozenIds, setFrozenIds] = useState<string[]>([]);

  const displayProducts = useMemo(() => {
    if (editingId && frozenIds.length > 0) {
      const ordered = frozenIds
        .map(id => products.find(p => p.id === id))
        .filter((p): p is Product => !!p);
      
      const missing = products.filter(p => !frozenIds.includes(p.id))
                              .filter(p => {
                                if (searchTerm && !p.name.includes(searchTerm)) return false;
                                if (showConsignmentOnly && !p.isConsignment) return false;
                                return true;
                              });
      return [...ordered, ...missing];
    } else {
      return filteredAndSortedProducts;
    }
  }, [editingId, frozenIds, filteredAndSortedProducts, products, searchTerm, showConsignmentOnly]);

  const startEditing = (id: string) => {
    if (!editingId) {
        setFrozenIds(filteredAndSortedProducts.map(p => p.id));
    }
    setEditingId(id);
  };

  const stopEditing = () => {
    setEditingId(null);
    setFrozenIds([]);
  };

  // Calculations for total inventory value (excluding consignments)
  const { totalStockCost, totalExpectedRevenue } = useMemo(() => {
     return products.reduce((acc, p) => {
         if (!p.isConsignment && p.stock > 0) {
             acc.totalStockCost += (p.purchasePrice || 0) * p.stock;
             acc.totalExpectedRevenue += (p.price || 0) * p.stock;
         }
         return acc;
     }, { totalStockCost: 0, totalExpectedRevenue: 0 });
  }, [products]);

  // Reset Confirmation State
  const [resetConfirm, setResetConfirm] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);

  const handleReset = () => {
    if (resetConfirm === '초기화' || resetConfirm === 'RESET') {
        resetOrders(true); // Archive by default
        alert('주문 내역이 초기화(아카이브) 되었습니다.');
        setShowResetModal(false);
        setResetConfirm('');
    } else {
        alert('확인 문자가 일치하지 않습니다.');
    }
  };

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('재고목록');

    // Define Columns
    worksheet.columns = [
      { header: '상품명', key: 'name', width: 30 },
      { header: '위탁', key: 'isConsignment', width: 10 },
      { header: '업체명', key: 'vendorName', width: 15 },
      { header: '매입가', key: 'purchasePrice', width: 12 },
      { header: '판매가', key: 'price', width: 12 },
      { header: '마진(수식)', key: 'margin', width: 12 },
      { header: '마진율(수식)', key: 'marginRate', width: 12 },
      { header: '재고', key: 'stock', width: 10 },
      { header: '합계금액(수식)', key: 'totalValue', width: 15 },
      { header: '유통기한', key: 'expirationDate', width: 15 },
      { header: '온라인최저가', key: 'onlineLowestPrice', width: 15 },
      { header: '최근입고일', key: 'updatedAt', width: 15 }
    ];

    // Add Data
    filteredAndSortedProducts.forEach((product, index) => {
      const rowIndex = index + 2; // Header is row 1
      const row = worksheet.addRow({
        name: product.name,
        isConsignment: product.isConsignment ? 'Y' : 'N',
        vendorName: product.vendorName || '-',
        purchasePrice: product.purchasePrice || 0,
        price: product.price || 0,
        stock: product.stock || 0,
        expirationDate: product.expirationDate || '-',
        onlineLowestPrice: product.onlineLowestPrice || '-',
        updatedAt: product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : '-'
      });

      // Add Formulas
      // Margin = Price - PurchasePrice (Col E - Col D)
      row.getCell('margin').value = { formula: `E${rowIndex}-D${rowIndex}` };
      // Margin Rate = Margin / Price (Col F / Col E)
      row.getCell('marginRate').value = { formula: `IF(E${rowIndex}>0, F${rowIndex}/E${rowIndex}, 0)` };
      // Total Value = PurchasePrice * Stock (Col D * Col H)
      row.getCell('totalValue').value = { formula: `D${rowIndex}*H${rowIndex}` };
    });

    // Styling
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF673AB7' } // Purple header
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Formats
    worksheet.getColumn('purchasePrice').numFmt = '#,##0"원"';
    worksheet.getColumn('price').numFmt = '#,##0"원"';
    worksheet.getColumn('margin').numFmt = '#,##0"원"';
    worksheet.getColumn('marginRate').numFmt = '0.0%';
    worksheet.getColumn('totalValue').numFmt = '#,##0"원"';
    worksheet.getColumn('stock').numFmt = '#,##0';

    // Auto-filter and Freeze
    worksheet.autoFilter = 'A1:K1';
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Generate and Save
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `보라몰_재고내역_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-4">
      
      {/* Top Actions: Reset Day */}
      <div className="flex justify-end">
        <button 
            onClick={() => setShowResetModal(true)}
            className="bg-red-100 text-red-600 px-4 py-2 rounded font-bold hover:bg-red-200"
        >
            ⚠️ 방송 종료(주문 초기화)
        </button>
      </div>

      {/* Add Product Section */}
      <div className="bg-white py-3 px-6 rounded-lg shadow-sm">
        <h2 className="text-lg font-bold mb-2">상품 추가</h2>
        <form onSubmit={handleAddProduct} className="flex flex-col gap-1.5 sm:gap-3">
          <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-4 items-end">
            <div className="flex-[2] w-full">
              <label className="block text-xs sm:text-sm text-gray-600 mb-0.5">상품명</label>
              <input
                type="text"
                className="w-full border p-2 rounded"
                value={newProduct.name}
                onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                placeholder="예: 맛있는 사과"
              />
            </div>
            <div className="w-full sm:w-32">
              <label className="block text-xs sm:text-sm text-gray-600 mb-0.5">매입가 (원)</label>
              <input
                type="number"
                step="100"
                className="w-full border p-2 rounded bg-gray-50"
                value={newProduct.purchasePrice || ''}
                onChange={(e) => setNewProduct({...newProduct, purchasePrice: e.target.value})}
                placeholder="0"
              />
            </div>
            <div className="w-full sm:w-32">
              <label className="block text-xs sm:text-sm text-gray-600 mb-0.5">판매가 (원)</label>
              <input
                type="number"
                step="100"
                className="w-full border p-2 rounded"
                value={newProduct.price}
                onChange={(e) => setNewProduct({...newProduct, price: e.target.value})}
                placeholder="미정"
              />
            </div>
            <div className="w-full sm:w-32">
              <label className="block text-xs sm:text-sm text-gray-600 mb-0.5">유통기한(YYMMDD)</label>
              <input
                type="text"
                maxLength={8}
                placeholder="26-03-30"
                className="w-full border p-2 rounded text-gray-600"
                value={formatDisplayDate(newProduct.expirationDate)}
                onChange={(e) => setNewProduct({...newProduct, expirationDate: e.target.value.replace(/[^0-9]/g, '')})}
              />
            </div>
            <div className="w-full sm:w-32">
              <label className="block text-xs sm:text-sm text-gray-600 mb-0.5">온라인최저가</label>
              <input
                type="number"
                step="100"
                className="w-full border p-2 rounded bg-gray-50"
                value={newProduct.onlineLowestPrice || ''}
                onChange={(e) => setNewProduct({...newProduct, onlineLowestPrice: e.target.value})}
                placeholder="0"
              />
            </div>
            <div className="w-full sm:w-24">
              <label className="block text-xs sm:text-sm text-gray-600 mb-0.5">재고</label>
              <input
                type="number"
                className="w-full border p-2 rounded"
                value={newProduct.stock}
                onChange={(e) => setNewProduct({...newProduct, stock: e.target.value})}
                placeholder="0"
              />
            </div>
            <button type="submit" className="bg-[#673ab7] text-white px-6 py-2 rounded font-bold hover:bg-[#5e35b1] w-full sm:w-auto h-[42px] mt-1 sm:mt-0">
              추가
            </button>
          </div>
          <div className="flex items-center gap-4 bg-gray-50 p-2 rounded-lg border border-dashed border-gray-300">
             <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-[#673ab7]" checked={newProduct.isConsignment} onChange={(e) => setNewProduct({...newProduct, isConsignment: e.target.checked})} />
                <span className="text-sm font-medium text-gray-700">🚚 위탁 배송 상품 (개별 발주)</span>
             </label>
             {newProduct.isConsignment && (
                <div className="flex-1 max-w-xs transition-all">
                   <input type="text" placeholder="발주처 / 업체명 (예: 해남감자)" className="w-full border p-1 rounded text-sm" value={newProduct.vendorName} onChange={(e) => setNewProduct({...newProduct, vendorName: e.target.value})} />
                </div>
             )}
          </div>
        </form>
      </div>

      {/* Product List */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-lg font-bold flex flex-col sm:flex-row sm:items-baseline gap-2">
                상품 목록 ({filteredAndSortedProducts.length})
                <div className="text-sm font-normal text-gray-500 flex gap-3">
                    <span className="bg-gray-100 px-2 py-1 rounded">총 매입: <strong className="text-gray-700">{totalStockCost.toLocaleString()}원</strong></span>
                    <span className="bg-green-50 px-2 py-1 rounded text-green-700">기대 매출: <strong>{totalExpectedRevenue.toLocaleString()}원</strong></span>
                </div>
            </h2>
            <div className="flex flex-wrap items-center gap-4">
                <button 
                    onClick={exportToExcel}
                    className="bg-green-600 text-white px-3 py-2 rounded text-sm font-bold hover:bg-green-700 flex items-center gap-2"
                >
                    📊 엑셀 다운로드
                </button>
                <label className="flex items-center gap-2 cursor-pointer bg-purple-50 px-3 py-2 rounded border border-purple-100">
                    <input 
                        type="checkbox" 
                        className="w-4 h-4 accent-[#673ab7]"
                        checked={showConsignmentOnly}
                        onChange={(e) => setShowConsignmentOnly(e.target.checked)}
                    />
                    <span className="text-sm font-bold text-purple-700">🚚 위탁상품만 보기</span>
                </label>
                <div className="flex items-center gap-2 border rounded p-2 bg-gray-50 flex-1 sm:flex-none">
                    <span>🔍</span>
                    <input 
                        type="text" 
                        placeholder="상품명 검색..." 
                        className="bg-transparent outline-none text-sm w-full"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
        </div>
        <div className="overflow-x-auto min-h-[600px] border border-gray-200 rounded-md">
          <table className="min-w-[1000px] text-left text-xs sm:text-sm table-fixed">
            <colgroup>
              <col className="w-[4%]" />  {/* 활성 */}
              <col className="w-[18%]" />   {/* 상품명 */}
              <col className="w-[6%]" />  {/* 위탁 */}
              <col className="w-[13%]" />   {/* 입고일 */}
              <col className="w-[10%]" />   {/* 유통기한 */}
              <col className="w-[10%]" />   {/* 온라인최저가 */}
              <col className="w-[10%]" />   {/* 매입 */}
              <col className="w-[10%]" />   {/* 판매 */}
              <col className="w-[9%]" />    {/* 마진 */}
              <col className="w-[5%]" />    {/* 재고 */}
              <col className="w-[5%]" />    {/* 삭제 */}
            </colgroup>
            <thead className="bg-gray-50 text-gray-500 font-medium border-b">
              <tr className="h-[32px]">
                <th className="px-1 text-center align-middle select-none">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-gray-500 cursor-pointer text-[10px]" onClick={() => {
                        const allActive = filteredAndSortedProducts.length > 0 && filteredAndSortedProducts.every(p => p.isActive);
                        toggleAllProductsActive(!allActive);
                    }}>활성</span>
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-[#673ab7] cursor-pointer"
                      checked={filteredAndSortedProducts.length > 0 && filteredAndSortedProducts.every(p => p.isActive)}
                      onChange={(e) => toggleAllProductsActive(e.target.checked)}
                      title="모두 활성/비활성"
                    />
                  </div>
                </th>
                <th className="px-2 align-middle">상품</th>
                <th className="px-1 align-middle text-center">위탁</th>
                <th 
                    className="px-2 align-middle text-center cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap"
                    onClick={() => setSortConfig(prev => ({ 
                        key: 'date', 
                        direction: prev.key === 'date' && prev.direction === 'desc' ? 'asc' : 'desc' 
                    }))}
                    title="최근 입고일순 정렬"
                >
                    입고일 {sortConfig.key === 'date' && (sortConfig.direction === 'desc' ? '▼' : '▲')}
                </th>
                <th 
                    className="px-2 align-middle text-center cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap"
                    onClick={() => setSortConfig(prev => ({ 
                        key: 'expirationDate', 
                        direction: prev.key === 'expirationDate' && prev.direction === 'asc' ? 'desc' : 'asc' 
                    }))}
                    title="유통기한 임박순 정렬"
                >
                    유통기한 {sortConfig.key === 'expirationDate' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                    {sortConfig.key !== 'expirationDate' && <span className="text-gray-300">↕</span>}
                </th>
                <th className="px-2 align-middle text-right whitespace-nowrap">최저가</th>
                <th className="px-2 align-middle text-right whitespace-nowrap">매입</th>
                <th className="px-2 align-middle text-right whitespace-nowrap">판매</th>
                <th className="px-2 align-middle text-right whitespace-nowrap">마진</th>
                <th 
                    className="px-2 align-middle text-right cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap"
                    onClick={() => setSortConfig(prev => ({ 
                        key: 'stock', 
                        direction: prev.key === 'stock' && prev.direction === 'desc' ? 'asc' : 'desc' 
                    }))}
                    title="재고순 정렬"
                >
                    재고 {sortConfig.key === 'stock' && (sortConfig.direction === 'desc' ? '▼' : '▲')}
                    {sortConfig.key !== 'stock' && <span className="text-gray-300">↕</span>}
                </th>
                <th className="px-1 align-middle text-center whitespace-nowrap">삭제</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayProducts.length === 0 ? (
                <tr>
                    <td colSpan={10} className="p-8 text-center text-gray-500">
                        {searchTerm ? '검색 결과가 없습니다.' : '등록된 상품이 없습니다.'}
                    </td>
                </tr>
              ) : displayProducts.map((product) => {
                  const purchasePrice = product.purchasePrice || 0;
                  const margin = product.price > 0 ? product.price - purchasePrice : 0;
                  const marginRate = product.price > 0 ? ((margin / product.price) * 100).toFixed(1) : '0';
                  
                  return (
                    <tr key={product.id} className={`${product.isActive ? 'bg-white' : 'bg-gray-50 text-gray-400'} h-[34px]`}>
                      <td className="px-1 align-middle text-center">
                        <input
                          type="checkbox"
                          checked={product.isActive}
                          onChange={() => toggleProductActive(product.id)}
                          className="w-4 h-4 accent-[#673ab7] cursor-pointer"
                        />
                      </td>
                      <td className="px-2 align-middle overflow-hidden relative min-w-0">
                        <input 
                            type="text" 
                            value={product.name}
                            onChange={(e) => updateProduct({...product, name: e.target.value})}
                            onFocus={() => startEditing(product.id)}
                            onBlur={() => stopEditing()}
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-[#673ab7] rounded px-1 py-0.5 font-medium text-sm truncate focus:whitespace-normal focus:bg-white focus:outline-none"
                            title={product.name}
                        />
                      </td>
                      <td className="px-1 align-middle text-center">
                        <div className="flex flex-col items-center gap-0.5">
                            <label className="flex items-center gap-1 cursor-pointer bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200 hover:bg-purple-50 hover:border-purple-200 transition-colors">
                                <input type="checkbox" className="w-3.5 h-3.5 accent-[#673ab7]" checked={product.isConsignment || false} onChange={(e) => updateProduct({...product, isConsignment: e.target.checked})} />
                                <span className="text-xs text-gray-600">위탁</span>
                            </label>
                            {(product.isConsignment || false) && (
                                <input 
                                    type="text" 
                                    placeholder="업체" 
                                    value={product.vendorName || ''} 
                                    onChange={(e) => updateProduct({...product, vendorName: e.target.value})} 
                                    onFocus={() => startEditing(product.id)}
                                    onBlur={() => stopEditing()}
                                    className="border-b border-gray-300 text-[10px] p-0.5 outline-none focus:border-[#673ab7] bg-transparent w-14 text-gray-600 text-center" 
                                />
                            )}
                        </div>
                      </td>
                      <td className="px-2 align-middle text-center text-xs text-gray-500 whitespace-nowrap">
                          {product.updatedAt ? new Date(product.updatedAt).toLocaleDateString('ko-KR', {
                              year: '2-digit', month: '2-digit', day: '2-digit'
                          }) : '-'}
                      </td>
                      <td className="px-1 align-middle text-center">
                          <div className="flex flex-col items-center">
                              <input 
                                  type="text" 
                                  maxLength={8}
                                  placeholder="YY-MM-DD"
                                  value={formatDisplayDate(product.expirationDate)}
                                  onChange={(e) => updateProduct({...product, expirationDate: e.target.value.replace(/[^0-9]/g, '') || undefined})}
                                  onFocus={() => startEditing(product.id)}
                                  onBlur={() => stopEditing()}
                                  className={`bg-transparent outline-none w-full text-center text-xs font-medium ${(!product.expirationDate || product.expirationDate.length !== 6) ? 'text-gray-400' : (() => {
                                      const expTime = parseExpDate(product.expirationDate);
                                      const today = new Date();
                                      today.setHours(0,0,0,0);
                                      const diff = Math.floor((expTime - today.getTime()) / (1000 * 3600 * 24));
                                      return diff < 0 ? 'text-red-700 font-bold' : diff <= 14 ? 'text-red-500 font-bold' : 'text-gray-600';
                                  })()}`}
                              />
                              {product.expirationDate && product.expirationDate.length === 6 && (() => {
                                  const expTime = parseExpDate(product.expirationDate);
                                  const today = new Date();
                                  today.setHours(0,0,0,0);
                                  const diff = Math.floor((expTime - today.getTime()) / (1000 * 3600 * 24));
                                  const dDayStr = diff < 0 ? `D+${Math.abs(diff)}` : diff === 0 ? 'D-Day' : `D-${diff}`;
                                  const colorStr = diff < 0 ? 'text-red-700' : diff <= 14 ? 'text-red-500' : 'text-gray-400';
                                  return <span className={`text-[10px] font-bold ${colorStr}`}>{dDayStr}</span>;
                              })()}
                          </div>
                      </td>
                      <td className="px-2 align-middle">
                         <div className="flex items-center gap-0.5 justify-end">
                            <input 
                                type="number" 
                                step="10"
                                value={product.onlineLowestPrice || ''}
                                onChange={(e) => updateProduct({...product, onlineLowestPrice: Number(e.target.value) || undefined})}
                                onFocus={() => startEditing(product.id)}
                                onBlur={() => stopEditing()}
                                className="w-full bg-transparent border-none focus:ring-1 focus:ring-orange-500 text-orange-600 rounded p-0.5 text-right font-bold text-[11px]"
                                placeholder="최저가"
                            />
                        </div>
                      </td>
                      <td className="px-2 align-middle">
                         <div className="flex items-center gap-0.5 justify-end">
                            <input 
                                type="number" 
                                step="100"
                                value={purchasePrice > 0 ? purchasePrice : ''}
                                onChange={(e) => updateProduct({...product, purchasePrice: Number(e.target.value)})}
                                onFocus={() => startEditing(product.id)}
                                onBlur={() => stopEditing()}
                                className="w-full bg-transparent border-none focus:ring-1 focus:ring-[#673ab7] rounded p-0.5 text-right font-bold text-gray-700 text-xs"
                                placeholder="0"
                            />
                            <span className="text-gray-400 text-[10px]">원</span>
                        </div>
                      </td>
                      <td className="px-2 align-middle">
                        <div className="flex items-center gap-0.5 justify-end">
                          <input 
                              type="number" 
                              step="100"
                              value={product.price > 0 ? product.price : ''}
                              onChange={(e) => updateProduct({...product, price: Number(e.target.value)})}
                              onFocus={() => startEditing(product.id)}
                              onBlur={() => stopEditing()}
                              className={`w-full bg-transparent border-none focus:ring-1 focus:ring-[#673ab7] rounded p-0.5 text-right font-bold text-xs ${product.price === 0 ? 'bg-red-50 text-red-500 placeholder-red-400' : ''}`}
                              placeholder={product.price === 0 ? "미정" : "0"}
                          />
                          {product.price > 0 && <span className="text-gray-800 text-[10px]">원</span>}
                        </div>
                      </td>
                      <td className="px-2 align-middle text-right">
                        {product.price === 0 ? (
                            <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 whitespace-nowrap">판매가 미정</span>
                        ) : (
                          <>
                            <span className={`text-xs font-medium ${margin > 0 ? 'text-green-600' : 'text-red-500'}`}>
                               {marginRate}%
                            </span>
                            <div className="text-[10px] text-gray-400">
                                ({margin.toLocaleString()})
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-2 align-middle text-right">
                             <input 
                                type="number" 
                                value={product.stock}
                                onChange={(e) => updateProduct({...product, stock: Number(e.target.value)})}
                                onFocus={() => startEditing(product.id)}
                                onBlur={() => {
                                    stopEditing();
                                    updateProduct({...product, updatedAt: new Date().toISOString()});
                                }}
                                className={`w-full text-right bg-transparent border-none focus:ring-1 focus:ring-[#673ab7] rounded p-0.5 text-xs ${product.stock < 5 ? 'text-red-500 font-bold' : ''}`}
                             />
                      </td>
                      <td className="px-1 align-middle text-center">
                            <button 
                                onClick={() => {
                                    if(confirm(`'${product.name}' 상품을 완전히 삭제하시겠습니까?`)) {
                                        deleteProduct(product.id);
                                    }
                                }}
                                className="text-xs text-red-400 hover:text-red-600 transition-colors"
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

      {/* Reset Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg max-w-sm w-full">
                <h3 className="text-xl font-bold mb-2 text-red-600">⚠️ 방송 종료 및 초기화</h3>
                <p className="mb-4 text-gray-600">
                    오늘의 주문 내역을 모두 <strong>보관함으로 이동</strong>하고 목록을 비웁니다.<br/>
                    계속하시려면 아래에 <strong>초기화</strong>라고 입력하세요.
                </p>
                <input 
                    type="text" 
                    className="w-full border p-2 mb-4 rounded" 
                    placeholder="초기화"
                    value={resetConfirm}
                    onChange={(e) => setResetConfirm(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                    <button 
                        onClick={() => { setShowResetModal(false); setResetConfirm(''); }}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                    >
                        취소
                    </button>
                    <button 
                        onClick={handleReset}
                        className="px-4 py-2 bg-red-600 text-white rounded font-bold hover:bg-red-700"
                    >
                        확인 (초기화)
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
}
