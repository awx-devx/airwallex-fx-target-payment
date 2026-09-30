import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FX Target Payment',
  description:
    'Watch a target rate and settle foreign-currency bills by their deadline.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
