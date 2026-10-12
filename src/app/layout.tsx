import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'CER Dashboard | PerbiCubs',
  description: 'Centralized engagement and relationship operations dashboard for PerbiCubs Library Services',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
    shortcut: '/logo.png',
  },
};

import { Toaster } from 'sonner';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light">
      <body>
        <Providers>{children}</Providers>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
