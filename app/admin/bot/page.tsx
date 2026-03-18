"use client";

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import OrderEntryTab from '../components/OrderEntryTab';

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  isActive: boolean;
}

interface LogEntry {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning' | 'chat';
}

export default function BotPage() {
  const { status } = useSession();
  const router = useRouter();
  
  const [videoUrl, setVideoUrl] = useState('');
  const [liveChatId, setLiveChatId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [salesLimit, setSalesLimit] = useState<string>(''); // Added sales limit state
  
  // Product search states
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const productDropdownRef = useRef<HTMLDivElement>(null);
  
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isBotRunning, setIsBotRunning] = useState(false);
  
  // Quota optimization states
  const [autoReply, setAutoReply] = useState(false);
  const [isManualBroadcasting, setIsManualBroadcasting] = useState(false);
  
  // Session order tracking for buyer summaries
  const [sessionOrders, setSessionOrders] = useState<{name: string, qty: number}[]>([]);
  const [sessionUnregistered, setSessionUnregistered] = useState<string[]>([]);
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const nextPageTokenRef = useRef<string>('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/admin/login');
    }
  }, [status, router]);

  useEffect(() => {
    // Fetch active products
    fetch('/api/products')
      .then(res => res.json())
      .then((data: Product[]) => setProducts(data.filter(p => p.isActive)))
      .catch(err => console.error('Failed to load products', err));
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Click outside to close product dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev.slice(-99), {
      id: Math.random().toString(36).substring(7),
      time: new Date().toLocaleTimeString(),
      message,
      type
    }]);
  };

  const extractVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : url;
  };

  const handleConnect = async () => {
    if (!videoUrl) return alert("유튜브 라이브 URL을 입력해주세요.");
    
    setIsConnecting(true);
    addLog(`방송 연결 시도 중... (${videoUrl})`, 'info');
    
    try {
      const response = await fetch('/api/youtube/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: extractVideoId(videoUrl) })
      });
      
      const data = await response.json();
      if (data.success) {
        setLiveChatId(data.liveChatId);
        setIsConnected(true);
        addLog(`✅ 방송 연결 성공! 라이브 채팅 ID: ${data.liveChatId}`, 'success');
      } else {
        addLog(`❌ 연결 실패: ${data.error}`, 'error');
      }
    } catch (error) {
      addLog(`❌ 연결 오류 발생: ${error}`, 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setIsBotRunning(false);
    setLiveChatId('');
    addLog('방송 연결 해제됨.', 'warning');
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const pollChat = async () => {
    if (!liveChatId || !selectedProductId) return;

    try {
      const response = await fetch('/api/youtube/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          liveChatId, 
          nextPageToken: nextPageTokenRef.current,
          productId: selectedProductId,
          salesLimit: salesLimit ? parseInt(salesLimit, 10) : null,
          autoReply // Pass the flag to backend
        })
      });

      const data = await response.json();
      
      if (data.success) {
        nextPageTokenRef.current = data.nextPageToken || '';
        
        // Add chat and system logs
        if (data.logs && data.logs.length > 0) {
          data.logs.forEach((log: { message: string, type: LogEntry['type'] }) => addLog(log.message, log.type));
        }

        if (data.soldAmount && data.soldAmount > 0) {
           // Decrement total local stock
           setProducts(prevProducts => prevProducts.map(p => 
              p.id === selectedProductId 
              ? { ...p, stock: p.stock - data.soldAmount }
              : p
           ));

           // Accumulate session orders for buyer summary
           if (data.successOrders && data.successOrders.length > 0) {
             setSessionOrders(prev => [...prev, ...data.successOrders]);
           }

           // Update sales limit if applicable
           if (salesLimit) {
             setSalesLimit(prev => {
                const prevL = parseInt(prev || '0', 10);
                const nextL = prevL - data.soldAmount;
                if (nextL <= 0) return '';
                return nextL.toString();
             });
           }
        }

        // Accumulate unregistered users (deduplicate)
        if (data.unregisteredUsers && data.unregisteredUsers.length > 0) {
          setSessionUnregistered(prev => {
            const combined = new Set([...prev, ...data.unregisteredUsers]);
            return Array.from(combined);
          });
        }

        // Stop bot if backend indicated limit reached (or stock empty)
        if (data.stopBot) {
           setIsBotRunning(false);
           clearInterval(pollIntervalRef.current!);
           pollIntervalRef.current = null;
           setSalesLimit('');
           addLog('🛑 매진 또는 한정 수량 도달로 봇이 자동 종료되었습니다.', 'warning');
        }

      } else {
        console.error("Poll Error:", data.error);
        if (data.error.includes("401") || data.error.includes("auth")) {
           addLog(`❌ Google 인증 오류가 발생했습니다. 권한을 다시 확인해주세요.`, 'error');
           setIsBotRunning(false);
           clearInterval(pollIntervalRef.current!);
        }
      }
    } catch (error) {
      console.error("Polling error:", error);
    }
  };

  const toggleBot = async () => {
    if (!isBotRunning) {
      if (!selectedProductId) return alert("판매할 상품을 선택해주세요.");
      
      const product = products.find(p => p.id === selectedProductId);
      if (!product) return;

      setIsBotRunning(true);
      setSessionOrders([]); // Reset session orders on start
      setSessionUnregistered([]); // Reset unregistered users on start
      addLog(`🚀 봇 작동 시작! 실시간 주문 접수를 대기합니다. ${salesLimit ? `(${salesLimit}개 한정 판매)` : ''}`, 'success');
      
      // Send initial announcement message
      const announcement = salesLimit 
        ? `🔥 ${product.name} ${product.price.toLocaleString()}원 🔥 ${salesLimit}개 한정입니다!`
        : `🔥 ${product.name} ${product.price.toLocaleString()}원 🔥 주문 받습니다!`;

      try {
        const res = await fetch('/api/youtube/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ liveChatId, message: announcement })
        });
        const data = await res.json();
        if (data.success) {
          addLog(`안내 메시지 전송 완료: ${announcement}`, 'info');
        } else {
          addLog(`안내 메시지 전송 실패: ${data.error}`, 'error');
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        addLog(`안내 메시지 전송 오류: ${msg}`, 'error');
      }

      // Initial poll immediately, then every 10 seconds (to save quota)
      pollChat();
      pollIntervalRef.current = setInterval(pollChat, 10000);
    } else {
      setIsBotRunning(false);
      addLog('⏹️ 봇 작동 중지. 마지막 주문 접수를 확인하고 종료합니다...', 'warning');
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      
      // Perform one final poll to catch any chats that happened right before stopping
      await pollChat();
      
      const product = products.find(p => p.id === selectedProductId);
      if (product) {
        const buyerSummary = buildBuyerSummary();
        const totalQty = sessionOrders.reduce((sum, o) => sum + o.qty, 0);
        
        // Only send stop message if there were actual sales or unregistered users
        const signupPrompt = buildSignupPrompt();
        if (totalQty > 0) {
          const remaining = salesLimit ? parseInt(salesLimit, 10) : product.stock;
          const isSoldOut = remaining <= 0;
          let stopAnnouncement = isSoldOut
            ? `[${product.name}] ${buyerSummary} \ud83d\udd25총 ${totalQty}개 전량 매진되었습니다\ud83d\udd25`
            : `[${product.name}] ${buyerSummary} 총 ${totalQty}개 주문 완료! \ud83d\udd25잔여수량 : ${remaining}개\ud83d\udd25 주문을 서둘러주세요\ud83d\ude0b`;
          if (signupPrompt) stopAnnouncement += `\n${signupPrompt}`;
          try {
            fetch('/api/youtube/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ liveChatId, message: stopAnnouncement })
            }).then(res => res.json()).then(data => {
              if (data.success) {
                addLog(`종료 메시지 전송 완료: ${stopAnnouncement}`, 'info');
              }
            });
          } catch (e) {
            console.error(e);
          }
        } else if (signupPrompt) {
          // Nothing sold but there are unregistered users
          try {
            fetch('/api/youtube/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ liveChatId, message: signupPrompt })
            }).then(res => res.json()).then(data => {
              if (data.success) {
                addLog(`회원가입 안내 전송 완료: ${signupPrompt}`, 'info');
              }
            });
          } catch (e) {
            console.error(e);
          }
        } else {
          addLog('주문 없이 종료되어 종료 메시지를 전송하지 않습니다.', 'info');
        }
      }
    }
  };

  // Helper to build buyer summary string like "@다다(1개), @보라몰(3개)"
  const buildBuyerSummary = () => {
    const sumMap: Record<string, number> = {};
    sessionOrders.forEach(o => {
      sumMap[o.name] = (sumMap[o.name] || 0) + o.qty;
    });
    return Object.entries(sumMap).map(([name, qty]) => `${name}(${qty}개)`).join(', ');
  };

  // Helper to build signup prompt for unregistered users
  const buildSignupPrompt = () => {
    if (sessionUnregistered.length === 0) return '';
    return `${sessionUnregistered.join(', ')} 님 간단 회원가입 먼저 부탁드립니다!`;
  };

  const handleManualBroadcast = async () => {
    if (!liveChatId || !selectedProductId) return;
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    setIsManualBroadcasting(true);
    const remaining = salesLimit ? parseInt(salesLimit, 10) : product.stock;
    const totalSold = sessionOrders.reduce((sum, o) => sum + o.qty, 0);
    const buyerSummary = buildBuyerSummary();
    const isSoldOut = remaining <= 0;
    
    let message: string;
    if (totalSold > 0 && isSoldOut) {
      message = `[${product.name}] ${buyerSummary} \ud83d\udd25총 ${totalSold}개 전량 매진되었습니다\ud83d\udd25`;
    } else if (totalSold > 0) {
      message = `[${product.name}] ${buyerSummary} 총 ${totalSold}개 주문 완료! \ud83d\udd25잔여수량 : ${remaining}개\ud83d\udd25 주문을 서둘러주세요\ud83d\ude0b`;
    } else {
      message = `\ud83d\udd25 [${product.name}] 절찬 판매중! 현재 잔여수량: ${remaining}개! 주문을 서둘러주세요 \ud83d\ude0b`;
    }
    // Append signup prompt if there are unregistered users
    const signupPrompt = buildSignupPrompt();
    if (signupPrompt) message += `\n${signupPrompt}`;
    
    try {
      const res = await fetch('/api/youtube/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liveChatId, message })
      });
      const data = await res.json();
      if (data.success) {
        addLog(`📢 수동 현황 전송 완료: ${message}`, 'success');
      } else {
        addLog(`❌ 수동 현황 전송 실패: ${data.error}`, 'error');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      addLog(`❌ 수동 현황 전송 오류: ${msg}`, 'error');
    } finally {
      setIsManualBroadcasting(false);
    }
  };

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  if (status === 'loading' || status === 'unauthenticated') {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-[#673ab7]"></div></div>;
  }

  const selectedProduct = products.find(p => p.id === selectedProductId);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b shadow-sm sticky top-0 z-10 w-full">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-[#673ab7] flex items-center gap-2">
              🤖 YouTube 주문 봇 관리
            </h1>
          </div>
          <Link href="/admin" className="px-4 py-2 text-sm font-bold border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
            ← 대시보드로 돌아가기
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Controls */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              📡 방송 연결
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">YouTube Live URL 또는 Video ID</label>
                <input 
                  type="text" 
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  disabled={isConnected || isConnecting}
                  placeholder="https://youtube.com/live/..."
                  className="w-full text-sm p-3 border rounded-lg focus:ring-2 focus:ring-[#673ab7] outline-none disabled:bg-gray-100"
                />
              </div>
              
              {!isConnected ? (
                <button 
                  onClick={handleConnect}
                  disabled={isConnecting || !videoUrl}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors flex justify-center items-center gap-2 disabled:bg-red-300"
                >
                  {isConnecting ? <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" /> : '🔗 방송 연결하기'}
                </button>
              ) : (
                <button 
                  onClick={handleDisconnect}
                  className="w-full py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg transition-colors flex justify-center items-center gap-2"
                >
                  🔌 연결 해제
                </button>
              )}
            </div>
          </div>

          <div className={`bg-white p-6 rounded-xl shadow-sm border transition-all ${isConnected ? 'border-[#673ab7]' : 'border-gray-100 opacity-60'}`}>
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              🛍️ 판매 상품 설정
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">판매 대기 중인 상품 선택</label>
                <div className="relative" ref={productDropdownRef}>
                  <input 
                    type="text"
                    value={productSearchQuery}
                    onChange={(e) => {
                      setProductSearchQuery(e.target.value);
                      setIsProductDropdownOpen(true);
                      setSelectedProductId('');
                    }}
                    onFocus={() => setIsProductDropdownOpen(true)}
                    disabled={!isConnected || isBotRunning}
                    placeholder="상품을 검색하거나 선택하세요..."
                    className={`w-full text-sm p-3 border rounded-lg focus:ring-2 focus:ring-[#673ab7] outline-none disabled:bg-gray-100 pr-10 ${selectedProductId ? 'border-[#673ab7] bg-[#f8f5ff] font-bold text-[#673ab7]' : ''}`}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {productSearchQuery && !isBotRunning && (
                      <button
                        type="button"
                        onClick={() => { setProductSearchQuery(''); setSelectedProductId(''); setIsProductDropdownOpen(true); }}
                        className="text-gray-400 hover:text-gray-600 w-6 h-6 flex items-center justify-center text-xs"
                      >✕</button>
                    )}
                    <div 
                      className="cursor-pointer text-gray-400 p-1"
                      onClick={() => { if (!isBotRunning) setIsProductDropdownOpen(!isProductDropdownOpen); }}
                    >
                      {isProductDropdownOpen ? '▲' : '▼'}
                    </div>
                  </div>
                  {isProductDropdownOpen && !isBotRunning && (
                    <ul className="absolute z-20 w-full bg-white border mt-1 max-h-48 overflow-y-auto rounded-lg shadow-lg">
                      {products.filter(p => p.name.toLowerCase().includes(productSearchQuery.toLowerCase())).length === 0 ? (
                        <li className="p-3 text-gray-400 text-sm">검색 결과가 없습니다.</li>
                      ) : (
                        products.filter(p => p.name.toLowerCase().includes(productSearchQuery.toLowerCase())).map(p => (
                          <li 
                            key={p.id}
                            onClick={() => {
                              setSelectedProductId(p.id);
                              setProductSearchQuery(p.name);
                              setIsProductDropdownOpen(false);
                            }}
                            className={`py-2 px-3 text-sm cursor-pointer hover:bg-[#f3effb] border-b last:border-0 flex justify-between items-center ${selectedProductId === p.id ? 'bg-[#ede7f6]' : ''}`}
                          >
                            <span className="font-medium text-gray-800">{p.name}</span>
                            <span className={`text-xs font-medium ${p.stock <= 0 ? 'text-red-400' : 'text-emerald-600'}`}>
                              {p.stock <= 0 ? '품절' : `재고: ${p.stock}개`}
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              </div>

              {selectedProduct && (
                <div className="bg-purple-50 p-4 rounded-lg flex justify-between items-center text-sm font-medium border border-purple-100 mb-2">
                  <span className="text-purple-900">{selectedProduct.name}</span>
                  <span className="text-[#673ab7] font-bold">총 재고: {selectedProduct.stock}개</span>
                </div>
              )}

              {selectedProduct && (
                 <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">이번 방송 한정 판매 수량 (선택사항)</label>
                  <input 
                    type="number" 
                    min="1"
                    max={selectedProduct.stock}
                    value={salesLimit}
                    onChange={(e) => setSalesLimit(e.target.value)}
                    disabled={!isConnected || isBotRunning}
                    placeholder={`최대 ${selectedProduct.stock}개까지 입력 가능 (비워두면 무제한)`}
                    className="w-full text-sm p-3 border rounded-lg focus:ring-2 focus:ring-[#673ab7] outline-none disabled:bg-gray-100"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">입력된 수량만큼만 판매되며, 소진 시 봇이 자동 중지됩니다.</p>
                </div>
              )}

              {/* Auto Reply Toggle */}
              <div className="bg-gray-50 border p-3 rounded-lg flex items-start gap-3 mt-4">
                <div className="pt-0.5">
                  <input 
                    type="checkbox" 
                    id="autoReplyToggle"
                    checked={autoReply}
                    onChange={(e) => setAutoReply(e.target.checked)}
                    disabled={!isConnected || isBotRunning}
                    className="w-4 h-4 text-[#673ab7] rounded focus:ring-[#673ab7] cursor-pointer"
                  />
                </div>
                <div>
                  <label htmlFor="autoReplyToggle" className="text-sm font-bold text-gray-700 cursor-pointer block mb-1">
                    주문 접수 시 유튜브 채팅 자동 답장 <span className="text-red-500 text-xs">(할당량 크게 소모)</span>
                  </label>
                  <p className="text-[11px] text-gray-500 leading-tight">
                    체크를 해제하면 고객이 주문했을 때 봇이 일일이 확정 답글을 달지 않습니다. (주문은 정상적으로 접수됩니다) 할당량 보호를 위해 해제를 권장합니다.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button 
                  onClick={toggleBot}
                  disabled={!isConnected || !selectedProductId}
                  className={`w-full py-4 text-white font-black text-lg rounded-xl shadow-md transition-all flex justify-center items-center gap-2 ${
                    !isConnected || !selectedProductId ? 'bg-gray-300 cursor-not-allowed' :
                    isBotRunning ? 'bg-orange-500 hover:bg-orange-600 animate-pulse' : 'bg-[#673ab7] hover:bg-[#5e35b1]'
                  }`}
                >
                  {isBotRunning ? '⏹️ 주문 받기 중지' : '▶️ 봇 주문 받기 시작!'}
                </button>
                {isBotRunning && <p className="text-center text-xs text-orange-600 font-bold animate-pulse">※이 창을 닫으면 봇이 중지됩니다※</p>}
              </div>
              
              {/* Manual Broadcast Button */}
              {isBotRunning && (
                <button 
                  onClick={handleManualBroadcast}
                  disabled={isManualBroadcasting}
                  className="mt-4 w-full py-3 bg-white border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 font-bold rounded-xl transition-colors flex justify-center items-center gap-2"
                >
                  {isManualBroadcasting ? '전송 중...' : '📢 현재 판매 현황 유튜브 수동 전송'}
                </button>
              )}
            </div>
          </div>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
            <h4 className="font-bold mb-2">💡 봇 가이드</h4>
            <ul className="list-disc pl-4 space-y-1 text-xs">
              <li>방송 중에는 이 웹페이지를 <b>끄지 말고 띄워두세요.</b></li>
              <li>시청자가 숫자(예: &apos;3&apos;)를 채팅에 입력하면 자동으로 재고가 차감되고 주문이 생성됩니다.</li>
              <li>할당량 보호를 원하시면 &apos;자동 답장&apos; 체크를 끄시고, 가끔 <b>수동 전송</b> 버튼을 눌러 중간 현황만 방송창에 띄워주세요.</li>
            </ul>
          </div>
        </div>

        {/* Middle/Right Column Wrapper (Logs and Parser) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Terminal Logs (Now Top Half) */}
            <div className="flex flex-col h-[350px] shadow-sm">
              <div className="bg-gray-900 rounded-t-xl p-3 flex items-center justify-between border-b border-gray-700 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="ml-2 font-mono text-xs text-gray-400">bot_terminal.log</span>
                </div>
                <div className="flex gap-4">
                   {isBotRunning && (
                      <span className="flex items-center gap-2 text-xs font-mono text-green-400">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        Polling Chat...
                      </span>
                   )}
                   <button onClick={() => setLogs([])} className="text-xs text-gray-500 hover:text-white font-mono">Clear</button>
                </div>
              </div>
              <div className="bg-[#0f172a] flex-1 p-4 rounded-b-xl overflow-y-auto font-mono text-[13px] shadow-inner">
                {logs.length === 0 ? (
                  <div className="text-gray-600 italic">No logs yet. Connect to a stream and start the bot to view real-time chat and order logs...</div>
                ) : (
                  logs.map(log => (
                    <div key={log.id} className="mb-1.5 break-all">
                      <span className="text-gray-500 mr-2">[{log.time}]</span>
                      <span className={`${
                        log.type === 'info' ? 'text-blue-300' :
                        log.type === 'success' ? 'text-green-400 font-bold' :
                        log.type === 'error' ? 'text-red-400 font-bold' :
                        log.type === 'warning' ? 'text-yellow-300' :
                        'text-gray-300' // chat
                      }`}>
                        {log.type === 'chat' && <span className="text-purple-400 mr-2">💬</span>}
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>

            {/* Embedded Order Entry Tab (Magic Parser) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-gray-50 border-b p-3">
                    <h3 className="font-bold text-gray-700 flex items-center gap-2">
                        <span>⚡</span> 실시간 수기 보완 주문 (Magic Parser)
                    </h3>
                </div>
                <div className="p-4 bg-white">
                    <OrderEntryTab initialProductId={selectedProductId} />
                </div>
            </div>
        </div>
        
      </main>
    </div>
  );
}
