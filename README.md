# 🍪 Cookie Cutter Generator - Next.js Edition

A modern, professional-grade cookie cutter designer built with Next.js, TypeScript, and Three.js. Design custom cookie cutters with real-time 3D preview and export directly to STL for 3D printing.

## 🌟 Features

### ✨ **Modern Technology Stack**
- **Next.js 14**: Latest React framework with App Router
- **TypeScript**: Full type safety and excellent developer experience
- **Three.js + React Three Fiber**: Professional 3D rendering
- **Tailwind CSS**: Modern, responsive styling
- **React Context**: Clean state management

### 🎨 **Design Capabilities**
- **SVG Import**: Upload any SVG file and convert to cookie cutter outline
- **Preset Shapes**: Built-in shapes (heart, star, circle, square, flower, butterfly)
- **Real-time 3D Preview**: See your cookie cutter as you design it
- **Interactive Controls**: Drag, zoom, and rotate the 3D model

### 🔧 **Professional Cookie Cutter Profiles**
- **Your Exact Method**: Precise implementation of your professional specifications
  - Outer offset: 6.35mm (0.25")
  - Outer height: 10.16mm (0.4") 
  - Inner offset: -2.79mm (-0.11")
  - Inner height: 17.78mm (0.7")
  - Chamfer: 2.29mm (0.09") at 80°

- **Multiple Profile Types**:
  - **Professional**: Your exact specifications
  - **Classic**: Traditional straight walls
  - **Bella**: Angled cutting edge
  - **Ergonomic**: Rounded handle for comfort

### 📁 **Export & Project Management**
- **STL Export**: Ready for 3D printing
- **OBJ Export**: For advanced editing software
- **Project Save/Load**: Save your designs in JSON format
- **3D Print Optimization**: Automatic optimizations for best results

## 🚀 Getting Started

### **Development Setup**

1. **Clone and Install**
   ```bash
   cd cookie-cutter-nextjs
   npm install
   ```

2. **Run Development Server**
   ```bash
   npm run dev
   ```

3. **Open in Browser**
   ```
   http://localhost:3000
   ```

### **Production Build**

```bash
# Build for production
npm run build

# Start production server
npm start

# Or export static files
npm run export
```

## 📁 Project Structure

```
cookie-cutter-nextjs/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Main application page
│   └── globals.css              # Global styles with Tailwind
├── components/                   # React components
│   ├── Header.tsx               # Application header
│   ├── ControlsPanel.tsx        # Left sidebar controls
│   ├── PreviewPanel.tsx         # 3D preview area
│   ├── ThreeViewer.tsx          # Three.js React component
│   ├── CookieCutterMesh.tsx     # 3D mesh renderer
│   ├── ProfilePreview.tsx       # 2D profile preview
│   └── tabs/                    # Tab components
│       ├── OutlineTab.tsx       # Outline selection
│       ├── ProfileTab.tsx       # Profile parameters
│       └── ExportTab.tsx        # Export options
├── lib/                         # Core libraries
│   ├── context/                 # React Context
│   │   └── CookieCutterContext.tsx
│   ├── generators/              # Core algorithms
│   │   ├── CookieCutterGenerator.ts
│   │   ├── ProfileGenerator.ts
│   │   └── PresetShapes.ts
│   └── parsers/                 # File parsers
│       └── SVGParser.ts
├── package.json                 # Dependencies and scripts
├── next.config.js              # Next.js configuration
├── tailwind.config.js          # Tailwind CSS configuration
├── tsconfig.json               # TypeScript configuration
└── README.md                   # This file
```

## 🎯 Key Technologies

### **Frontend Framework**
- **Next.js 14**: App Router, Static Export, TypeScript support
- **React 18**: Latest React features and concurrent rendering
- **TypeScript**: Full type safety across the entire application

### **3D Graphics**
- **Three.js**: WebGL-based 3D rendering engine
- **React Three Fiber**: React renderer for Three.js
- **React Three Drei**: Useful helpers and abstractions

### **Styling & UI**
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Beautiful, customizable icons
- **CSS Grid & Flexbox**: Modern responsive layouts

### **State Management**
- **React Context**: Clean, type-safe state management
- **Custom Hooks**: Reusable state logic
- **Local Storage**: Project persistence

## 🔧 Development Features

### **Type Safety**
- Full TypeScript coverage
- Strict type checking
- Interface definitions for all data structures

### **Performance**
- Dynamic imports for Three.js (avoids SSR issues)
- Optimized bundle splitting
- Lazy loading of 3D components

### **Developer Experience**
- Hot reload with Next.js
- ESLint configuration
- Clean project structure
- Comprehensive error handling

## 🌐 Deployment Options

### **Vercel (Recommended)**
```bash
# Deploy to Vercel with zero configuration
npx vercel
```

### **Netlify**
```bash
# Build static export
npm run build
npm run export

# Deploy the 'out' folder to Netlify
```

### **Static Hosting**
```bash
# Generate static files
npm run export

# Serve the 'out' folder with any static host
```

## 🎨 Customization

### **Adding New Preset Shapes**
```typescript
// lib/generators/PresetShapes.ts
static customShape(): Shape {
  const points: ShapePoint[] = [
    // Define your shape points
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    // ...
  ]
  
  return { type: 'preset', subtype: 'custom', points }
}
```

### **Creating New Profile Types**
```typescript
// lib/generators/ProfileGenerator.ts
static customProfile(params: any = {}): Profile {
  const points: ProfilePoint[] = [
    // Define your profile cross-section
    { x: 0, y: 0 },
    { x: 5, y: 10 },
    // ...
  ]
  
  return {
    type: 'custom',
    points,
    metadata: { description: 'Custom profile' }
  }
}
```

### **Styling Customization**
```css
/* app/globals.css */
/* Modify Tailwind utilities or add custom CSS */
.custom-button {
  @apply bg-gradient-to-r from-purple-500 to-pink-500;
}
```

## 🔬 Advanced Features

### **3D Rendering Pipeline**
1. **Geometry Generation**: Sweep profile along outline path
2. **Mesh Creation**: Convert to Three.js BufferGeometry
3. **Material Application**: PBR materials with proper lighting
4. **Scene Rendering**: Real-time WebGL rendering

### **File Export System**
1. **STL Generation**: Binary STL format for 3D printing
2. **OBJ Export**: Industry-standard mesh format
3. **Project Files**: JSON-based save/load system

### **Performance Optimizations**
- **Geometry Caching**: Avoid redundant calculations
- **Buffer Management**: Efficient memory usage
- **Render Optimization**: 60fps smooth interactions

## 🎯 Your Professional Method Integration

This Next.js version faithfully implements your exact cookie cutter creation method:

1. **Outer Wall**: 6.35mm offset, 10.16mm height
2. **Inner Wall**: -2.79mm offset (inward), 17.78mm height  
3. **Chamfer**: 2.29mm distance at 80° on interior top edge
4. **Real-time Preview**: See changes instantly in 2D profile and 3D model

## 🚀 **Advantages of Next.js Version**

### ✅ **Modern Development**
- **Type Safety**: Full TypeScript coverage prevents bugs
- **Component Architecture**: Reusable, maintainable code
- **Hot Reload**: Instant feedback during development
- **Modern Tooling**: ESLint, Prettier, advanced debugging

### ✅ **Better Performance**
- **Optimized Bundles**: Code splitting and lazy loading
- **Static Generation**: Fast loading times
- **Efficient Rendering**: React 18 concurrent features
- **Caching**: Intelligent asset caching

### ✅ **Professional Deployment**
- **Vercel Integration**: One-click deployment
- **Static Export**: Deploy anywhere
- **Edge Computing**: Global CDN distribution
- **Analytics**: Built-in performance monitoring

### ✅ **Scalability**
- **Component System**: Easy to extend and modify
- **Clean Architecture**: Separation of concerns
- **State Management**: Predictable data flow
- **Testing Ready**: Framework for unit/integration tests

## 🔮 Future Enhancements

- **Advanced Profiles**: More complex cross-section shapes
- **Texture Mapping**: Add patterns to cookie cutter surfaces
- **Batch Processing**: Generate multiple cutters at once
- **Cloud Storage**: Save projects online
- **Collaboration**: Share designs with other users
- **Advanced Export**: Multiple file formats
- **Mobile App**: React Native version

## 📚 Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run export       # Generate static export

# Deployment
npm run deploy       # Deploy to Vercel (if configured)
```

---

**🍪 Ready to build amazing cookie cutters with modern web technology!**

This Next.js version provides the same powerful cookie cutter generation capabilities with the benefits of a modern, professional web framework. Perfect for developers who want clean architecture, type safety, and easy deployment.

## 🔄 **Migration from HTML Version**

If you want to migrate from the previous HTML version:

1. **Data Compatibility**: Project files are compatible between versions
2. **Feature Parity**: All functionality is preserved and enhanced
3. **Better UX**: Improved interface and interactions
4. **Modern Stack**: Future-proof technology choices

Start developing with `npm run dev` and experience the power of modern web development! 🎯✨
