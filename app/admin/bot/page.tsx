"use client";

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [videoUrl, setVideoUrl] = useState('');
  const [liveChatId, setLiveChatId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isBotRunning, setIsBotRunning] = useState(false);
  
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
          productId: selectedProductId
        })
      });

      const data = await response.json();
      
      if (data.success) {
        nextPageTokenRef.current = data.nextPageToken || '';
        
        // Add chat and system logs
        if (data.logs && data.logs.length > 0) {
          data.logs.forEach((log: any) => addLog(log.message, log.type));
        }

        // If stock changed, we could potentially update UI, but for now we trust the logs
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

  const toggleBot = () => {
    if (!isBotRunning) {
      if (!selectedProductId) return alert("판매할 상품을 선택해주세요.");
      setIsBotRunning(true);
      addLog('🚀 봇 작동 시작! 실시간 주문 접수를 대기합니다.', 'success');
      
      // Initial poll immediately, then every 5 seconds
      pollChat();
      pollIntervalRef.current = setInterval(pollChat, 5000);
    } else {
      setIsBotRunning(false);
      addLog('⏹️ 봇 작동 중지. 주문 접수를 일시 정지합니다.', 'warning');
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
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
                <select 
                  className="w-full text-sm p-3 border rounded-lg focus:ring-2 focus:ring-[#673ab7] outline-none disabled:bg-gray-100"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  disabled={!isConnected || isBotRunning}
                >
                  <option value="">상품을 선택하세요...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (잔여재고: {p.stock}개)</option>
                  ))}
                </select>
              </div>

              {selectedProduct && (
                <div className="bg-purple-50 p-4 rounded-lg flex justify-between items-center text-sm font-medium border border-purple-100">
                  <span className="text-purple-900">{selectedProduct.name}</span>
                  <span className="text-[#673ab7] font-bold">{selectedProduct.stock}개</span>
                </div>
              )}

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
          </div>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
            <h4 className="font-bold mb-2">💡 봇 가이드</h4>
            <ul className="list-disc pl-4 space-y-1 text-xs">
              <li>방송 중에는 이 웹페이지를 <b>끄지 말고 띄워두세요.</b></li>
              <li>시청자가 숫자(예: &apos;3&apos;)를 채팅에 입력하면 자동으로 재고가 차감되고 주문이 생성됩니다.</li>
              <li>봇이 유튜브 라이브 채팅창에 자동으로 주문 완료/매진 안내 메시지를 전송합니다.</li>
            </ul>
          </div>
        </div>

        {/* Right Column: Terminal Logs */}
        <div className="lg:col-span-2 flex flex-col h-[calc(100vh-140px)]">
          <div className="bg-gray-900 rounded-t-xl p-4 flex items-center justify-between border-b border-gray-700">
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
          <div className="bg-[#0f172a] flex-1 p-4 rounded-b-xl overflow-y-auto font-mono text-sm shadow-inner">
            {logs.length === 0 ? (
              <div className="text-gray-600 italic">No logs yet. Connect to a stream and start the bot to view real-time chat and order logs...</div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="mb-2 break-all">
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
        
      </main>
    </div>
  );
}
