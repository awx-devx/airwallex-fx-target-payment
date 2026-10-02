import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { AppProviders } from '@/features/data/provider';
import { ScrollLine } from '@/features/scroll-line';
import { MotionProvider } from '@/ui/motion/provider';
import { ToastProvider } from '@/ui/primitives/toast';
import { TooltipProvider } from '@/ui/primitives/tooltip';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

const title = 'FX Target Bill Payment';
const description =
  'Set a target rate on each foreign-currency bill. Pay when the rate hits, or at market by the deadline — never late.';

export const metadata: Metadata = {
  title: {
    default: title,
    template: `%s · ${title}`,
  },
  description,
  icons: {
    icon: '/logomark.png',
    apple: '/logomark.png',
  },
  openGraph: {
    title,
    description,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>
        <MotionProvider>
          <TooltipProvider>
            <ToastProvider>
              <AppProviders>{children}</AppProviders>
              <ScrollLine />
            </ToastProvider>
          </TooltipProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
