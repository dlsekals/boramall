"use client";

import { useEffect } from 'react';

const KAKAO_CHANNEL_URL = 'http://pf.kakao.com/_WPaxhX';

export default function InvitePage() {
  useEffect(() => {
    // Redirect to Kakao channel after a short delay
    const timer = setTimeout(() => {
      window.location.href = KAKAO_CHANNEL_URL;
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      color: 'white',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div style={{
        maxWidth: '500px',
        width: '100%',
      }}>
        <img 
          src="/og-invite.jpg.jpg" 
          alt="보라몰 라이브 OPEN" 
          style={{
            width: '100%',
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            marginBottom: '24px'
          }}
        />
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '12px' }}>
          🎉 카카오톡채널 - 보라몰
        </h1>
        <p style={{ fontSize: '16px', color: '#ccc', marginBottom: '32px', lineHeight: '1.6' }}>
          매주 목요일 금요일 저녁 6시<br/>
          보라몰 회원만을 위한 초특가 라이브 방송!
        </p>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          color: '#aaa',
          fontSize: '14px'
        }}>
          <span className="animate-spin" style={{
            display: 'inline-block',
            width: '16px',
            height: '16px',
            border: '2px solid #555',
            borderTop: '2px solid #fff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          카카오 채널로 이동 중...
        </div>
        <a 
          href={KAKAO_CHANNEL_URL}
          style={{
            display: 'inline-block',
            marginTop: '24px',
            padding: '14px 40px',
            background: '#FEE500',
            color: '#3C1E1E',
            fontWeight: 'bold',
            borderRadius: '12px',
            textDecoration: 'none',
            fontSize: '16px'
          }}
        >
          💬 카카오 채널 바로가기
        </a>
      </div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
