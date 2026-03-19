"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (element: HTMLElement, config: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export default function SignupPage() {
  const router = useRouter();
  const { registerUser } = useApp();
  
  const [formData, setFormData] = useState({
    nickname: '',
    name: '',
    phone: '',
    address: ''
  });
  const [error, setError] = useState('');
  const [googleUser, setGoogleUser] = useState<{ name: string; email: string; picture: string } | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Handle Google Sign-In response
  const handleGoogleResponse = useCallback(async (response: { credential: string }) => {
    setIsGoogleLoading(true);
    try {
      const res = await fetch('/api/auth/google-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });
      const data = await res.json();
      
      if (data.success && data.user) {
        setGoogleUser(data.user);
        // Auto-fill name from Google
        setFormData(prev => ({
          ...prev,
          name: data.user.name || prev.name,
          nickname: data.user.name || prev.nickname, // Use Google name as nickname
        }));
        setError('');
      } else {
        setError('구글 인증에 실패했습니다. 다시 시도해주세요.');
      }
    } catch {
      setError('구글 인증 중 오류가 발생했습니다.');
    } finally {
      setIsGoogleLoading(false);
    }
  }, []);

  // Load Google Sign-In SDK
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
          callback: handleGoogleResponse,
        });
        const btnEl = document.getElementById('google-signin-btn');
        if (btnEl) {
          window.google.accounts.id.renderButton(btnEl, {
            theme: 'outline',
            size: 'large',
            width: '100%',
            text: 'signup_with',
            locale: 'ko',
          });
        }
      }
    };
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, [handleGoogleResponse]);

  // Handle back button on signup page
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      const confirmLeave = window.confirm('진행중인 회원가입을 종료 하겠습니까?');
      if (confirmLeave) {
        window.history.back();
      } else {
        window.history.pushState(null, '', window.location.href);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nickname || !formData.name || !formData.phone || !formData.address) {
      setError('모든 항목을 입력해주세요.');
      return;
    }

    if (formData.phone.length < 13) {
      setError('연락처는 010 번호를 포함하여 11자리를 모두 입력해주세요.');
      return;
    }

    // Auto-formatting checking for '@'
    const finalNickname = formData.nickname.startsWith('@') ? formData.nickname : `@${formData.nickname}`;

    const success = registerUser({
      nickname: finalNickname.trim(),
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      address: formData.address.trim(),
      registeredAt: new Date().toISOString(),
      youtubeHandle: googleUser ? finalNickname.trim() : undefined,
    });

    if (success) {
      alert('회원가입이 완료되었습니다!');
      router.push('/');
    } else {
      setError('이미 존재하는 닉네임입니다. 다른 닉네임을 사용해주세요.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-6 sm:p-10 rounded-2xl shadow-xl w-full max-w-2xl border border-gray-100">
        <div className="text-center mb-8 bg-[#673ab7] pt-2 pb-1.5 rounded-xl text-white flex flex-col items-center justify-center">
          <h1 
            className="text-[2.5rem] sm:text-[3.0rem] font-black text-white tracking-[0.02em] leading-none mt-1 -mb-1"
            style={{ textShadow: '0 4px 6px rgba(0,0,0,0.5), 0 -2px 2px rgba(255,255,255,0.4)' }}
          >
            보라몰
          </h1>
          <p 
            className="text-white border-white/20 font-extrabold text-[1.15rem] sm:text-[1.3rem] tracking-[0.05em] ml-0.5"
            style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5), 0 -1px 1px rgba(255,255,255,0.3)' }}
          >
            간편 주문 서비스
          </p>
        </div>

        {/* Google Sign-In Section */}
        {!googleUser ? (
          <div className="mb-6">
            <div className="text-center mb-3">
              <p className="text-sm text-gray-600 font-medium">구글 계정으로 간편 가입</p>
            </div>
            <div className="flex justify-center" id="google-signin-btn">
              {isGoogleLoading && (
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#673ab7]"></div>
              )}
            </div>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-400">또는 직접 입력</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
            {googleUser.picture && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={googleUser.picture} alt="" className="w-10 h-10 rounded-full" />
            )}
            <div>
              <p className="text-green-700 font-bold text-sm">✅ 구글 계정 연결 완료</p>
              <p className="text-green-600 text-xs">{googleUser.email}</p>
            </div>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">유튜브 닉네임 (YouTube Nickname)</label>
            <div className={`flex items-center w-full min-w-0 border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-[#673ab7] transition-colors border-gray-300 bg-white`}>
              <span className="pl-4 pr-1 text-gray-500 font-bold select-none cursor-default bg-gray-50 py-3 border-r border-gray-200 text-lg">@</span>
              <input 
                type="text" 
                name="nickname"
                value={formData.nickname.replace(/^@/, '')}
                onChange={(e) => {
                  setFormData({ ...formData, nickname: e.target.value });
                  setError('');
                }}
                placeholder="유튜브에서 사용하는 닉네임"
                className="flex-1 min-w-0 p-3 focus:outline-none text-lg bg-transparent"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">⚠️ 유튜브 채팅에서 보이는 닉네임과 동일하게 입력해주세요!</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">이름 (Name)</label>
            <input 
              type="text" 
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="홍길동"
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#673ab7] text-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">전화번호 (Phone)</label>
            <input 
              type="tel" 
              name="phone"
              maxLength={13}
              value={formData.phone}
              onChange={handleChange}
              placeholder="010-0000-0000"
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#673ab7] text-lg"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">주소 (Address)</label>
            <input 
              type="text" 
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="주소를 입력해주세요"
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#673ab7] text-lg"
            />
          </div>

          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

          <button 
            type="submit"
            className="w-full bg-[#673ab7] text-white py-3.5 rounded-lg font-bold text-xl hover:bg-[#5e35b1] transition shadow-md mt-2"
          >
            가입하기
          </button>
        </form>

        <div className="mt-8 text-center text-sm">
          <p className="text-gray-600 mb-2">이미 계정이 있으신가요?</p>
          <button 
            onClick={() => router.push('/')}
            className="text-[#673ab7] font-bold text-lg hover:underline"
          >
            로그인 하러가기
          </button>
        </div>
      </div>
    </div>
  );
}
