"use client";

import { useState, useRef, useEffect } from 'react';
import { useApp, User, Product } from '../../context/AppContext';


export default function OrderEntryTab() {
  const { products, createOrder, users, updateUser, orders } = useApp();
  
  const [selectedProductId, setSelectedProductId] = useState('');
  const [inputText, setInputText] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Copy to clipboard state
  const [copiedProductId, setCopiedProductId] = useState<string | null>(null);
  
  // Parser Result Text States
  const [missingUsersText, setMissingUsersText] = useState('');
  const [successOrdersText, setSuccessOrdersText] = useState('');
  const [copiedResultType, setCopiedResultType] = useState<'missing' | 'success' | null>(null);

  // Manual Mode States
  const [entryMode, setEntryMode] = useState<'magic' | 'manual'>('manual');
  const [manualSearchUserQuery, setManualSearchUserQuery] = useState('');
  const [manualSelectedUser, setManualSelectedUser] = useState<User | null>(null);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const [manualQuantity, setManualQuantity] = useState<number | ''>(1);
  const [quickSearchQuery, setQuickSearchQuery] = useState('');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter only active products
  const activeProducts = products.filter(p => p.isActive);
  const filteredSearchProducts = activeProducts.filter(p => 
      selectedProductId ? true : p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSearchUsers = users.filter(u => 
      !u.isBlacklisted && 
      (u.name.toLowerCase().includes(manualSearchUserQuery.toLowerCase()) || 
       u.nickname.toLowerCase().includes(manualSearchUserQuery.toLowerCase()) ||
       u.phone.includes(manualSearchUserQuery))
  );

  // Get recent unique buyers for Quick Add
  const recentBuyers = [...orders]
      .map(o => users.find(u => u.phone === o.userId))
      .filter((u): u is User => u !== undefined && !u.isBlacklisted)
      // Filter unique by phone
      .filter((u, index, self) => index === self.findIndex((t) => t.phone === u.phone))
      .slice(0, 15); // Show top 15 recent buyers

  // Get recent unique products for Quick Add
  const recentProducts = [...orders]
      .flatMap(o => [...o.items].reverse().map(i => products.find(p => p.name === i.productName)))
      .filter((p): p is Product => p !== undefined && p.isActive)
      // Filter unique by id
      .filter((p, index, self) => index === self.findIndex((t) => t.id === p.id))
      .slice(0, 15); // Show top 15 recent products

  const handleQuickAdd = (user: User) => {
      if (!selectedProductId) {
          alert('상품을 먼저 선택해주세요.');
          return;
      }
      const textToAdd = `${user.nickname}${user.youtubeHandle ? `(${user.youtubeHandle})` : ''} `;
      setInputText(prev => prev + (prev && !prev.endsWith('\n') ? '\n' : '') + textToAdd);
      
      // Focus textarea and move cursor to end
      if (textareaRef.current) {
          textareaRef.current.focus();
      }
  };

  const handleProductQuickAdd = (product: Product) => {
      setSelectedProductId(product.id);
      setSearchQuery(product.name);
      setIsDropdownOpen(false);
      
      // Auto-focus input area if a product is selected
      if (textareaRef.current) {
          textareaRef.current.focus();
      }
  };

  const handleCopyProductInfo = (e: React.MouseEvent, p: Product) => {
      e.stopPropagation();
      const text = `🔥 ${p.name} 초특가 ${p.price}원!! 🔥 ${p.stock}개 한정.`;
      
      if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(() => {
              setCopiedProductId(p.id);
              setTimeout(() => setCopiedProductId(null), 1500);
          }).catch(err => {
              console.error('Failed to copy: ', err);
              // Fallback
              fallbackCopyTextToClipboard(text, p.id);
          });
      } else {
          // Fallback for non-https/older browsers
          fallbackCopyTextToClipboard(text, p.id);
      }
  };

  const fallbackCopyTextToClipboard = (text: string, id: string) => {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
          const successful = document.execCommand('copy');
          if (successful) {
              setCopiedProductId(id);
              setTimeout(() => setCopiedProductId(null), 1500);
          } else {
              setLogs(prev => [`❌ 복사 실패`, ...prev]);
          }
      } catch (err) {
          console.error('Fallback: Oops, unable to copy', err);
          setLogs(prev => [`❌ 복사 실패 (브라우저 미지원)`, ...prev]);
      }
      document.body.removeChild(textArea);
  };

  const handleCopyText = (text: string, type: 'missing' | 'success') => {
      if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(() => {
              setCopiedResultType(type);
              setTimeout(() => setCopiedResultType(null), 2000);
          }).catch(err => {
              console.error('Failed to copy: ', err);
              fallbackCopyTextToClipboardWithState(text, type);
          });
      } else {
          fallbackCopyTextToClipboardWithState(text, type);
      }
  };

  const fallbackCopyTextToClipboardWithState = (text: string, type: 'missing' | 'success') => {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
          const successful = document.execCommand('copy');
          if (successful) {
              setCopiedResultType(type);
              setTimeout(() => setCopiedResultType(null), 2000);
          }
      } catch (err) {
          console.error('Fallback: Oops, unable to copy', err);
      }
      document.body.removeChild(textArea);
  };

  const handleProcess = () => {
    if (!selectedProductId) {
        alert('상품을 먼저 선택해주세요.');
        return;
    }

    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    // Process input text line by line, but tolerate single-line combinations
    const lines = inputText.split(/\r?\n/);
    const targets: { nickname: string, handle: string, qty: number, originalText?: string }[] = [];
    
    let activeUser: { nickname: string, handle: string } | null = null;
    
    // Regex for: @nickname or @nickname(handle) or @nickname (handle) - ignoring hidden characters
    const userRegex = /.*?@[ \t]*([^()（）\s]+)(?:[ \t]*[(（]([^()（）\s]+)[)）])?/;
    // Regex for finding the first positive number
    const qtyRegex = /(\d+)/;

    // Check each line. A user line sets the activeUser.
    // Subsequent lines are parsed for quantities or questions.
    // If a new user is found, the previous activeUser is replaced.
    // If a line contains both, it handles finding the quantity on the same line.
    for (let i = 0; i < lines.length; i++) {
        let currentString = lines[i].trim();
        if (!currentString) continue;

        // 1. Try matching a user line
        const userMatch = currentString.match(userRegex);
        if (userMatch) {
            const capturedNick = userMatch[1].trim();
            const capturedHandle = userMatch[2] ? userMatch[2].trim() : '';
            
            // Check if there's anything else on this line AFTER the username block
            const matchEnd = userMatch.index! + userMatch[0].length;
            const remaining = currentString.substring(matchEnd).trim();
            
            // Edge case: "@다다다1" — nickname ends with digits, no space, no handle.
            // Split trailing digits as quantity if no remaining text and no handle.
            const trailingDigitMatch = !remaining && !capturedHandle && capturedNick.match(/^(.+?)(\d+)$/);
            if (trailingDigitMatch && trailingDigitMatch[1].length > 0) {
                // The non-digit part is the real nickname, digits are the quantity
                activeUser = {
                    nickname: '@' + trailingDigitMatch[1],
                    handle: ''
                };
                // Process the digits as quantity immediately
                const qty = parseInt(trailingDigitMatch[2], 10);
                if (qty > 0) {
                    targets.push({
                        nickname: activeUser.nickname,
                        handle: activeUser.handle,
                        qty: qty
                    });
                    activeUser = null;
                }
                continue;
            }
            
            activeUser = {
                nickname: '@' + capturedNick,
                handle: capturedHandle
            };
            
            if (remaining) {
                // There is more text on the same line! Process it as potential quantity immediately.
                currentString = remaining;
            } else {
                continue; // Move to the next line to find the quantity
            }
        }

        // 2. Try matching a quantity line (if we have an active user waiting for a qty)
        if (activeUser) {
            // NLP-lite: normal conversational fluff check
            if (/(머리에|뭐가|들었을까|이런식으로|입력했는데|오류가|찾아서|수정해줘|고쳐줘)/.test(currentString) && !qtyRegex.test(currentString)) {
                continue; // Ignore pure chat lines that don't have numbers
            }

            // NLP-lite: Question check (if they are asking a question rather than ordering)
            if (/[?？가능되나얼마문의]/.test(currentString)) {
                targets.push({
                    nickname: activeUser.nickname,
                    handle: activeUser.handle,
                    qty: -1, // Use -1 as a special code for "skipped question"
                    originalText: currentString
                });
                activeUser = null;
                continue;
            }

            // NLP-lite: Normalization
            const normalizedString = currentString
                .replace(/하나|한\s*개|한\s*알|한\s*명|한\s*번/g, '1')
                .replace(/둘|두\s*개|두\s*알|두\s*명|두\s*번/g, '2')
                .replace(/셋|세\s*개|세\s*알|세\s*명|세\s*번/g, '3')
                .replace(/넷|네\s*개|네\s*알|네\s*명|네\s*번/g, '4')
                .replace(/다섯|다섯\s*개/g, '5')
                .replace(/여섯|여섯\s*개/g, '6')
                .replace(/일곱|일곱\s*개/g, '7')
                .replace(/여덟|여덟\s*개/g, '8')
                .replace(/아홉|아홉\s*개/g, '9')
                .replace(/열|열\s*개/g, '10')
                // Typos handling (user requested converting 'l' 'i' 'L' 'I' to '1' indiscriminately)
                // ONLY DO THIS IF THE STRING DOES NOT CONTAIN OTHER WORDS TO PREVENT FALSE POSITIVES IN CHAT
                .replace(/^(\s*)[ilIL](\s*)$/g, '$11$2');

            // Find quantity
            const qtyMatch = normalizedString.match(qtyRegex); 
            if (qtyMatch) {
                const qty = parseInt(qtyMatch[1], 10);
                if (qty > 0) {
                    targets.push({
                        nickname: activeUser.nickname,
                        handle: activeUser.handle,
                        qty: qty
                    });
                    activeUser = null; // Reset and wait for the next user
                }
            } else {
                // If it's just random chat text between the handle and the number, ignore it and keep the active user.
                continue;
            }
        }
    }

    console.log("Parsed targets:", targets); // Debug logging

    if (targets.length === 0) {
        alert('주문을 찾을 수 없거나 형식이 잘못되었습니다.\n\n[올바른 형식 예시]\n@닉네임(고유ID)\n1');
        return;
    }

    // 2. Process Orders
    const newLogs: string[] = [];
    let processedCount = 0;
    
    let currentStock = product.stock;

    // Check Total Stock first for safety (ignore -1 skipped questions)
    const totalQtyNeeded = targets.reduce((sum, t) => sum + (t.qty !== -1 ? t.qty : 0), 0);
    if (currentStock < totalQtyNeeded) {
        if (!confirm(`재고가 부족할 수 있습니다. (현재: ${currentStock}, 필요: ${totalQtyNeeded})\n그래도 진행하시겠습니까? (가능한 만큼만 처리됩니다)`)) {
            return;
        }
    }

    // Maintain a local mutable cache of users for this synchronous batch execution.
    // This prevents stale closure reads when updating multiple users rapidly before React state commits.
    let localUsers = [...users];

    // Track actual results during processing for copy text generation
    const succeededTargets: { nickname: string, qty: number }[] = [];
    const failedTargets: { nickname: string }[] = [];

    targets.forEach(target => {
        // Handle skipped questions first
        if (target.qty === -1) {
            newLogs.push(`ℹ️ 안내: ${target.nickname}(${target.handle}) - 질문/문의로 추정되어 건너뜀 ("${target.originalText}")`);
            return;
        }

        // Strategy 1: Find by exact handle first (Prioritize exact ID match) ONLY if handle is provided
        let matchedUser = target.handle 
            ? localUsers.find(u => u.youtubeHandle === target.handle)
            : undefined;
        
        // Strategy 2: If no handle match, find by nickname and AUTO-LINK
        if (!matchedUser) {
             const nicknameMatch = localUsers.find(u => u.nickname === target.nickname);
             
             // CRITICAL: If the input has NO handle but the matched user ALREADY has a handle,
             // they could be a completely different person (e.g., @지니 vs @지니(3zz)).
             // Only allow nickname-only matching when:
             //   - The input HAS a handle (identity verified), OR
             //   - The matched user does NOT have a handle (no prior identity link)
             if (nicknameMatch) {
                 if (target.handle || !nicknameMatch.youtubeHandle) {
                     matchedUser = nicknameMatch;
                 }
                 // else: skip — handle-less input should not match a handle-verified user
             }
             
             // 2b. Partial match: User signed up as "@다다", chat shows "@다다-h4k"
             // ONLY match if target nickname = baseNickname + hyphen/underscore suffix
             // Also requires a handle in the input for safety
             if (!matchedUser && target.handle) {
                 const candidates = localUsers.filter(u => target.nickname.startsWith(u.nickname + '-') || target.nickname.startsWith(u.nickname + '_'))
                                         .sort((a, b) => b.nickname.length - a.nickname.length);
                 if (candidates.length > 0) {
                     matchedUser = candidates[0];
                 }
             }
             
             // Auto-link: ONLY update nickname/handle when a HANDLE is provided.
             if (matchedUser && target.handle) {
                 const oldNick = matchedUser.nickname;
                 const updatedUser = { ...matchedUser, nickname: target.nickname, youtubeHandle: target.handle };
                 
                 updateUser(matchedUser, updatedUser);
                 
                 localUsers = localUsers.map(u => 
                    (u.nickname === matchedUser!.nickname && u.phone === matchedUser!.phone) ? updatedUser : u
                 );
                 
                 matchedUser = updatedUser;
                 
                 if (oldNick !== target.nickname) {
                     newLogs.push(`🔗 닉네임 교체 & 고유ID 등록: ${matchedUser.name} (${oldNick} ➡️ ${target.nickname}(${target.handle}))`);
                 } else {
                     newLogs.push(`🔗 고유ID 자동 등록: ${matchedUser.name} (${target.handle})`);
                 }
             }
        }

        if (!matchedUser) {
            newLogs.push(`❌ 실패: ${target.nickname}${target.handle ? `(${target.handle})` : ''} - 가입되지 않은 닉네임입니다.`);
            failedTargets.push({ nickname: target.nickname });
            return;
        }

        let orderQty = target.qty;
        let isPartial = false;

        if (currentStock <= 0) {
            newLogs.push(`❌ 실패: ${matchedUser.nickname} - 재고 소진 (주문불가)`);
            return;
        }

        if (currentStock < target.qty) {
            orderQty = currentStock;
            isPartial = true;
        }

        currentStock -= orderQty;

        const result = createOrder(matchedUser.phone, [selectedProductId], [orderQty], true);
        if (result.success) {
            if (isPartial) {
                newLogs.push(`⚠️ 부분성공: ${matchedUser.name}(${matchedUser.nickname}) - ${product.name} ${orderQty}개 (재고 부족으로 ${target.qty - orderQty}개 누락)`);
            } else {
                newLogs.push(`✅ 성공: ${matchedUser.name}(${matchedUser.nickname}) - ${product.name} ${orderQty}개`);
            }
            succeededTargets.push({ nickname: target.nickname, qty: orderQty });
            processedCount++;
        } else {
            newLogs.push(`❌ 실패: ${matchedUser.nickname} - ${result.message}`);
            currentStock += target.qty;
        }
    });

    // === Generate copy texts from ACTUAL processing results ===
    
    // 1. Missing users copy text (from failedTargets)
    if (failedTargets.length > 0) {
        const uniqueNames = Array.from(new Set(failedTargets.map(t => t.nickname.replace(/-\w+$/, ''))));
        setMissingUsersText(`${uniqueNames.join(', ')}님 간단 회원가입 먼저 부탁드립니다 🫡😊`);
    } else {
        setMissingUsersText('');
    }

    // 2. Success copy text (from succeededTargets)
    if (succeededTargets.length > 0) {
        const sumMap: Record<string, number> = {};
        succeededTargets.forEach(t => {
            const displayName = t.nickname.replace(/-\w+$/, '');
            sumMap[displayName] = (sumMap[displayName] || 0) + t.qty;
        });
        const formattedList = Object.entries(sumMap).map(([name, qty]) => `${name}(${qty}개)`);
        
        if (currentStock <= 0) {
            setSuccessOrdersText(`${formattedList.join(', ')} 구매 감사드립니다😊\n✨${product.name} 전량 매진 되었습니다!✨`);
        } else {
            setSuccessOrdersText(`${formattedList.join(', ')} 구매 감사드립니다😊\n✨${product.name} 남은 수량은 ${currentStock}개 입니다✨`);
        }
    } else {
        setSuccessOrdersText('');
    }

    setLogs(prev => [`--- ${new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })} 처리 결과 (${processedCount}/${targets.length}) ---`, ...newLogs, ...prev]);
    setInputText('');
    
    // Reset product selection
    setSelectedProductId('');
    setSearchQuery('');
  };

  const handleManualProcess = () => {
      if (!manualSelectedUser) {
          alert('회원을 먼저 선택해주세요.');
          return;
      }
      if (!selectedProductId) {
          alert('상품을 먼저 선택해주세요.');
          return;
      }
      if (!manualQuantity || manualQuantity <= 0) {
          alert('올바른 수량을 입력해주세요.');
          return;
      }

      const product = products.find(p => p.id === selectedProductId);
      if (!product) return;

      let orderQty = manualQuantity;
      let isPartial = false;

      if (product.stock <= 0) {
          alert('재고가 0개입니다. 주문을 접수할 수 없습니다.');
          return;
      }

      if (product.stock < manualQuantity) {
          const proceed = confirm(`재고가 부족합니다!\n요청 수량: ${manualQuantity}개\n현재 재고: ${product.stock}개\n\n남은 재고(${product.stock}개)만큼만 주문을 넣으시겠습니까?`);
          if (!proceed) return;
          
          orderQty = product.stock;
          isPartial = true;
      }

      const result = createOrder(manualSelectedUser.phone, [selectedProductId], [orderQty]);
      if (result.success) {
          if (isPartial) {
              setLogs(prev => [`⚠️ 수기 부분주문 성공: ${manualSelectedUser.name}(${manualSelectedUser.nickname}) - ${product.name} ${orderQty}개 (재고 부족)`, ...prev]);
          } else {
              setLogs(prev => [`✅ 수기 입력 성공: ${manualSelectedUser.name}(${manualSelectedUser.nickname}) - ${product.name} ${orderQty}개`, ...prev]);
          }
          // Reset product and quantity only for continuous input for the same user
          setSelectedProductId('');
          setSearchQuery('');
          setManualQuantity(1);
      } else {
          setLogs(prev => [`❌ 수기 입력 실패: ${manualSelectedUser.name} - ${result.message}`, ...prev]);
      }
  };

  return (
    <div className="space-y-6">

      {/* Mode Toggle */}
      <div className="flex bg-gray-200 p-1 rounded-lg">
        <button
          onClick={() => setEntryMode('magic')}
          className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${entryMode === 'magic' ? 'bg-white shadow text-[#673ab7]' : 'text-gray-500 hover:text-gray-700'}`}
        >
          ✨ 유튜브 라이브 일괄 주문
        </button>
        <button
          onClick={() => setEntryMode('manual')}
          className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${entryMode === 'manual' ? 'bg-white shadow text-[#673ab7]' : 'text-gray-500 hover:text-gray-700'}`}
        >
          ✍️ 개별 수기 주문
        </button>
      </div>
      
      {entryMode === 'magic' ? (
        <div className="flex flex-col lg:flex-row gap-4 xl:gap-6">
          
          {/* Left Column: Recent Buyers Sidebar */}
          <div className="lg:w-[22%] shrink-0 space-y-3">
              <div className="bg-white p-4 rounded-lg shadow-sm h-full max-h-[800px] flex flex-col">
                  {/* Quick Search */}
                  <div className="mb-2">
                      <input
                          type="text"
                          value={quickSearchQuery}
                          onChange={(e) => setQuickSearchQuery(e.target.value)}
                          placeholder="🔍 회원 검색..."
                          className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-[#673ab7] focus:border-[#673ab7] outline-none"
                      />
                  </div>

                  {/* Search Results or Recent Buyers */}
                  {quickSearchQuery.trim() ? (
                      <>
                          <p className="text-xs text-gray-500 mb-2">🔍 검색 결과</p>
                          <div className="overflow-y-auto flex-1 pr-1 space-y-1 pb-2">
                              {users.filter(u => !u.isBlacklisted && (
                                  u.nickname.toLowerCase().includes(quickSearchQuery.toLowerCase()) ||
                                  u.name.toLowerCase().includes(quickSearchQuery.toLowerCase()) ||
                                  (u.youtubeHandle && u.youtubeHandle.toLowerCase().includes(quickSearchQuery.toLowerCase()))
                              )).length === 0 ? (
                                  <p className="text-xs text-gray-400 text-center py-4">검색 결과 없음</p>
                              ) : (
                                  users.filter(u => !u.isBlacklisted && (
                                      u.nickname.toLowerCase().includes(quickSearchQuery.toLowerCase()) ||
                                      u.name.toLowerCase().includes(quickSearchQuery.toLowerCase()) ||
                                      (u.youtubeHandle && u.youtubeHandle.toLowerCase().includes(quickSearchQuery.toLowerCase()))
                                  )).map(user => (
                                      <button
                                          key={user.phone}
                                          onClick={() => { handleQuickAdd(user); setQuickSearchQuery(''); }}
                                          className="w-full text-left px-2 py-1.5 bg-gray-50 hover:bg-[#ede7f6] border hover:border-[#673ab7] rounded text-xs transition-colors group flex items-center gap-1.5 min-w-0"
                                      >
                                          <span className="font-bold text-gray-800 group-hover:text-[#673ab7] truncate">{user.nickname}</span>
                                          {user.youtubeHandle && <span className="text-gray-400 shrink-0">({user.youtubeHandle})</span>}
                                          <span className="text-gray-500 truncate">{user.name}</span>
                                      </button>
                                  ))
                              )}
                          </div>
                      </>
                  ) : (
                      <>
                          <h2 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                              <span className="text-[#673ab7]">⚡</span> 최근 주문자 퀵버튼
                          </h2>
                          <div className="overflow-y-auto flex-1 pr-1 space-y-1 pb-2">
                              {recentBuyers.length === 0 ? (
                                  <p className="text-xs text-gray-400 text-center py-4">최근 주문 내역이 없습니다.</p>
                              ) : (
                                  recentBuyers.map(user => (
                                      <button
                                          key={user.phone}
                                          onClick={() => handleQuickAdd(user)}
                                          className="w-full text-left px-2 py-1.5 bg-gray-50 hover:bg-[#ede7f6] border hover:border-[#673ab7] rounded text-xs transition-colors group flex items-center gap-1.5 min-w-0"
                                      >
                                          <span className="font-bold text-gray-800 group-hover:text-[#673ab7] truncate">{user.nickname}</span>
                                          {user.youtubeHandle && <span className="text-gray-400 shrink-0">({user.youtubeHandle})</span>}
                                          <span className="text-gray-500 truncate">{user.name}</span>
                                      </button>
                                  ))
                              )}
                          </div>
                      </>
                  )}
              </div>
          </div>

          {/* Right Column: Main Magic Parser Area */}
          <div className="flex-1 space-y-6">
              
            {/* 1. Select Product & 2. Input Area */}
            <div className="bg-white p-4 sm:p-5 rounded-lg shadow-sm space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold mb-2">1. 상품 선택</h2>
                <div className="relative flex-1" ref={dropdownRef}>
            <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsDropdownOpen(true);
                    setSelectedProductId(''); // invalidate selection if they type new search
                }}
                onFocus={() => setIsDropdownOpen(true)}
                placeholder="-- 상품을 검색하거나 선택하세요 --"
                className={`w-full border py-1.5 px-3 sm:py-2 sm:px-3 text-sm sm:text-base rounded focus:ring-2 focus:ring-[#673ab7] outline-none ${selectedProductId ? 'border-[#673ab7] bg-[#f8f5ff] font-bold text-[#673ab7]' : ''}`}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                {searchQuery && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setSearchQuery('');
                            setSelectedProductId('');
                            setIsDropdownOpen(true);
                        }}
                        className="text-gray-500 bg-gray-100 hover:bg-gray-200 hover:text-gray-800 active:bg-gray-300 active:scale-95 w-7 h-7 rounded flex items-center justify-center text-sm transition-all mr-1"
                        title="입력 지우기"
                    >
                        ✕
                    </button>
                )}
                <div 
                    className="cursor-pointer text-gray-400 p-2 flex items-center justify-center"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsDropdownOpen(!isDropdownOpen);
                    }}
                >
                    {isDropdownOpen ? '▲' : '▼'}
                </div>
            </div>

            {isDropdownOpen && (
                <ul className="absolute z-10 w-full bg-white border mt-1 max-h-60 overflow-y-auto rounded-md shadow-lg">
                    {filteredSearchProducts.length === 0 ? (
                        <li className="p-3 text-gray-500">검색 결과가 없습니다.</li>
                    ) : (
                        filteredSearchProducts.map(p => {
                            const isMissingPrice = p.price === 0;
                            const isUnavailable = p.stock <= 0 || isMissingPrice;
                            return (
                            <li 
                                key={p.id} 
                                onClick={() => {
                                    if (isUnavailable) return;
                                    setSelectedProductId(p.id);
                                    setSearchQuery(p.name);
                                    setIsDropdownOpen(false);
                                }}
                                className={`py-1.5 px-3 border-b last:border-0 ${isUnavailable ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'hover:bg-[#f3effb] cursor-pointer'} ${selectedProductId === p.id ? 'bg-[#ede7f6]' : ''}`}
                            >
                                <div className="flex justify-between items-center text-sm sm:text-base gap-2">
                                    <span className={`font-medium flex-1 ${isMissingPrice ? 'text-gray-400' : 'text-gray-800'}`}>{p.name} <span className={`text-xs ${isUnavailable ? 'text-gray-400' : 'text-gray-500'} font-normal`}>({isMissingPrice ? '가격 미정' : p.price.toLocaleString() + '원'})</span></span>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className={`text-xs sm:text-sm ${isMissingPrice ? 'text-red-500 font-bold' : p.stock <= 0 ? 'text-red-400 font-bold' : 'text-emerald-600 font-medium'}`}>
                                            {isMissingPrice ? '주문불가' : p.stock <= 0 ? '품절' : `재고: ${p.stock}개`}
                                        </span>
                                        <button 
                                            onClick={(e) => handleCopyProductInfo(e, p)}
                                            disabled={isMissingPrice}
                                            className={`px-2 py-1 rounded transition-colors border shadow-sm flex items-center gap-1 active:scale-95 text-xs ${isMissingPrice ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
                                            title="방송용 문구 복사"
                                        >
                                            {copiedProductId === p.id ? '✅ 복사됨' : '📋 복사'}
                                        </button>
                                    </div>
                                </div>
                            </li>
                        )})
                    )}
                </ul>
            )}
        </div>
        
            {products.length > 0 && activeProducts.length === 0 && (
                <p className="text-red-500 text-xs sm:text-sm mt-2">
                    * &apos;재고 관리&apos; 탭에서 상품을 &apos;보이기(활성)&apos; 상태로 변경해야 여기에 표시됩니다.
                </p>
            )}
              </div>

              {/* 2. Input Area */}
              <div>
                <h2 className="text-lg sm:text-xl font-bold mb-1">2. 텍스트 직접 입력 (Magic Parser)</h2>
                <p className="text-gray-500 text-xs sm:text-sm mb-3">
                    형식: <strong>@닉네임(고유ID) 수량</strong> <br/>
                    여러 줄 복사/붙여넣기 지원
                </p>

                <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="w-full h-32 sm:h-48 border p-3 rounded focus:ring-2 focus:ring-[#673ab7] text-sm sm:text-base font-mono"
                    placeholder="@닉네임(고유ID) 수량 형식으로 입력하세요..."
                    disabled={!selectedProductId}
                />

                <button 
                    onClick={handleProcess}
                    disabled={!selectedProductId || !inputText.trim()}
                    className="mt-3 w-full bg-[#673ab7] text-white text-base sm:text-lg font-bold py-2 sm:py-3 rounded hover:bg-[#5e35b1] disabled:bg-gray-300 disabled:cursor-not-allowed transition flex justify-center items-center gap-2"
                >
                    🚀 파싱 및 등록 (Process)
                </button>

                {/* Dynamic Copy Buttons */}
                {(missingUsersText || successOrdersText) && (
                    <div className="mt-4 p-4 border rounded bg-gray-50 flex flex-col gap-3">
                        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <span className="text-xl">📋</span> 방송용 자동 문구 복사
                        </h3>
                        
                        {missingUsersText && (
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-center bg-white p-2.5 text-sm border border-red-200 rounded text-red-600 font-medium whitespace-pre-wrap">
                                    <span className="flex-1 leading-relaxed">{missingUsersText}</span>
                                    <button 
                                        onClick={() => handleCopyText(missingUsersText, 'missing')}
                                        className={`ml-3 px-3 py-1.5 border rounded whitespace-nowrap text-xs font-bold transition-all shrink-0 ${copiedResultType === 'missing' ? 'bg-red-600 text-white border-red-600' : 'bg-white hover:bg-red-50 text-red-600 border-red-200'}`}
                                    >
                                        {copiedResultType === 'missing' ? '✅ 복사 완료' : '미가입 안내 복사'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {successOrdersText && (
                            <div className="flex flex-col gap-2 mt-1">
                                <div className="flex justify-between items-center bg-white p-2.5 text-sm border border-emerald-200 rounded text-emerald-700 font-medium whitespace-pre-wrap">
                                    <span className="flex-1 leading-relaxed">{successOrdersText}</span>
                                    <button 
                                        onClick={() => handleCopyText(successOrdersText, 'success')}
                                        className={`ml-3 px-3 py-1.5 border rounded whitespace-nowrap text-xs font-bold transition-all shrink-0 ${copiedResultType === 'success' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white hover:bg-emerald-50 text-emerald-600 border-emerald-200'}`}
                                    >
                                        {copiedResultType === 'success' ? '✅ 복사 완료' : '구매/매진 안내 복사'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
              </div>
            </div>
            
            {/* 3. Result Logs (Moved here for side-by-side with sidebar) */}
            <div className="bg-gray-100 p-6 rounded-lg border h-64 overflow-y-auto font-mono text-sm">
              <h3 className="font-bold text-gray-600 mb-2">처리 로그</h3>
              {logs.length === 0 ? (
                  <p className="text-gray-400">여기에 처리 결과가 표시됩니다.</p>
              ) : (
                  <ul className="space-y-1">
                      {logs.map((log, i) => (
                          <li key={i} className={log.startsWith('❌') ? 'text-red-600' : (log.startsWith('---') ? 'text-gray-500 font-bold mt-2 pt-2 border-t' : 'text-blue-700')}>
                              {log}
                          </li>
                      ))}
                  </ul>
              )}
            </div>
          </div>

          {/* Right Column: Recent Products Sidebar */}
          <div className="lg:w-[22%] shrink-0 space-y-3">
              <div className="bg-white p-4 rounded-lg shadow-sm h-full max-h-[800px] flex flex-col border border-emerald-100">
                  <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                      <span className="text-emerald-500">🛍️</span> 최근 판매 상품
                  </h2>
                  <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                      상품명을 클릭하면 중앙 패널에 즉시 선택됩니다.
                  </p>
                  <div className="overflow-y-auto flex-1 pr-1 space-y-2 pb-2">
                      {recentProducts.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-4">최근 판매 내역이 없습니다.</p>
                      ) : (
                          recentProducts.map(product => {
                              const isMissingPrice = product.price === 0;
                              return (
                              <button
                                  key={product.id}
                                  onClick={() => {
                                      if (isMissingPrice) {
                                          alert('판매가가 미정인 상품은 주문할 수 없습니다. 재고 관리 탭에서 판매가를 먼저 입력해주세요.');
                                          return;
                                      }
                                      handleProductQuickAdd(product);
                                  }}
                                  className={`w-full text-left px-3 py-2 bg-gray-50 border rounded text-sm transition-colors group ${selectedProductId === product.id ? 'border-emerald-500 bg-emerald-50 shadow-sm' : isMissingPrice ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-50 hover:border-emerald-500'}`}
                              >
                                  <div className={`font-bold truncate ${selectedProductId === product.id ? 'text-emerald-700' : isMissingPrice ? 'text-gray-400' : 'text-gray-800 group-hover:text-emerald-600'}`}>
                                      {product.name}
                                  </div>
                                  <div className="text-xs text-gray-500 truncate mt-0.5 flex justify-between items-center">
                                      <span>{isMissingPrice ? '가격 미정' : product.price.toLocaleString() + '원'}</span>
                                      <span className={`${isMissingPrice ? 'text-red-500 font-bold' : product.stock <= 0 ? 'text-red-400 font-bold' : 'text-emerald-600'}`}>{isMissingPrice ? '주문불가' : product.stock <= 0 ? '품절' : `잔여: ${product.stock}개`}</span>
                                  </div>
                              </button>
                          )})
                      )}
                  </div>
              </div>
          </div>

        </div>
      ) : (
        <div className="bg-white p-4 sm:p-5 rounded-lg shadow-sm space-y-3 sm:space-y-4">
            <h2 className="text-lg sm:text-xl font-bold">수동 단건 주문 등록</h2>
            
            {/* 1. Select User */}
            <div>
                <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1 sm:mb-2">1. 등록할 대상 회원 선택</label>
                <div className="relative" ref={userDropdownRef}>
                    <input
                        type="text"
                        value={manualSelectedUser ? `${manualSelectedUser.name} ${manualSelectedUser.nickname} ${manualSelectedUser.youtubeHandle ? `(${manualSelectedUser.youtubeHandle})` : ''} - ${manualSelectedUser.phone}` : manualSearchUserQuery}
                        onChange={(e) => {
                            setManualSearchUserQuery(e.target.value);
                            setIsUserDropdownOpen(true);
                            setManualSelectedUser(null);
                        }}
                        onFocus={() => setIsUserDropdownOpen(true)}
                        placeholder="이름, 닉네임, 또는 전화번호로 검색"
                        className={`w-full border py-1.5 px-3 sm:py-2 sm:px-3 text-sm sm:text-base rounded focus:ring-2 focus:ring-[#673ab7] outline-none ${manualSelectedUser ? 'border-[#673ab7] bg-[#f8f5ff] font-bold text-[#673ab7]' : ''}`}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                        {(manualSearchUserQuery || manualSelectedUser) && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setManualSearchUserQuery('');
                                    setManualSelectedUser(null);
                                    setIsUserDropdownOpen(true);
                                }}
                                className="text-gray-500 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 w-7 h-7 rounded flex items-center justify-center text-sm transition-all mr-1"
                            >
                                ✕
                            </button>
                        )}
                        <div 
                            className="cursor-pointer text-gray-400 p-2 flex items-center justify-center"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsUserDropdownOpen(!isUserDropdownOpen);
                            }}
                        >
                            {isUserDropdownOpen ? '▲' : '▼'}
                        </div>
                    </div>

                    {isUserDropdownOpen && (
                        <ul className="absolute z-10 w-full bg-white border mt-1 max-h-60 overflow-y-auto rounded-md shadow-lg">
                            {filteredSearchUsers.length === 0 ? (
                                <li className="p-3 text-gray-500">검색 결과가 없습니다.</li>
                            ) : (
                                filteredSearchUsers.map(u => (
                                    <li 
                                        key={`${u.nickname}-${u.phone}-${u.registeredAt}`} 
                                        onClick={() => {
                                            setManualSelectedUser(u);
                                            setManualSearchUserQuery('');
                                            setIsUserDropdownOpen(false);
                                        }}
                                        className="p-3 border-b last:border-0 hover:bg-[#f3effb] cursor-pointer"
                                    >
                                        <div className="flex justify-between items-center text-sm sm:text-base">
                                            <span className="font-bold text-gray-800">{u.name} <span className="text-[#673ab7] ml-1">{u.nickname}</span> {u.youtubeHandle && <span className="text-gray-600 text-sm ml-1 font-medium">({u.youtubeHandle})</span>}</span>
                                            <span className="text-gray-500 font-mono">{u.phone}</span>
                                        </div>
                                    </li>
                                ))
                            )}
                        </ul>
                    )}
                </div>
            </div>

            {/* 2. Select Product */}
            <div>
                <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1 sm:mb-2">2. 상품 선택</label>
                <div className="relative" ref={dropdownRef}>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setIsDropdownOpen(true);
                            setSelectedProductId('');
                        }}
                        onFocus={() => setIsDropdownOpen(true)}
                        placeholder="-- 상품을 검색하거나 선택하세요 --"
                        className={`w-full border py-1.5 px-3 sm:py-2 sm:px-3 text-sm sm:text-base rounded focus:ring-2 focus:ring-[#673ab7] outline-none ${selectedProductId ? 'border-[#673ab7] bg-[#f8f5ff] font-bold text-[#673ab7]' : ''}`}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSearchQuery('');
                                    setSelectedProductId('');
                                    setIsDropdownOpen(true);
                                }}
                                className="text-gray-500 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 w-7 h-7 rounded flex items-center justify-center text-sm transition-all mr-1"
                            >
                                ✕
                            </button>
                        )}
                        <div 
                            className="cursor-pointer text-gray-400 p-2 flex items-center justify-center"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsDropdownOpen(!isDropdownOpen);
                            }}
                        >
                            {isDropdownOpen ? '▲' : '▼'}
                        </div>
                    </div>

                    {isDropdownOpen && (
                        <ul className="absolute z-10 w-full bg-white border mt-1 max-h-60 overflow-y-auto rounded-md shadow-lg">
                            {filteredSearchProducts.length === 0 ? (
                                <li className="p-3 text-gray-500">검색 결과가 없습니다.</li>
                            ) : (
                                filteredSearchProducts.map(p => (
                                    <li 
                                        key={p.id} 
                                        onClick={() => {
                                            if (p.stock <= 0) return;
                                            setSelectedProductId(p.id);
                                            setSearchQuery(p.name);
                                            setIsDropdownOpen(false);
                                        }}
                                        className={`py-1.5 px-3 border-b last:border-0 ${p.stock <= 0 ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'hover:bg-[#f3effb] cursor-pointer'} ${selectedProductId === p.id ? 'bg-[#ede7f6]' : ''}`}
                                    >
                                        <div className="flex justify-between items-center text-sm sm:text-base">
                                            <span className="font-medium text-gray-800">{p.name} <span className={`text-xs ${p.stock <= 0 ? 'text-gray-400' : 'text-gray-500'} font-normal`}>({p.price.toLocaleString()}원)</span></span>
                                            <span className={`text-xs sm:text-sm ${p.stock <= 0 ? 'text-red-400 font-bold' : 'text-emerald-600 font-medium'}`}>
                                                {p.stock <= 0 ? '품절' : `재고: ${p.stock}개`}
                                            </span>
                                        </div>
                                    </li>
                                ))
                            )}
                        </ul>
                    )}
                </div>
            </div>

            {/* 3. Enter Quantity & Submit */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-end">
                <div className="w-full sm:w-1/3 xl:w-1/4">
                    <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1 sm:mb-2">3. 수량 입력</label>
                    <input 
                        type="number"
                        min="1"
                        value={manualQuantity}
                        onChange={(e) => setManualQuantity(e.target.value === '' ? '' : parseInt(e.target.value))}
                        className="w-full border py-1.5 px-3 sm:py-2 sm:px-3 text-sm sm:text-base rounded focus:ring-2 focus:ring-[#673ab7] outline-none font-bold"
                    />
                </div>
                <button 
                    onClick={handleManualProcess}
                    disabled={!manualSelectedUser || !selectedProductId || !manualQuantity || manualQuantity <= 0}
                    className="w-full sm:flex-1 bg-[#673ab7] text-white text-sm sm:text-base font-bold py-1.5 sm:py-2.5 rounded hover:bg-[#5e35b1] disabled:bg-gray-300 disabled:cursor-not-allowed transition flex justify-center items-center gap-2"
                >
                    🚀 즉시 등록
                </button>
            </div>
        </div>
      )}

    </div>
  );
}
