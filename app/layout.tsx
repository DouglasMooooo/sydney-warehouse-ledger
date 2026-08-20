import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sydney Warehouse Operations',
  description: 'Internal warehouse operations over the existing Feishu ledger',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
