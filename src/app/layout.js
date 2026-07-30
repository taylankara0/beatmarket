import CartDrawer from '@/components/CartDrawer';
import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import { CartProvider } from '@/context/CartContext';
import {
  Geist,
  Geist_Mono,
} from 'next/font/google';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata = {
  title: {
    default: 'BeatMarket',
    template: '%s | BeatMarket',
  },
  description:
    'Discover, license, and sell beats securely on BeatMarket.',
};

export default function RootLayout({
  children,
}) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable}`}
        style={{
          minHeight: '100vh',
          margin: 0,
          background: '#f9f9f9',
        }}
      >
        <CartProvider>
          <div
            style={{
              minHeight: '100vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Navbar />
            <CartDrawer />

            <main
              style={{
                flex: 1,
              }}
            >
              {children}
            </main>

            <Footer />
          </div>
        </CartProvider>
      </body>
    </html>
  );
}