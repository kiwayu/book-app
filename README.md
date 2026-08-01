# BookBrain

[![Expo](https://img.shields.io/badge/Expo-54.0.33-black?logo=expo)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.81.5-61DAFB?logo=react)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

A React Native app for reading your own books and keeping track of where you are in them. Import EPUBs, read them in a themed reader, speed-read chapters one word at a time, and browse your library by cover across iOS, Android, and Web.

## Features

### Reading
- **EPUB Reader** - Import EPUBs and read them in-app with tap zones (left third back, right third forward, middle for the menu), swipe navigation, a table of contents, bookmarks, and highlights
- **Speed Reading (RSVP)** - Stream a chapter one word at a time with the Optimal Recognition Point letter pinned so your eyes stay fixed. Adjustable WPM with presets, ±5-word seek, and a start caret for beginning anywhere in the page
- **Chapter Auto-Advance** - Finishing a chapter loads the next one and waits at its first word. Closing the speed reader leaves the page where you actually stopped
- **Reading Themes** - Light, sepia, dark, and night for book pages, or Match app to use the exact app palette. Font, size, line height, and margins are all adjustable and apply live
- **Progress Tracking** - Per-book CFI position, page number, pages left in the chapter, a page-jump slider, and reading session history

### Library
- **Real Covers** - Cover art is extracted from the EPUB on import and shown in a bookstore-style grid
- **Editable Book Details** - Fix titles and authors by hand; missing authors are filled in from the EPUB's own metadata
- **Smart Organization** - Books grouped by reading status (Currently Reading, Recently Read, Series, Custom Folders)
- **Search & Filtering** - Multi-criteria filtering across the library

### Platform
- **Persistent Storage** - Local SQLite database, fully offline
- **Cross-Platform Support** - Native iOS and Android apps, plus web preview
- **Theming** - App-wide theme registry with a Settings picker and a themed navigation bar

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
npm test           # Run the Jest suite (15 suites, 144 tests)
npm run test:e2e   # Run the Playwright web smoke suite
npm run lint       # Run ESLint for code quality checks
npx tsc --noEmit   # Typecheck without emitting
npm run reset-project  # Reset to starter template
```

## Project Structure

```
bookbrain/
├── app/                     # Expo Router page routes and navigation
├── components/
│   ├── ui/                 # Reusable UI components (GlassCard, BookCard, etc.)
│   └── features/           # Feature-specific components and layouts
├── features/
│   ├── library/            # Library grid, filtering, book detail sheet
│   └── reader/             # EPUB reader
│       ├── ReaderScreen.tsx    # Native shell: controls, TOC, settings, messages
│       ├── readerHtml.ts       # Generated WebView document + window.readerApi
│       ├── vendor/             # Inlined epub.js and JSZip (no CDN at runtime)
│       └── rsvp/               # Speed reading: engine.ts + RsvpOverlay.tsx
├── db/                     # SQLite database schema and queries
├── store/                  # Zustand stores and reducers
├── services/               # Import, EPUB metadata/cover extraction, settings
├── docs/testing/           # TDD evidence reports, one per shipped workstream
├── theme.ts                # Design system tokens and theme registry
├── styles/                 # Global styles and StyleSheet definitions
└── utils/                  # Helper functions and utilities
```

### How the reader is wired

The book renders inside a WebView running epub.js. Because the book lives in a
cross-origin iframe the native side cannot touch, the two halves talk by
message passing: `ReaderScreen` injects calls into `window.readerApi`
(`nextPage`, `goToChapter`, `getChapterText`, `nextChapter`, `goToBlock`, …)
and the page posts results back (`locationChanged`, `chapterText`, `currentCfi`).

Speed reading tokenizes the current chapter's text blocks, and each token
records which block it came from. That index is what lets closing the overlay
put the page back on the paragraph you stopped at, and it is why the paragraph
list and the seek target are built from the same block filter.

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
