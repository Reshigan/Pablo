import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pablo – AI-Powered IDE',
  description: 'The OpenHands Killer. Build features with AI.',
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
