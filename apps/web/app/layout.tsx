import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '700', '900'],
});

export const metadata: Metadata = {
  title: 'Radiance — AI Career Studio',
  description:
    'AI-powered CV enhancement platform. Upload your resume, paste a job description, and let AI close the gap.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-midnight antialiased">{children}</body>
    </html>
  );
}
