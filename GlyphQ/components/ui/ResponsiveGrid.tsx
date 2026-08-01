import { View, StyleSheet, type ViewStyle } from "react-native";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { t } from "@/theme";

interface ResponsiveGridProps {
  children: React.ReactNode;
  mobileColumns?: number;
  tabletColumns?: number;
  desktopColumns?: number;
  gap?: number;
  style?: ViewStyle;
}

export function ResponsiveGrid({
  children,
  mobileColumns = 2,
  tabletColumns = 3,
  desktopColumns = 4,
  gap = t.space._3,
  style,
}: ResponsiveGridProps) {
  const { breakpoint } = useBreakpoint();

  const columns =
    breakpoint === "desktop"
      ? desktopColumns
      : breakpoint === "tablet"
        ? tabletColumns
        : mobileColumns;

  const items = Array.isArray(children)
    ? children.filter(Boolean)
    : children
      ? [children]
      : [];

  return (
    <View style={[s.grid, { gap }, style]}>
      {items.map((child, i) => (
        <View
          key={i}
          style={{
            width: `${(100 / columns)}%`,
            paddingRight: (i + 1) % columns === 0 ? 0 : gap / 2,
            paddingLeft: i % columns === 0 ? 0 : gap / 2,
          }}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
});
