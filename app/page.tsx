'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import ControlsPanel from '@/components/ControlsPanel'
import PreviewPanel from '@/components/PreviewPanel'
import { CookieCutterProvider } from '@/lib/context/CookieCutterContext'

export default function Home() {
  return (
    <CookieCutterProvider>
      <div className="min-h-screen">
        <div className="container mx-auto px-3 lg:px-4 py-4 lg:py-6 max-w-7xl">
          <Header />
          
          <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 lg:gap-8 min-h-[calc(100vh-200px)]">
            {/* Preview Panel - Show first on mobile */}
            <div className="lg:col-span-2 order-1 lg:order-2">
              <div className="h-[40vh] lg:h-full">
                <PreviewPanel />
              </div>
            </div>
            
            {/* Controls Panel - Show second on mobile */}
            <div className="lg:col-span-1 order-2 lg:order-1">
              <ControlsPanel />
            </div>
          </div>
        </div>
      </div>
    </CookieCutterProvider>
  )
}
