"use client";

import { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';

export default function DeliveryManagementTab() {
    const { orders, users, updateDeliveryStatus, updateTrackingNumber, bulkUpdateTracking, processOrderCancellation } = useApp();
    const [filter, setFilter] = useState<'all' | '배송준비중' | '배송중' | '배송완료' | '취소/반품/교환'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Bulk Tracking Modal
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [bulkInput, setBulkInput] = useState('');

    // Cancel Modal
    const [cancelModalOrder, setCancelModalOrder] = useState<string | null>(null);
    const [cancelMode, setCancelMode] = useState<'취소완료' | '반품요청' | '반품완료' | '교환요청' | '교환완료'>('취소완료');
    const [restoreStock, setRestoreStock] = useState(true);

    // Accordions
    const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
    const toggleExpand = (id: string) => setExpandedOrders(prev => ({ ...prev, [id]: !prev[id] }));

    // Filter paid orders only
    const paidOrders = useMemo(() => orders.filter(o => o.isPaid), [orders]);

    const filteredOrders = useMemo(() => {
        let list = paidOrders;
        if (filter !== 'all') {
            if (filter === '취소/반품/교환') {
                list = list.filter(o => ['취소완료', '반품요청', '반품완료', '교환요청', '교환완료'].includes(o.deliveryStatus || ''));
            } else {
                list = list.filter(o => (o.deliveryStatus || '배송준비중') === filter);
            }
        }
        
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(o => {
                const u = users.find(user => user.phone === o.userId || user.nickname === o.userId);
                const nameMatch = u?.name.toLowerCase().includes(q);
                const phoneMatch = u?.phone.includes(q);
                const idMatch = o.id.includes(q);
                return nameMatch || phoneMatch || idMatch;
            });
        }
        
        return list;
    }, [paidOrders, filter, searchQuery, users]);

    const counts = useMemo(() => {
        return {
            total: paidOrders.length,
            preparing: paidOrders.filter(o => (o.deliveryStatus || '배송준비중') === '배송준비중').length,
            shipping: paidOrders.filter(o => o.deliveryStatus === '배송중').length,
            completed: paidOrders.filter(o => o.deliveryStatus === '배송완료').length,
            issues: paidOrders.filter(o => ['취소완료', '반품요청', '반품완료', '교환요청', '교환완료'].includes(o.deliveryStatus || '')).length
        };
    }, [paidOrders]);

    const handleBulkSubmit = () => {
        if (!bulkInput.trim()) {
            alert("입력된 데이터가 없습니다.");
            return;
        }

        const lines = bulkInput.split('\n');
        const mappingData: { orderId: string; trackingNumber: string }[] = [];

        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length >= 2) {
                const orderId = parts[0].trim();
                const trackingNumber = parts[1].trim();
                if (orderId && trackingNumber) {
                    mappingData.push({ orderId, trackingNumber });
                }
            }
        }

        if (mappingData.length === 0) {
            alert("인식된 데이터가 없습니다. 엑셀에서 [주문번호], [송장번호] 두 열을 복사해서 붙여넣었는지 확인해주세요.");
            return;
        }

        const result = bulkUpdateTracking(mappingData);
        alert(`총 ${mappingData.length}건 중\n성공: ${result.success}건\n실패(없는주문번호): ${result.failed}건`);
        setIsBulkModalOpen(false);
        setBulkInput('');
    };

    const copyExcelData = () => {
        // Headers: 주문번호, 수취인명, 연락처, 주소, 상품내역, 총액
        let tsv = "주문번호\t수취인명\t연락처\t배송주소\t배송메세지\t총액\t상품내역\n";
        filteredOrders.forEach(o => {
            const user = users.find(u => u.phone === o.userId || u.nickname === o.userId);
            const itemsStr = o.items.map(i => `${i.productName}(${i.quantity}개)`).join(' / ');
            const userName = user?.name || o.userId;
            const phone = user?.phone || '';
            const address = user?.address || '';
            
            tsv += `${o.id}\t${userName}\t${phone}\t${address}\t\t${o.totalPrice}\t${itemsStr}\n`;
        });

        if (navigator.clipboard) {
            navigator.clipboard.writeText(tsv).then(() => {
                alert("택배사 발송용 데이터가 클립보드에 복사되었습니다! 엑셀에 붙여넣기 하세요.");
            }).catch(() => {
                alert("복사 실패. 브라우저 권한을 확인해주세요.");
            });
        } else {
            alert("현재 브라우저에서는 클립보드 자동 복사를 지원하지 않습니다.");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">🚚 배송 관리</h2>
                    <p className="text-sm text-gray-500 mt-1">결제 완료된 주문의 운송장 번호와 배송 상태를 관리합니다.</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={copyExcelData}
                        className="bg-green-600 text-white px-4 py-2 rounded shadow text-sm font-bold hover:bg-green-700 transition"
                    >
                        📋 엑셀 양식 추출
                    </button>
                    <button 
                        onClick={() => setIsBulkModalOpen(true)}
                        className="bg-[#673ab7] text-white px-4 py-2 rounded shadow text-sm font-bold hover:bg-[#5e35b1] transition"
                    >
                        📤 운송장 대량 등록
                    </button>
                </div>
            </div>

            {/* Stats / Filters */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                    <input 
                        type="text"
                        placeholder="🔍 고객 이름, 연락처, 주문번호 검색..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full sm:max-w-md p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#673ab7]"
                    />
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div onClick={() => setFilter('all')} className={`p-3 rounded-xl border cursor-pointer hover:shadow-md transition ${filter === 'all' ? 'border-[#673ab7] bg-purple-50' : 'bg-white border-gray-200'}`}>
                        <div className="text-xs text-gray-500 font-medium">결제완료 (전체)</div>
                        <div className="text-xl font-bold mt-0.5 text-gray-800">{counts.total}건</div>
                    </div>
                    <div onClick={() => setFilter('배송준비중')} className={`p-3 rounded-xl border cursor-pointer hover:shadow-md transition ${filter === '배송준비중' ? 'border-amber-500 bg-amber-50' : 'bg-white border-gray-200'}`}>
                        <div className="text-xs text-gray-500 font-medium">배송준비중</div>
                        <div className="text-xl font-bold mt-0.5 text-amber-600">{counts.preparing}건</div>
                    </div>
                    <div onClick={() => setFilter('배송중')} className={`p-3 rounded-xl border cursor-pointer hover:shadow-md transition ${filter === '배송중' ? 'border-blue-500 bg-blue-50' : 'bg-white border-gray-200'}`}>
                        <div className="text-xs text-gray-500 font-medium">배송중</div>
                        <div className="text-xl font-bold mt-0.5 text-blue-600">{counts.shipping}건</div>
                    </div>
                    <div onClick={() => setFilter('배송완료')} className={`p-3 rounded-xl border cursor-pointer hover:shadow-md transition ${filter === '배송완료' ? 'border-gray-500 bg-gray-100' : 'bg-white border-gray-200'}`}>
                        <div className="text-xs text-gray-500 font-medium">배송완료</div>
                        <div className="text-xl font-bold mt-0.5 text-gray-700">{counts.completed}건</div>
                    </div>
                    <div onClick={() => setFilter('취소/반품/교환')} className={`p-3 rounded-xl border cursor-pointer hover:shadow-md transition ${filter === '취소/반품/교환' ? 'border-red-400 bg-red-50' : 'bg-white border-gray-200'}`}>
                        <div className="text-xs text-gray-500 font-medium">취소/교환/반품</div>
                        <div className="text-xl font-bold mt-0.5 text-red-600">{counts.issues}건</div>
                    </div>
                </div>
            </div>

            {/* Orders List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="py-2 px-3 font-bold text-gray-600 w-32">주문일시</th>
                                <th className="py-2 px-3 font-bold text-gray-600 min-w-[140px]">구매자 정보</th>
                                <th className="py-2 px-3 font-bold text-gray-600 min-w-[200px]">🛒 주문내역</th>
                                <th className="py-2 px-3 font-bold text-gray-600 w-48">운송장 번호</th>
                                <th className="py-2 px-3 font-bold text-gray-600 w-44 text-center">상태 관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-12 px-4 text-center text-gray-500">조회된 주문이 없습니다.</td>
                                </tr>
                            ) : (
                                filteredOrders.map(order => {
                                    const status = order.deliveryStatus || '배송준비중';
                                    const user = users.find(u => u.phone === order.userId || u.nickname === order.userId);
                                    
                                    return (
                                        <tr key={order.id} className="hover:bg-gray-50 transition">
                                            <td className="py-1.5 px-3 align-top">
                                                <div className="font-medium text-gray-800 text-[13px]">{order.createdAt.split(' ').slice(0,3).join(' ')}</div>
                                                <div className="text-[10px] text-gray-400 font-mono mt-0.5 select-all">{order.id}</div>
                                            </td>
                                            <td className="py-1.5 px-3 align-top">
                                                <div className="font-bold text-[#673ab7] text-sm">{user?.name || '미등록고객'}</div>
                                                <div className="text-xs text-gray-500 tracking-tight">{user?.phone || order.userId}</div>
                                            </td>
                                            <td className="py-1.5 px-3 align-top">
                                                <button 
                                                    onClick={() => toggleExpand(order.id)}
                                                    className="text-xs font-bold bg-white px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 shadow-sm flex items-center gap-1 w-fit"
                                                >
                                                    {order.items.length}종 구매내역 {expandedOrders[order.id] ? '▲' : '▼'}
                                                </button>
                                                {expandedOrders[order.id] && (
                                                    <ul className="mt-1.5 text-xs text-gray-600 space-y-0.5 bg-gray-50 p-2 rounded border border-gray-200">
                                                        {order.items.map((item, idx) => (
                                                            <li key={idx} className="flex justify-between w-full gap-2">
                                                                <span className="truncate">{item.productName}</span>
                                                                <span className="font-medium shrink-0">x{item.quantity}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </td>
                                            <td className="py-1.5 px-3 align-top">
                                                <input 
                                                    type="text" 
                                                    placeholder="운송장 번호 입력"
                                                    value={order.trackingNumber || ''}
                                                    onChange={(e) => updateTrackingNumber(order.id, e.target.value)}
                                                    className={`w-full p-1.5 border rounded text-xs focus:ring-1 focus:ring-[#673ab7] focus:outline-none transition ${order.trackingNumber ? 'bg-blue-50 border-blue-200 font-semibold text-blue-800' : 'border-gray-300'}`}
                                                />
                                            </td>
                                            <td className="py-1.5 px-3 align-top text-center">
                                                <div className="flex flex-col gap-1 w-full max-w-[140px] mx-auto">
                                                    <select 
                                                        value={status}
                                                        onChange={(e) => {
                                                            const val = e.target.value as '배송준비중' | '배송중' | '배송완료' | '취소완료' | '반품요청' | '반품완료' | '교환요청' | '교환완료';
                                                            if (['취소완료', '반품요청', '반품완료', '교환요청', '교환완료'].includes(val)) {
                                                                setCancelMode(val as '취소완료' | '반품요청' | '반품완료' | '교환요청' | '교환완료');
                                                                setCancelModalOrder(order.id);
                                                            } else {
                                                                updateDeliveryStatus(order.id, val);
                                                            }
                                                        }}
                                                        className={`w-full p-1.5 border rounded text-xs font-bold focus:outline-none text-center cursor-pointer appearance-none bg-no-repeat
                                                            ${status === '배송준비중' ? 'bg-amber-100 text-amber-700 border-amber-200' : ''}
                                                            ${status === '배송중' ? 'bg-blue-100 text-blue-700 border-blue-200' : ''}
                                                            ${status === '배송완료' ? 'bg-gray-200 text-gray-700 border-gray-300' : ''}
                                                            ${['취소완료', '반품요청', '반품완료', '교환요청', '교환완료'].includes(status) ? 'bg-red-100 text-red-700 border-red-200' : ''}
                                                        `}
                                                        style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23333%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundPosition: 'right 0.5rem top 50%', backgroundSize: '0.5rem auto' }}
                                                    >
                                                        <optgroup label="정상 배송">
                                                            <option value="배송준비중">배송준비중</option>
                                                            <option value="배송중">배송중</option>
                                                            <option value="배송완료">배송완료</option>
                                                        </optgroup>
                                                        <optgroup label="취소/반품/교환">
                                                            <option value="취소완료">취소완료</option>
                                                            <option value="반품요청">반품요청</option>
                                                            <option value="반품완료">반품완료</option>
                                                            <option value="교환요청">교환요청</option>
                                                            <option value="교환완료">교환완료</option>
                                                        </optgroup>
                                                    </select>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bulk Upload Modal */}
            {isBulkModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 relative">
                        <button 
                            onClick={() => setIsBulkModalOpen(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 font-bold text-xl"
                        >×</button>
                        
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">📤 운송장 대량 등록</h3>
                        <p className="text-sm text-gray-600 bg-blue-50 p-4 rounded-lg mb-4 border border-blue-100">
                            <strong>사용 방법:</strong><br />
                            엑셀에서 <b>[주문번호]</b> 열과 <b>[운송장번호]</b> 열, 단 두 개의 열만 마우스로 드래그해서 복사(Ctrl+C)한 뒤 아래 빈칸에 붙여넣기(Ctrl+V) 하세요.<br/>
                            <span className="text-xs text-blue-500">* 여러 열을 복사해도 반드시 첫 번째가 주문번호, 두 번째가 운송장번호여야 합니다. (Tab으로 구분됨)</span>
                        </p>

                        <textarea 
                            value={bulkInput}
                            onChange={(e) => setBulkInput(e.target.value)}
                            className="w-full h-64 border border-gray-300 rounded-lg p-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#673ab7] whitespace-pre"
                            placeholder={"예시 붙여넣기 형태:\n\n1738491823-102\t123-4567-8901\n1738491824-918\t123-4567-8902"}
                        ></textarea>

                        <div className="flex justify-end gap-2 mt-4">
                            <button 
                                onClick={() => setIsBulkModalOpen(false)}
                                className="px-4 py-2 border rounded font-medium text-gray-600 hover:bg-gray-50"
                            >
                                취소
                            </button>
                            <button 
                                onClick={handleBulkSubmit}
                                className="px-4 py-2 bg-[#673ab7] text-white rounded font-bold hover:bg-[#5e35b1] shadow"
                            >
                                대량 등록 적용
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel/Issue Modal */}
            {cancelModalOrder && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
                        <h3 className="text-xl font-bold mb-4">상태 변경 확인</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            현재 주문을 <strong className="text-red-500">{cancelMode}</strong> 상태로 변경합니다.
                        </p>
                        
                        <label className="flex items-center gap-2 bg-gray-50 p-3 border border-gray-200 rounded cursor-pointer mb-6">
                            <input 
                                type="checkbox" 
                                checked={restoreStock}
                                onChange={(e) => setRestoreStock(e.target.checked)}
                                className="w-5 h-5 accent-[#673ab7]"
                            />
                            <span className="text-sm font-medium text-gray-700">이 주문의 상품 재고를 원상 복구합니다.</span>
                        </label>

                        <div className="flex justify-end gap-2">
                            <button 
                                onClick={() => setCancelModalOrder(null)}
                                className="px-4 py-2 border rounded font-medium text-gray-600 hover:bg-gray-50"
                            >
                                닫기
                            </button>
                            <button 
                                onClick={() => {
                                    processOrderCancellation(cancelModalOrder, cancelMode, restoreStock);
                                    setCancelModalOrder(null);
                                }}
                                className="px-4 py-2 bg-red-500 text-white rounded font-bold hover:bg-red-600 shadow"
                            >
                                적용하기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
