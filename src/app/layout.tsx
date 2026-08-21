import type { Metadata } from 'next'
import { DM_Sans, Space_Mono } from 'next/font/google'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
})

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'AIVOS Second Brain — Knowledge Base & Intelligence Engine',
  description: 'Znalostní báze pro Data Engineering, AI agenty a Claude ekosystém.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" className={`${dmSans.variable} ${spaceMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
