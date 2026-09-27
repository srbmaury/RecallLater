import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'subtitle' | 'heading' | 'small' | 'smallBold' | 'caption' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 400,
  },
  title: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: 700,
  },
  subtitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 700,
  },
  heading: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: 600,
  },
  small: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: 400,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: 600,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    lineHeight: 18,
  },
});
