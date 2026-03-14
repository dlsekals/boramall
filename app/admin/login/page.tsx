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
        
        <div className="mt-8 pt-4 border-t border-gray-100 text-center">
            <Link href="/" className="text-sm text-gray-400 hover:text-[#673ab7] underline underline-offset-4">상점 페이지로 돌아가기</Link>
        </div>
      </div>
    </div>
  );
}
