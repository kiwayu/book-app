// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<string, ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * SF Symbol → Material Icons mapping for Android and web.
 * Every SF Symbol name passed to <IconSymbol> anywhere in the app must have an
 * entry here, or Android/web will render the fallback glyph. Keep this in sync
 * when introducing a new icon.
 * - Material Icons: https://icons.expo.fyi
 * - SF Symbols: https://developer.apple.com/sf-symbols/
 */
const MAPPING = {
  // Navigation / chrome
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'chevron.up': 'keyboard-arrow-up',
  'chevron.down': 'keyboard-arrow-down',
  'arrow.left': 'arrow-back',
  'xmark': 'close',
  'line.3.horizontal': 'menu',
  'list.bullet': 'format-list-bulleted',

  // Tabs
  'books.vertical.fill': 'library-books',
  'books.vertical': 'library-books',
  'magnifyingglass': 'search',
  'book.fill': 'menu-book',
  'book.closed.fill': 'menu-book',
  'chart.bar.fill': 'bar-chart',
  'gearshape.fill': 'settings',

  // Actions
  'plus': 'add',
  'plus.circle': 'add-circle-outline',
  'plus.circle.fill': 'add-circle',
  'checkmark': 'check',
  'checkmark.circle.fill': 'check-circle',
  'play.fill': 'play-arrow',
  'slider.horizontal.3': 'tune',
  'arrow.counterclockwise': 'refresh',
  'trash': 'delete-outline',

  // Reader / library content
  'bookmark.fill': 'bookmark',
  'bookmark': 'bookmark-border',
  'highlighter': 'border-color',
  'note.text': 'notes',
  'bolt.fill': 'bolt',
  'bolt': 'bolt',
  'star.fill': 'star',
  'clock': 'schedule',
  'clock.fill': 'schedule',
  'calendar': 'calendar-today',
  'folder.fill': 'folder',
  'folder': 'folder-open',
  'tray': 'inbox',
  'questionmark.circle.fill': 'help',
  'exclamationmark.triangle.fill': 'warning',
} as IconMapping;

const FALLBACK_ICON: ComponentProps<typeof MaterialIcons>['name'] = 'help-outline';

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name] ?? FALLBACK_ICON} style={style} />;
}
