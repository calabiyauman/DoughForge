import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '🍪 Cookie Cutter Generator',
  description: 'Design custom cookie cutters for 3D printing with real-time preview',
  keywords: ['cookie cutter', '3D printing', 'SVG', 'STL', 'design tool'],
  authors: [{ name: 'Cookie Cutter Generator' }],
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
