"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const result = await signIn("credentials", {
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("비밀번호가 올바르지 않습니다.");
      setIsLoading(false);
    } else {
      router.push("/admin");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md relative overflow-hidden">
        {/* Top edge decoration */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#673ab7] to-[#9c27b0]"></div>
        
        <div className="flex flex-col items-center justify-center mb-6">
            <h1 className="text-2xl font-black text-center text-[#673ab7] tracking-tight">관리자 로그인</h1>
            <p className="text-gray-500 text-sm mt-1">Boramall Admin Access</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
              <input 
                  type="password" 
                  placeholder="관리자 비밀번호를 입력하세요" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-3.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#673ab7] bg-gray-50/50 transition-colors"
                  autoFocus
                  disabled={isLoading}
              />
          </div>
          {error && <p className="text-red-500 text-sm font-medium text-center">{error}</p>}
          <button 
              type="submit"
              disabled={isLoading}
              className={`w-full text-white py-3.5 rounded-xl font-bold transition-all shadow-md mt-2 ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#673ab7] hover:bg-[#5e35b1] hover:shadow-lg active:scale-[0.98]'}`}
          >
              {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between">
            <hr className="w-full border-gray-200" />
            <span className="p-2 text-xs text-gray-400 font-medium whitespace-nowrap">또는</span>
            <hr className="w-full border-gray-200" />
        </div>

        <button
            type="button"
            onClick={() => {
                setIsLoading(true);
                signIn("google", { callbackUrl: "/admin/bot" });
            }}
            disabled={isLoading}
            className={`w-full mt-4 flex items-center justify-center gap-3 bg-white border border-gray-300 text-gray-700 py-3.5 rounded-xl font-bold transition-all shadow-sm ${isLoading ? 'bg-gray-100 cursor-not-allowed text-gray-400' : 'hover:bg-gray-50 hover:shadow-md active:scale-[0.98]'}`}
        >
            <svg viewBox="0 0 24 24" className="w-5 h-5">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google 계정으로 로그인 (YouTube Bot)
        </button>
        
        <div className="mt-8 pt-4 border-t border-gray-100 text-center">
            <Link href="/" className="text-sm text-gray-400 hover:text-[#673ab7] underline underline-offset-4">상점 페이지로 돌아가기</Link>
        </div>
      </div>
    </div>
  );
}
