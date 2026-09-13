import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
  title: '佣金台账｜财务结算工作台',
  description: '按 2026 统一销售提成规则录入合同、核对回款并生成月度结算说明。',
  openGraph: {
    title: '佣金台账｜月度销售提成结算',
    description: '录入合同与分期回款，按 2026 统一规则生成月度结算结果和销售说明。',
    type: 'website',
    locale: 'zh_CN',
    images: [{ url: '/og.png', width: 1760, height: 910, alt: '佣金台账月度销售提成结算' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '佣金台账｜月度销售提成结算',
    description: '录入合同与分期回款，按 2026 统一规则生成月度结算结果和销售说明。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
