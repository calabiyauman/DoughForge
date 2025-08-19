import { Cookie, Github, Download } from 'lucide-react'

export default function Header() {
  return (
    <header className="text-center mb-4 lg:mb-8">
      <div className="flex items-center justify-center gap-2 lg:gap-3 mb-3 lg:mb-4">
        <Cookie className="w-8 lg:w-10 h-8 lg:h-10 text-white animate-float" />
        <h1 className="text-2xl sm:text-3xl lg:text-5xl font-bold text-white text-shadow">
          Cookie Cutter Generator
        </h1>
      </div>
      
      <p className="text-base lg:text-xl text-white/90 mb-4 lg:mb-6 px-4">
        Design custom cookie cutters for 3D printing with real-time preview
      </p>
      
      <div className="flex flex-wrap items-center justify-center gap-2 lg:gap-4 text-xs lg:text-sm text-white/80">
        <div className="flex items-center gap-1 lg:gap-2">
          <Download className="w-3 lg:w-4 h-3 lg:h-4" />
          <span>STL Export</span>
        </div>
        <div className="w-1 h-1 bg-white/60 rounded-full hidden sm:block"></div>
        <div className="flex items-center gap-1 lg:gap-2">
          <Github className="w-3 lg:w-4 h-3 lg:h-4" />
          <span>Open Source</span>
        </div>
        <div className="w-1 h-1 bg-white/60 rounded-full hidden sm:block"></div>
        <span className="hidden sm:inline">No Software Required</span>
      </div>
    </header>
  )
}
