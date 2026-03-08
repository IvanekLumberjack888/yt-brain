import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'YT Brain — Video Knowledge Pipeline',
  description: 'Extract knowledge from YouTube, store in Second Brain',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  )
}
