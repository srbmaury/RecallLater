import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#60646C',
    background: '#FFFFFF',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    border: '#E0E1E6',
    tint: '#1F7AE0',
    onTint: '#FFFFFF',
    danger: '#D93036',
    success: '#2A8745',
  },
  dark: {
    text: '#EDEEF0',
    textSecondary: '#B0B4BA',
    background: '#000000',
    backgroundElement: '#1B1C1F',
    backgroundSelected: '#2E3135',
    border: '#2E3135',
    tint: '#4C9EF5',
    onTint: '#FFFFFF',
    danger: '#FF6369',
    success: '#4CC38A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', rounded: 'normal', mono: 'monospace' },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 8,
  medium: 12,
  large: 16,
  pill: 999,
} as const;
