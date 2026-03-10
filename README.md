# BookBrain

[![Expo](https://img.shields.io/badge/Expo-54.0.33-black?logo=expo)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.81.5-61DAFB?logo=react)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

A beautifully designed React Native app for managing your personal book library. Track reading progress, organize books by custom collections, and browse your library with a smooth, intuitive interface across iOS, Android, and Web.

## Features

- **Smart Library Organization** - Automatically categorize books by reading status (Currently Reading, Recently Read, Series, Custom Folders)
- **Progress Tracking** - Monitor reading progress for active books with real-time updates
- **Advanced Search & Filtering** - Quickly find books with powerful multi-criteria filtering
- **Custom Collections** - Create and manage custom book collections and series groupings
- **Persistent Storage** - Local SQLite database ensures your library is always available offline
- **Cross-Platform Support** - Native iOS and Android apps, plus web preview
- **Modern UI/UX** - Glassmorphic design system with smooth animations and accessibility in mind

## Technologies

### Core Stack
- **React Native** (0.81.5) - Cross-platform mobile framework
- **Expo Router** (6.0.23) - File-based routing for React Native
- **TypeScript** (5.9) - Type-safe development
- **React** (19.1.0) - UI component framework

### Styling & Design
- **NativeWind** (4.2.2) - Tailwind CSS for React Native
- **Custom Theme System** - Design tokens and components using StyleSheet
- **Glassmorphic Design** - Modern glass effect UI elements

### State & Data
- **Zustand** (5.0.11) - Lightweight state management
- **Expo SQLite** (16.0.10) - Local database persistence
- **React Query** (5.90.21) - Server state management

### UI & Animation
- **React Native Reanimated** (4.1.1) - Declarative animations
- **Expo Blur** - Blur effects
- **React Native Screens** - Native screen component handling
- **Victory Native** (41.20.2) - Charts and graphing

### Development
- **ESLint** (9.25.0) - Code quality and consistency
- **Expo CLI** - Development server and build tools

## Getting Started

### Prerequisites

- **Node.js** 18 or higher
- **npm** or **yarn**
- **Expo CLI** (optional, but recommended): `npm install -g expo-cli`

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/book-app.git
cd book-app
```

2. Install dependencies:
```bash
cd bookbrain
npm install
```

3. Start the development server:
```bash
npm start
```

### Running on Different Platforms

After running `npm start`, you'll see a QR code and menu options:

- **iOS Simulator**: Press `i`
- **Android Emulator**: Press `a`
- **Web Browser**: Press `w`
- **Expo Go App**: Scan the QR code with the Expo Go app on your device

### Available Scripts

```bash
npm start          # Start development server
npm run android    # Start on Android Emulator
npm run ios        # Start on iOS Simulator
npm run web        # Start web version
npm run lint       # Run ESLint for code quality checks
npm run reset-project  # Reset to starter template
```

## Project Structure

```
bookbrain/
├── app/                     # Expo Router page routes and navigation
├── components/
│   ├── ui/                 # Reusable UI components (GlassCard, BookCard, etc.)
│   └── features/           # Feature-specific components and layouts
├── features/               # Feature modules (library, search, details, etc.)
├── db/                     # SQLite database schema and queries
├── store/                  # Zustand stores and reducers
├── services/               # API and utility services
├── theme.ts                # Design system tokens and theme configuration
├── styles/                 # Global styles and StyleSheet definitions
└── utils/                  # Helper functions and utilities
```

## Design System

BookBrain uses a cohesive, modern design system:

### Color Palette
- **Primary**: `#5a9dd4` (accent blue)
- **Primary Strong**: `#3f82bc` (darker blue)
- **Primary Light**: `#88BDF2` (light blue)
- **Surfaces**: Light blue-tinted backgrounds with hierarchy (base, raised, overlay, elevated)
- **Text**: Navy gradients from primary `#1e3548` to secondary `#384959`

### Spacing
- **Base Grid**: 8px (`t.space._2` = 8px, `t.space._4` = 16px, etc.)
- **Responsive**: Scales appropriately for tablets

### Key Design Features
- **Glassmorphism**: Semi-transparent glass effect with blur
- **Shadow System**: Carefully calibrated shadows (soft, medium, heavy)
- **Border Radius**: Consistent rounded corners (4px, 8px, 12px)
- **Typography**: 7-level hierarchy (display → micro)
- **Icons**: SF Symbols on iOS, Material Icons on Android

## Development Guidelines

### Styling
- Always use design tokens from `theme.ts`
- Import as: `import { t } from "@/theme"`
- Never hardcode colors, spacing, or radius values
- Use `StyleSheet` for component styles with theme tokens

### Components
- Create reusable UI components in `components/ui/`
- Use custom icons via `IconSymbol` component
- Leverage `GlassCard` and glass effects for modern UI

### State Management
- Use Zustand stores in `store/` for global state
- Prefer local component state for UI-only data
- Persist preferences via SQLite when needed

### Code Quality
- Run `npm run lint` before committing
- Use TypeScript strictly (avoid `any`)
- Write clear, descriptive variable and function names

## Troubleshooting

### Metro Bundler Issues
Clear cache and restart:
```bash
npm start -- --clear
```

### SQLite Errors
Verify the database is properly initialized in `db/database.ts`

### Out of Memory on Android
Increase Node memory:
```bash
export NODE_OPTIONS=--max-old-space-size=4096
npm start
```

### Styling Not Applying
Ensure `nativewind.config.js` is properly configured and clear cache

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Resources

- [Expo Documentation](https://docs.expo.dev)
- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [NativeWind Documentation](https://www.nativewind.dev/)
- [Zustand Documentation](https://github.com/pmndrs/zustand)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
