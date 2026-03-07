import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pablo – AI-Powered IDE',
  description: 'Build production-ready software with a 9-stage AI pipeline. By GONXT.',
  icons: {
    icon: [
      { url: '/pablo-favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Pablo – AI-Powered IDE',
    description: 'Build production-ready software with a 9-stage AI pipeline. By GONXT.',
    images: [{ url: '/pablo-logo-512.png', width: 512, height: 512 }],
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Pablo – AI-Powered IDE',
    description: 'Build production-ready software with a 9-stage AI pipeline.',
    images: ['/pablo-logo-512.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-pablo-bg text-pablo-text antialiased">
        {children}
      </body>
    </html>
  );
}
