"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';

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
      registeredAt: new Date().toISOString()
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
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">닉네임 (Unique ID)</label>
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
                placeholder="유튜브 닉네임"
                className="flex-1 min-w-0 p-3 focus:outline-none text-lg bg-transparent"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">* &apos;@&apos;는 자동으로 추가됩니다.</p>
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
