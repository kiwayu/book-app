import type { ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { t } from "@/theme";

interface SectionHeaderProps {
  title: string;
  count?: number;
  emoji?: string;
  chevron?: "expanded" | "collapsed" | "none";
  accentColor?: string;
  rightAction?: ReactNode;
  onPress?: () => void;
}

export function SectionHeader({
  title,
  count,
  emoji,
  chevron = "none",
  accentColor,
  rightAction,
  onPress,
}: SectionHeaderProps) {
  const Wrapper = onPress ? Pressable : View;

  return (
    <Wrapper style={sh.root} onPress={onPress}>
      <View style={sh.left}>
        {chevron !== "none" && (
          <Text style={sh.chevron}>{chevron === "expanded" ? "▾" : "▸"}</Text>
        )}
        {accentColor && <View style={[sh.dot, { backgroundColor: accentColor }]} />}
        <Text style={sh.title}>
          {emoji ? `${emoji} ` : ""}{title}
        </Text>
        {count != null && (
          <View style={sh.badge}>
            <Text style={sh.badgeText}>{count}</Text>
          </View>
        )}
      </View>
      {rightAction && <View style={sh.right}>{rightAction}</View>}
    </Wrapper>
  );
}

const sh = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: t.space._5,
    paddingVertical: t.space._2,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space._3,
  },

  chevron: {
    color: t.color.text.tertiary,
    fontSize: 14,
    width: t.space._4,
  },
  dot: {
    width: t.space._2,
    height: t.space._2,
    borderRadius: t.radius.xs,
    marginRight: t.space._2,
  },
  title: {
    ...t.font.headline,
  },
  badge: {
    marginLeft: t.space._2,
    backgroundColor: t.color.bg.overlay,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space._2,
    paddingVertical: 2,
  },
  badgeText: {
    ...t.font.micro,
    color: t.color.text.secondary,
  },
});
