'use client'

import { useState } from 'react'
import { Upload, Settings, Download, Save } from 'lucide-react'
import OutlineTab from './tabs/OutlineTab'
import ProfileTab from './tabs/ProfileTab'
import ExportTab from './tabs/ExportTab'

const tabs = [
  { id: 'outline', label: 'Outline', icon: Upload },
  { id: 'profile', label: 'Profile', icon: Settings },
  { id: 'export', label: 'Export', icon: Download },
]

export default function ControlsPanel() {
  const [activeTab, setActiveTab] = useState('outline')

  const renderTabContent = () => {
    switch (activeTab) {
      case 'outline':
        return <OutlineTab />
      case 'profile':
        return <ProfileTab />
      case 'export':
        return <ExportTab />
      default:
        return <OutlineTab />
    }
  }

  return (
    <div className="card overflow-hidden flex flex-col h-auto lg:h-full">
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-4 lg:mb-6 -mx-2 lg:mx-0">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab flex-1 lg:flex-none flex flex-col lg:flex-row items-center justify-center gap-1 lg:gap-2 py-3 lg:py-2 px-2 lg:px-4 text-xs lg:text-sm ${
                activeTab === tab.id ? 'active' : ''
              }`}
            >
              <Icon className="w-4 h-4 lg:w-4 lg:h-4" />
              <span className="lg:hidden">{tab.label}</span>
              <span className="hidden lg:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto max-h-[60vh] lg:max-h-none">
        {renderTabContent()}
      </div>
    </div>
  )
}
