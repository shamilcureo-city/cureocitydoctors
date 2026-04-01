import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cureocity Doctors',
  description: 'AI-Powered Clinical Intelligence Platform',
  manifest: '/manifest.json',
  themeColor: '#0F766E',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-cureocity-bg text-cureocity-text font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
