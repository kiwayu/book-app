import type { ReactNode } from "react";
import { View, Pressable, StyleSheet, type ViewStyle, type StyleProp } from "react-native";
import { t } from "@/theme";

type Variant = "default" | "elevated" | "subtle";

interface GlassCardProps {
  children: ReactNode;
  variant?: Variant;
  padding?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
}

const VARIANTS: Record<Variant, ViewStyle> = {
  default: {
    backgroundColor: t.color.glass.bg,
    borderWidth: 1,
    borderColor: t.color.glass.border,
    ...t.shadow.soft,
  },
  elevated: {
    backgroundColor: t.color.glass.bgHover,
    borderWidth: 1,
    borderColor: t.color.glass.borderStrong,
    ...t.shadow.medium,
  },
  subtle: {
    backgroundColor: "rgba(255,255,255,0.42)",
    borderWidth: 1,
    borderColor: "rgba(136,189,242,0.20)",
  },
};

export function GlassCard({
  children,
  variant = "default",
  padding = t.space._4,
  radius = t.radius["3xl"],
  style,
  onPress,
  onLongPress,
  delayLongPress = 300,
}: GlassCardProps) {
  const cardStyle: ViewStyle[] = [
    VARIANTS[variant],
    { padding, borderRadius: radius },
    style as ViewStyle,
  ];

  if (onPress || onLongPress) {
    return (
      <Pressable
        style={({ pressed }) => [...cardStyle, pressed && styles.pressed]}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={delayLongPress}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  pressed: t.press.scale,
});
