import { Cookie, Download, Palette, PackageCheck } from 'lucide-react'

export default function Header() {
  return (
    <header className="text-center mb-4 lg:mb-8">
      <div className="flex items-center justify-center gap-2 lg:gap-3 mb-3 lg:mb-4">
        <Cookie className="w-8 lg:w-10 h-8 lg:h-10 text-white animate-float" />
        <h1 className="text-2xl sm:text-3xl lg:text-5xl font-bold text-white text-shadow">
          DoughForge
        </h1>
      </div>
      
      <p className="text-base lg:text-xl text-white/90 mb-4 lg:mb-6 px-4">
        From one idea to a printable cutter, royal-icing guide, and matched project palette
      </p>
      
      <div className="flex flex-wrap items-center justify-center gap-2 lg:gap-4 text-xs lg:text-sm text-white/80">
        <div className="flex items-center gap-1 lg:gap-2">
          <Download className="w-3 lg:w-4 h-3 lg:h-4" />
          <span>Printable cutter</span>
        </div>
        <div className="w-1 h-1 bg-white/60 rounded-full hidden sm:block"></div>
        <div className="flex items-center gap-1 lg:gap-2">
          <Palette className="w-3 lg:w-4 h-3 lg:h-4" />
          <span>Matched palette</span>
        </div>
        <div className="w-1 h-1 bg-white/60 rounded-full hidden sm:block"></div>
        <div className="hidden sm:flex items-center gap-1 lg:gap-2">
          <PackageCheck className="w-3 lg:w-4 h-3 lg:h-4" />
          <span>Revision-bound guide</span>
        </div>
      </div>
    </header>
  )
}
