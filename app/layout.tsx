import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '🍪 DoughForge — Cookie Outcome Designer',
  description: 'Create registered cookie cutters, royal-icing guides, palettes, and project kits from one design.',
  keywords: ['cookie cutter', 'royal icing', 'cookie decorating', '3D printing', 'STL', 'design tool'],
  authors: [{ name: 'DoughForge' }],
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
