import React from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      html: any;
      body: any;
      main: any;
      div: any;
      h1: any;
      p: any;
      a: any;
      [elemName: string]: any;
    }
  }
}

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'EnxtAI KYC',
  description: 'KYC system for verification and liveness',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
