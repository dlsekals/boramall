"use client";

import React, { useState, Suspense, useRef, useEffect } from 'react';
import Script from 'next/script';
import { useApp } from './context/AppContext';

function LoginContent() {
  const { registerUser } = useApp();
  // Google Session logic removed

  const [isLogin] = useState(false);
  const [isPostcodeOpen, setIsPostcodeOpen] = useState(false);
  const postcodeRef = useRef<HTMLDivElement>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    nickname: '',
    zonecode: '',
    roadAddress: '',
    detailAddress: ''
  });
  const [error, setError] = useState('');
  const [emptyFields, setEmptyFields] = useState<string[]>([]);
  const [signupSuccessName, setSignupSuccessName] = useState<string | null>(null);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Back button handling - confirmed to leave signup
  useEffect(() => {
    if (!signupSuccessName) {
      window.history.pushState(null, '', window.location.href);

      const handlePopState = () => {
        window.confirm('진행중인 회원가입을 종료 하겠습니까?');
        window.history.pushState(null, '', window.location.href);
      };

      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, [signupSuccessName]);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    
    // Auto-format phone
    if (e.target.name === 'phone') {
        const cleaned = val.replace(/[^0-9]/g, '');
        if (cleaned.length <= 3) {
            val = cleaned;
        } else if (cleaned.length <= 7) {
            val = `${cleaned.substring(0, 3)}-${cleaned.substring(3)}`;
        } else {
            val = `${cleaned.substring(0, 3)}-${cleaned.substring(3, 7)}-${cleaned.substring(7, 11)}`;
        }
    }

    setFormData({ ...formData, [e.target.name]: val });
    if (emptyFields.includes(e.target.name)) {
      setEmptyFields(prev => prev.filter(f => f !== e.target.name));
    }
  };

  const handlePostcode = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const daum = (window as any).daum;
    if (!daum || !daum.Postcode) {
      alert('우편번호 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    if (isPostcodeOpen) {
      setIsPostcodeOpen(false);
      return;
    }

    setIsPostcodeOpen(true);

    // Use a timeout to ensure the div is rendered before embedding
    setTimeout(() => {
        new daum.Postcode({
          width: '100%',
          height: '100%',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          oncomplete: function(data: any) {
            setFormData(prev => ({
              ...prev,
              zonecode: data.zonecode,
              roadAddress: data.roadAddress || data.address
            }));
            
            setEmptyFields(prev => prev.filter(f => f !== 'zonecode' && f !== 'roadAddress'));
            setIsPostcodeOpen(false);
          }
        }).embed(postcodeRef.current);
    }, 100);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setEmptyFields([]);

    if (isLogin) {
      // Login Logic (Manual) - Disabled in UI but kept internal for now
      return;
    } else {
      // Signup Logic
      const missing = [];
      if (!formData.name.trim()) missing.push('name');
      if (!formData.phone.trim() || formData.phone.length !== 13) missing.push('phone');
      if (!formData.nickname.trim()) missing.push('nickname');
      if (!formData.zonecode.trim()) missing.push('zonecode');
      if (!formData.detailAddress.trim()) missing.push('detailAddress');

      if (missing.length > 0) {
        setEmptyFields(missing);
        if (missing.includes('phone') && formData.phone.length > 0 && formData.phone.length < 13) {
          setError('연락처는 010을 포함하여 11자리를 모두 입력해주세요.');
        } else {
          setError('필수 정보를 모두 입력해주세요.');
        }
        return;
      }

      if (!agreedPrivacy) {
        setError('개인정보 수집 및 이용에 동의해주세요.');
        return;
      }
      
      const fullAddress = formData.zonecode 
        ? `[${formData.zonecode}] ${formData.roadAddress} ${formData.detailAddress}`.trim() 
        : formData.detailAddress.trim();

      const finalNickname = formData.nickname.startsWith('@') ? formData.nickname : `@${formData.nickname}`;

      const success = registerUser({
        nickname: finalNickname.trim(),
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        address: fullAddress,
        registeredAt: new Date().toISOString()
      });
      
      if (success) {
        setSignupSuccessName(formData.name);
      } else {
        setError('이미 등록된 전화번호입니다.');
      }
    }
  };

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-6 sm:p-8 overflow-x-hidden bg-gradient-to-b from-[#7c3aed] to-white relative`}>
      {/* Scattered Starfield Background Effect */}
      {/* Scattered Starfield & Cosmic Elements Background */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Crescent Moon - Compact version */}
        <div className="absolute top-[2%] left-[12%] sm:top-[12%] sm:left-[15%] w-10 h-10 opacity-60 animate-moon z-10 transition-all duration-1000">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]">
            <path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 1-9-9z" fill="white" className="mix-blend-overlay"/>
            <circle cx="6" cy="3" r="3" fill="white" className="blur-[15px] opacity-30"/>
          </svg>
        </div>

        {/* Dynamic Stars */}
        <div className="absolute top-[5%] left-[80%] w-1 h-1 bg-white rounded-full animate-star opacity-60" style={{ animationDelay: '0.2s' }}></div>
        <div className="absolute top-[15%] left-[85%] w-1.5 h-1.5 bg-white rounded-full animate-star opacity-40" style={{ animationDelay: '1.5s' }}></div>
        <div className="absolute top-[25%] left-[5%] w-1 h-1 bg-white rounded-full animate-star opacity-30" style={{ animationDelay: '3.1s' }}></div>
        <div className="absolute top-[35%] left-[90%] w-0.5 h-0.5 bg-white rounded-full animate-star opacity-50" style={{ animationDelay: '0.5s' }}></div>
        <div className="absolute top-[10%] left-[45%] w-1 h-1 bg-white rounded-full animate-star opacity-20" style={{ animationDelay: '2.4s' }}></div>
        <div className="absolute top-[45%] left-[15%] w-1.5 h-1.5 bg-white rounded-full animate-star opacity-35" style={{ animationDelay: '4s' }}></div>
        <div className="absolute top-[60%] left-[82%] w-1 h-1 bg-white rounded-full animate-star opacity-25" style={{ animationDelay: '1.8s' }}></div>
        <div className="absolute top-[3%] left-[25%] w-1 h-1 bg-white rounded-full animate-star opacity-45" style={{ animationDelay: '0.9s' }}></div>
        <div className="absolute top-[18%] left-[72%] w-0.5 h-0.5 bg-white rounded-full animate-star opacity-60" style={{ animationDelay: '2.7s' }}></div>
        
        {/* Glowing Orbs */}
        <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-white/5 rounded-full blur-[80px]"></div>
        <div className="absolute top-[10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[100px]"></div>
      </div>

      <style jsx global>{`
        @keyframes pulse-subtle {
          0% { transform: scale(1); box-shadow: 0 4px 15px rgba(124, 58, 237, 0.3); }
          50% { transform: scale(1.02); box-shadow: 0 4px 25px rgba(124, 58, 237, 0.5); }
          100% { transform: scale(1); box-shadow: 0 4px 15px rgba(124, 58, 237, 0.3); }
        }
        @keyframes shimmer-move {
          0% { transform: translateX(-150%) skewX(-20deg); }
          100% { transform: translateX(250%) skewX(-20deg); }
        }
        .custom-animate-pulse {
          animation: pulse-subtle 2s infinite ease-in-out;
        }
        @keyframes luminous-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .animate-luminous-shimmer {
          background: linear-gradient(
            110deg, 
            #7c3aed 35%, 
            #a78bfa 50%, 
            #7c3aed 65%
          );
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: luminous-shimmer 4s linear infinite;
        }
        .custom-animate-shimmer {
          animation: shimmer-move 2.5s infinite linear;
        }
        @keyframes star-sparkle {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes moon-float {
          0%, 100% { transform: translateY(0) rotate(-5deg); filter: drop-shadow(0 0 10px rgba(255,255,255,0.3)); }
          50% { transform: translateY(-5px) rotate(0deg); filter: drop-shadow(0 0 20px rgba(255,255,255,0.5)); }
        }
        .animate-star {
          animation: star-sparkle 3s infinite ease-in-out;
        }
        .animate-moon {
          animation: moon-float 6s infinite ease-in-out;
        }
      `}</style>
      <div 
        className={`max-w-md w-full mx-auto relative bg-[#f4f2ff] rounded-[2.5rem] mt-8 mb-10 sm:my-3 overflow-hidden transition-all duration-500 shadow-[inset_0_1px_2px_rgba(255,255,255,1)]`}
        style={{ 
          boxShadow: `
            0 2px 4px rgba(0,0,0,0.05),
            0 12px 32px rgba(0,0,0,0.1),
            0 60px 120px -25px rgba(124, 58, 237, 0.3),
            inset 0 1px 1px rgba(255,255,255,1)
          `,
          border: '1.5px solid rgba(124, 58, 237, 0.08)',
          borderBottomWidth: '3px',
          borderBottomColor: 'rgba(124, 58, 237, 0.15)'
        }}
      >
        {/* Precision Rim Light (Studio Lighting Effect) */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-white/60 to-transparent z-50"></div>
        <div className="absolute top-[0.5px] inset-x-2 h-[0.5px] bg-white/40 blur-[0.3px] z-50"></div>
        {!signupSuccessName && (
        <div className="pt-4 pb-0.5 text-center flex flex-col items-center justify-center relative overflow-hidden group">
          {/* Subtle Horizon Glow - Reverted to subtle opacity */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-16 bg-gradient-to-r from-transparent via-[#8b5cf6]/10 to-transparent blur-3xl z-0"></div>
          
          {/* Subtle Side Starfield - Reverted to subtle branding dots */}
          <div className="absolute inset-0 pointer-events-none z-10">
            <div className="absolute top-[25%] left-[10%] w-0.5 h-0.5 bg-[#8b5cf6] rounded-full animate-pulse opacity-20"></div>
            <div className="absolute top-[35%] right-[12%] w-0.5 h-0.5 bg-[#8b5cf6] rounded-full animate-pulse opacity-30" style={{ animationDelay: '1.5s' }}></div>
          </div>

          <div className="relative z-20 flex flex-col items-center">
            {/* Tagline: Scale down to 90% */}
            <span className="text-[1.0rem] font-black text-[#8b5cf6] tracking-[0.1em] uppercase mb-0.5 opacity-100 drop-shadow-sm">우주 초특가</span>
            
            {/* Logo: Scale down to 90% with shimmer */}
            <h1 
              className="text-[2.0rem] sm:text-[2.35rem] font-black tracking-[-0.03em] leading-none animate-luminous-shimmer drop-shadow-sm"
            >
              보라몰
            </h1>
            
            {/* Subtitle: Scale down to 90% */}
            <p 
              className="text-[#8b5cf6]/60 font-bold text-[0.8rem] sm:text-[0.9rem] tracking-[0.1em] mt-1 uppercase"
            >
              초간단 회원가입
            </p>
          </div>
        </div>
        )}

        <div className={`px-5 sm:px-7 ${signupSuccessName ? 'pt-5 pb-5' : 'pb-7 sm:pb-9 pt-0.5'}`}>
          {signupSuccessName ? (
            <div className="flex flex-col items-center justify-center py-2 text-center animate-in fade-in slide-in-from-bottom-5 duration-700">
              
              {/* 상단 타이틀 영역 */}
              <div className="space-y-0.5 w-full mt-0 mb-3">
                <h1 className="text-[26px] sm:text-[28px] font-black text-black tracking-tight break-keep">
                  <span className="text-[#7c3aed]">{signupSuccessName}</span>님 환영합니다!
                </h1>
                <p className="text-gray-500 font-bold text-[15px] sm:text-[17px] tracking-tight">
                  회원가입이 완료되었습니다
                </p>
              </div>

              {/* 초간편 주문 가이드 박스 */}
              <div className="w-full bg-[#f6f7fb] rounded-[2.2rem] p-4 sm:p-5 flex flex-col gap-3.5 mb-2">
                
                {/* 가이드 제목 */}
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 text-gray-800" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                  <h3 className="text-[18px] font-bold text-gray-900 tracking-tight">초간편 주문 가이드</h3>
                  <svg className="w-5 h-5 text-gray-800" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                </div>
                
                <div className="space-y-3 w-full">
                  <p className="text-gray-800 font-bold text-[15px] sm:text-[17px] text-center mb-0.5" style={{wordBreak:'keep-all', whiteSpace:'nowrap'}}>
                    라이브 시청 중 사고 싶은 물건이 있다면?
                  </p>
                  
                  {/* 메인 주문 안내 카드 */}
                  <div className="bg-white p-3 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center justify-center gap-3 sm:gap-4 overflow-hidden">
                    
                    {/* 초정밀 3D 스마트폰 목업 */}
                    <div className="w-[65px] h-[120px] bg-[#080808] rounded-[16px] relative shadow-[0_12px_35px_-5px_rgba(0,0,0,0.6),inset_0_0_2px_rgba(255,255,255,0.3)] shrink-0 ring-1 ring-black/80">
                      {/* 물리 버튼 (볼륨/전원) */}
                      <div className="absolute -left-[1.5px] top-6 w-[1.5px] h-3 bg-[#1a1a1a] rounded-l-sm border-r border-black/50"></div>
                      <div className="absolute -left-[1.5px] top-10 w-[1.5px] h-3 bg-[#1a1a1a] rounded-l-sm border-r border-black/50"></div>
                      <div className="absolute -right-[1.5px] top-8 w-[1.5px] h-5 bg-[#1a1a1a] rounded-r-sm border-l border-black/50"></div>
                      
                      {/* 내부 디스플레이 */}
                      <div className="absolute inset-[2px] rounded-[14px] overflow-hidden flex flex-col bg-black shadow-inner border border-white/5">
                        
                        {/* 전면 카메라 홀 (다이내믹 아일랜드) */}
                        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-1 bg-black rounded-full z-30 ring-1 ring-white/5"></div>

                        {/* 유튜브 상단 UI - 정밀 위치 조정 */}
                        <div className="absolute top-[8px] inset-x-0 h-4 flex items-center justify-between px-1.5 z-20">
                           <div className="flex items-center gap-1">
                              <div className="bg-[#ff0000] text-white text-[3.5px] px-[2px] py-[0.5px] rounded-[1px] font-bold">LIVE</div>
                              <div className="flex items-center gap-[1px] bg-black/50 px-[2px] py-[0.5px] rounded-[1px]">
                                 <div className="w-[3px] h-[3px] rounded-full bg-white opacity-90"></div>
                                 <span className="text-white text-[3px] font-bold tracking-tighter">1.2K</span>
                              </div>
                           </div>
                        </div>

                        {/* 라이브 스트림 배경 */}
                        <div className="flex-1 relative bg-gradient-to-b from-[#f5eee0] via-[#e6dbcc] to-[#c7b79a]">
                           <div className="absolute top-2 right-1 w-12 h-12 bg-white/10 rounded-full blur-xl"></div>
                        </div>

                        {/* 실시간 채팅 스트림 (다양한 유저 참여) */}
                        <div className="h-[55px] bg-gradient-to-t from-black/98 via-black/85 to-transparent absolute bottom-0 inset-x-0 px-2 pb-2 flex flex-col justify-end z-10 transition-all">
                           <div className="space-y-[1.8px] flex flex-col overflow-hidden">
                              <div className="flex items-center gap-1 leading-none whitespace-nowrap">
                                 <span className="text-[#a5b4fc] text-[4.5px] font-black shrink-0">@다다</span>
                                 <span className="text-white text-[4.5px] font-medium tracking-tight">3</span>
                              </div>
                              <div className="flex items-center gap-1 leading-none whitespace-nowrap">
                                 <span className="text-[#f9a8d4] text-[4.5px] font-black shrink-0">@랑이맘</span>
                                 <span className="text-white text-[4.5px] font-medium tracking-tight">3</span>
                              </div>
                              <div className="flex items-center gap-1 leading-none whitespace-nowrap">
                                 <span className="text-[#93c5fd] text-[4.5px] font-black shrink-0">@딱부리</span>
                                 <span className="text-white text-[4.5px] font-medium tracking-tight">2</span>
                              </div>
                              <div className="flex items-center gap-1 leading-none whitespace-nowrap">
                                 <span className="text-[#fdba74] text-[4.5px] font-black shrink-0">@태태</span>
                                 <span className="text-white text-[4.5px] font-medium tracking-tighter">1</span>
                              </div>
                           </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col text-left justify-center py-1 min-w-0">
                      <p className="text-gray-800 font-bold text-[15px] sm:text-[16px] leading-snug whitespace-nowrap">유튜브 채팅창에</p>
                      <p className="text-gray-800 font-bold text-[15px] sm:text-[16px] leading-snug mt-0.5 whitespace-nowrap">
                        <span className="text-[#7c3aed]">원하는 수량</span>만
                      </p>
                      <p className="text-gray-800 font-bold text-[15px] sm:text-[16px] leading-snug mt-0.5 mb-1 whitespace-nowrap">
                        <span className="text-[#7c3aed]">숫자</span>로 입력하면
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <svg className="w-8 h-8 text-[#ff4757] shrink-0" fill="none" stroke="currentColor" strokeWidth="4.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path>
                        </svg>
                        <p className="text-black font-black text-[24px] sm:text-[28px] leading-none tracking-tighter">주문 끝!</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* 청구서 안내 카드 */}
                  <div className="bg-white px-4 py-3.5 rounded-[1.5rem] border border-gray-100 shadow-sm flex items-center gap-4 w-full">
                    <div className="relative shrink-0 flex items-center">
                      <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"></path>
                      </svg>
                      {/* 역동적인 속도감 선 */}
                      <div className="absolute -left-1 flex flex-col gap-[2px]">
                        <div className="w-2 h-[1px] bg-gray-300 rounded-full"></div>
                        <div className="w-3 h-[1.5px] bg-gray-400 rounded-full"></div>
                        <div className="w-2 h-[1px] bg-gray-300 rounded-full"></div>
                      </div>
                    </div>
                    <p className="text-gray-700 font-bold text-[15px] sm:text-[16px] text-left leading-snug" style={{wordBreak:'keep-all'}}>
                      청구서는 라이브 종료 후 <strong className="text-[#3b82f6] font-bold">카카오톡 / 문자</strong>로 자동 발송됩니다.
                    </p>
                  </div>
                </div>
              </div>

              {/* 입장 버튼 세션 */}
              <div className="w-full space-y-3">
                <a 
                  href="https://linktw.in/yTVIEQ" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="group flex items-center justify-center w-full bg-[#7c3aed] active:bg-[#6d28d9] text-white py-3.5 sm:py-3.5 rounded-[1.2rem] transition-all duration-300 shadow-md relative overflow-hidden custom-animate-pulse"
                >
                  {/* Shimmer Effect Overlay */}
                  <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-20 custom-animate-shimmer pointer-events-none"></div>
                  
                  <div className="flex items-center gap-2 font-bold text-[18px] sm:text-[20px] tracking-wide relative z-10">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"></path></svg>
                    <span>지금 라이브 입장하기</span>
                  </div>
                </a>
                
              </div>
            </div>
          ) : (
            <>
              {/* Admin Login Button */}
          <form onSubmit={handleSubmit} className="space-y-1.5 sm:space-y-2.5">
            {/* Form part begins directly */}

            <div className="flex items-center gap-1.5 sm:gap-2">
              <label className="w-[50px] shrink-0 flex items-center justify-center bg-[#8b5cf6] py-2 sm:py-3 rounded-md text-sm font-bold text-white tracking-tight shadow-sm">이름</label>
              <input 
                name="name"
                type="text" 
                value={formData.name}
                onChange={handleChange}
                placeholder="이름 입력"
                className={`flex-1 min-w-0 px-2.5 py-1.5 sm:p-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] text-sm sm:text-base transition-colors shadow-inner ${emptyFields.includes('name') ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white/80'}`}
              />
            </div>
            
            <div className="flex items-center gap-1.5 sm:gap-2">
              <label className="w-[50px] shrink-0 flex items-center justify-center bg-[#8b5cf6] py-2 sm:py-3 rounded-md text-sm font-bold text-white tracking-tight shadow-sm">연락처</label>
              <input 
                name="phone"
                type="tel" 
                value={formData.phone}
                onChange={handleChange}
                maxLength={13}
                placeholder="010-0000-0000"
                className={`flex-1 min-w-0 px-2.5 py-1.5 sm:p-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] text-sm sm:text-base transition-colors shadow-inner ${emptyFields.includes('phone') ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white/80'}`}
              />
            </div>
            
            {!isLogin && (
                <>
                <div className="flex items-start gap-1.5 sm:gap-2 pt-0.5">
                  <label className="w-[50px] shrink-0 flex items-center justify-center bg-[#8b5cf6] py-2 sm:py-3 rounded-md text-sm font-bold text-white tracking-tight shadow-sm">닉네임</label>
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5 sm:gap-1">
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                      <div className={`flex items-center flex-1 min-w-0 border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#8b5cf6] transition-colors shadow-inner ${emptyFields.includes('nickname') ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white/90'}`}>
                        <span className="pl-2.5 sm:pl-3 pr-1 text-gray-400 font-bold select-none cursor-default py-1.5 sm:py-2.5">@</span>
                        <input 
                          name="nickname"
                          type="text" 
                          value={formData.nickname.replace(/^@/, '')}
                          onChange={(e) => {
                            setFormData({ ...formData, nickname: e.target.value });
                            if (emptyFields.includes('nickname')) {
                              setEmptyFields(prev => prev.filter(f => f !== 'nickname'));
                            }
                          }}
                          placeholder="유튜브 닉네임"
                          className="flex-1 min-w-0 pr-2.5 py-1.5 sm:p-2.5 focus:outline-none text-sm sm:text-base bg-transparent"
                        />
                      </div>
                      <button 
                        type="button" 
                        onClick={() => window.open('https://m.youtube.com/account', '_blank')}
                        className="px-2.5 py-1.5 sm:py-2.5 bg-gradient-to-b from-[#ff4d4d] to-[#cc0000] text-white rounded-xl font-bold text-xs sm:text-sm shadow-[0_3px_0_#990000,0_4px_4px_rgba(0,0,0,0.2)] active:shadow-[0_0px_0_#990000,0_1px_2px_rgba(0,0,0,0.3)] active:translate-y-[3px] transition-all shrink-0 flex items-center justify-center gap-1 sm:gap-1.5 border border-[#cc0000]"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-[14px] h-[14px] sm:w-[16px] sm:h-[16px]">
                          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                        <span>닉네임 찾기</span>
                      </button>
                    </div>
                    <div className="flex flex-col gap-0.5 sm:gap-1 mt-1">
                      <p className="text-xs sm:text-sm text-[#8b5cf6] font-bold break-keep leading-[1.3] tracking-tight">
                        💡 유튜브 닉네임을 정확히 기재해야 주문이 원활하게 적용됩니다. <span className="text-red-500">예) @다다-h4k</span>
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start gap-1.5 sm:gap-2 mt-0.5 sm:mt-1 w-full">
                  <label className="w-[50px] shrink-0 flex items-center justify-center bg-[#8b5cf6] py-2 sm:py-3 rounded-md text-sm font-bold text-white tracking-tight shadow-sm">주소</label>
                  <div className="flex-1 flex flex-col gap-1 sm:gap-1.5 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        <input 
                          name="zonecode"
                          type="text" 
                          value={formData.zonecode}
                          readOnly
                          onClick={handlePostcode}
                          placeholder="우편번호"
                          className={`flex-1 min-w-0 px-2.5 py-1.5 sm:p-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] text-sm sm:text-base cursor-pointer transition-colors shadow-inner ${emptyFields.includes('zonecode') ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white/70'}`}
                        />
                        <button 
                          type="button" 
                          onClick={handlePostcode} 
                          className="px-2.5 py-1.5 sm:py-2.5 bg-[#475569] text-white rounded-xl font-bold text-xs sm:text-sm hover:bg-[#334155] transition-all shrink-0 shadow-sm flex items-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                          <span>주소 검색</span>
                        </button>
                      </div>
                      
                      <input 
                        name="roadAddress"
                        type="text" 
                        value={formData.roadAddress}
                        readOnly
                        onClick={handlePostcode}
                        placeholder="도로명/지번 자동입력"
                        className={`w-full min-w-0 px-2.5 py-1.5 sm:p-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] text-sm sm:text-base cursor-pointer transition-colors shadow-inner ${emptyFields.includes('zonecode') ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white/70'}`}
                      />
                      
                      <input 
                        name="detailAddress"
                        type="text" 
                        value={formData.detailAddress}
                        onChange={handleChange}
                        placeholder="상세주소 입력"
                        className={`w-full min-w-0 px-2.5 py-1.5 sm:p-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] text-sm sm:text-base transition-colors shadow-inner ${emptyFields.includes('detailAddress') ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white/90'}`}
                      />
                  </div>
                </div>
                </>
            )}

            {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

            {/* Privacy Policy Checkbox */}
            <div className="flex items-center gap-2 mt-2 px-1">
              <input
                type="checkbox"
                id="privacyAgree"
                checked={agreedPrivacy}
                onChange={(e) => setAgreedPrivacy(e.target.checked)}
                style={{ 
                  WebkitAppearance: 'none', 
                  appearance: 'none',
                  backgroundColor: agreedPrivacy ? '#7c3aed' : 'white',
                  backgroundImage: agreedPrivacy ? `url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e")` : 'none',
                }}
                className="w-5 h-5 border-[1.5px] border-[#7c3aed] rounded-sm cursor-pointer shrink-0 transition-colors"
              />
              <label htmlFor="privacyAgree" className="text-[13.5px] text-gray-700 cursor-pointer select-none tracking-tight">
                (필수 체크) 개인정보 수집 및 이용 처리방침 동의
                <button
                  type="button"
                  onClick={() => setShowPrivacyModal(true)}
                  className="ml-1.5 text-[#7c3aed] underline underline-offset-2 font-medium hover:text-[#6d28d9] transition-colors"
                >
                  내용보기
                </button>
              </label>
            </div>

            <button 
              type="submit"
              className={`w-full py-3.5 rounded-2xl font-black text-lg transition-all shadow-lg relative overflow-hidden mt-2 ${agreedPrivacy ? 'bg-[#7c3aed] text-white hover:bg-[#6d28d9] custom-animate-pulse' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
              disabled={!agreedPrivacy}
            >
              {/* Shimmer Effect Overlay */}
              <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-20 custom-animate-shimmer pointer-events-none"></div>
              가입하고 시작하기
            </button>
          </form>
          </>
          )}
        </div>
      </div>

      {/* Postcode Modal Overlay (Fixed to avoid Mobile Flex Touch bugs) */}
      {isPostcodeOpen && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/50 p-4 pt-[15vh] sm:p-0 overflow-y-auto">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col pt-3 mb-10 sm:mb-0 mt-5 sm:mt-0">
            <div className="flex justify-between items-center px-4 pb-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-800 text-lg">우편번호 찾기</h3>
              <button 
                type="button" 
                onClick={() => setIsPostcodeOpen(false)} 
                className="text-gray-400 hover:text-black font-bold p-1 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="w-full bg-white pt-3 px-1 pb-2 rounded-b-xl">
              <div ref={postcodeRef} className="w-full" style={{ height: '450px' }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-[#7c3aed] to-[#a855f7]">
              <h3 className="font-black text-white text-lg">보라몰 개인정보 처리방침</h3>
              <button 
                type="button" 
                onClick={() => setShowPrivacyModal(false)} 
                className="text-white/70 hover:text-white font-bold p-1 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5 text-sm text-gray-700 leading-relaxed">
              <section>
                <h4 className="font-bold text-gray-900 mb-1.5">1. 개인정보의 수집 및 이용 목적</h4>
                <p>보라몰은 유튜브 라이브 커머스 주문 확인, 본인 식별, 상품 배송 및 고객 상담을 위해 개인정보를 수집합니다.</p>
              </section>
              <section>
                <h4 className="font-bold text-gray-900 mb-1.5">2. 수집하는 개인정보 항목</h4>
                <p><span className="font-semibold">필수항목:</span> 이름, 휴대폰 번호, 유튜브 닉네임, 배송지 주소</p>
              </section>
              <section>
                <h4 className="font-bold text-gray-900 mb-1.5">3. 개인정보의 보유 및 이용기간</h4>
                <p>서비스 이용기간 동안 보관하며 동의 철회 또는 서비스 탈퇴시 지체없이 파기합니다.</p>
                <p className="mt-1 text-gray-500 text-xs">단, 전자상거래법 등 관련 법령에 따라 일정 기간 보관될 수 있습니다. (예: 소비자의 불만 또는 분쟁처리에 관한 기록 : 3년)</p>
              </section>
              <section>
                <h4 className="font-bold text-gray-900 mb-1.5">4. 동의를 거부할 권리</h4>
                <p>사용자는 개인정보 수집 및 이용 동의를 거부할 권리가 있습니다. 다만, 필수항목 수집에 동의하지 않으실 경우 보라몰 회원가입 및 주문 서비스 이용이 제한될 수 있습니다.</p>
              </section>
              <section>
                <h4 className="font-bold text-gray-900 mb-1.5">5. 개인정보 보호책임자 및 담당부서</h4>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p><span className="font-semibold">부서명:</span> 보라몰 운영팀</p>
                  <p><span className="font-semibold">연락처:</span> dlsekals3@naver.com</p>
                  <p className="pl-[52px]">010-6269-9612</p>
                  <p className="mt-2 text-xs text-gray-500">문의 접수: 서비스 이용 중 발생하는 모든 개인정보 관련 문의는 위 연락처를 통해 접수해 주시면 신속히 답변드리겠습니다.</p>
                </div>
              </section>
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setAgreedPrivacy(true);
                  setShowPrivacyModal(false);
                }}
                className="w-full bg-[#7c3aed] text-white py-3 rounded-xl font-bold text-base hover:bg-[#6d28d9] transition-all"
              >
                동의
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <>
      {/* 2026 Redirect/Domain Updates are internally handled by the CDN version v2.js */}
      <Script src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js" strategy="lazyOnload" />
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-pulse bg-[#673ab7] w-12 h-12 rounded-full"></div></div>}>
        <LoginContent />
      </Suspense>
    </>
  );
}
