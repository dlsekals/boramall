import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '카카오톡채널 - 보라몰',
  description: '[초대장] 매주 목요일 금요일 저녁 6시 보라몰 회원만을 위한 초특가 라이브 방송이 시작됩니다',
  openGraph: {
    title: '카카오톡채널 - 보라몰',
    description: '[초대장] 매주 목요일 금요일 저녁 6시 보라몰 회원만을 위한 초특가 라이브 방송이 시작됩니다',
    images: [
      {
        url: 'https://boramall.vercel.app/og-invite.jpg.jpg',
        width: 1024,
        height: 580,
        alt: '보라몰 라이브 OPEN',
      },
    ],
    type: 'website',
    siteName: '보라몰',
  },
  twitter: {
    card: 'summary_large_image',
    title: '카카오톡채널 - 보라몰',
    description: '[초대장] 매주 목요일 금요일 저녁 6시 보라몰 회원만을 위한 초특가 라이브 방송이 시작됩니다',
    images: ['https://boramall.vercel.app/og-invite.jpg.jpg'],
  },
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
