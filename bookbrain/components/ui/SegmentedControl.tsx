import { useRef, useEffect } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Animated } from "react-native";
import { t } from "@/theme";

export interface Segment {
  key: string;
  label: string;
  count?: number;
}

interface SegmentedControlProps {
  segments: Segment[];
  activeKey: string;
  onChange: (key: string) => void;
}

export function SegmentedControl({ segments, activeKey, onChange }: SegmentedControlProps) {
  const scrollRef = useRef<ScrollView>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: t.anim.microBounce.toValue,
        duration: t.anim.microBounce.duration,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: t.anim.spring.friction,
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeKey, scaleAnim]);

  return (
    <View style={sc.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={sc.scroll}
      >
        {segments.map((seg, i) => {
          const active = seg.key === activeKey;
          return (
            <Animated.View
              key={seg.key}
              style={active ? { transform: [{ scale: scaleAnim }] } : undefined}
            >
              <Pressable
                style={[sc.pill, active && sc.pillActive]}
                onPress={() => {
                  onChange(seg.key);
                  if (scrollRef.current && i > 1) {
                    scrollRef.current.scrollTo({ x: Math.max(0, i * 90 - 40), animated: true });
                  }
                }}
              >
                <Text style={[sc.pillLabel, active && sc.pillLabelActive]}>
                  {seg.label}
                </Text>
                {seg.count != null && seg.count > 0 && (
                  <View style={[sc.badge, active && sc.badgeActive]}>
                    <Text style={[sc.badgeText, active && sc.badgeTextActive]}>
                      {seg.count}
                    </Text>
                  </View>
                )}
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const sc = StyleSheet.create({
  container: {
    marginTop: t.space._3,
  },
  scroll: {
    paddingHorizontal: t.space._4,
    gap: t.space._2 - 2,
  },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: t.space._4 - 2,
    paddingVertical: t.space._2,
    borderRadius: t.radius.lg,
    backgroundColor: t.color.glass.bg,
    borderWidth: 1,
    borderColor: t.color.glass.border,
  },
  pillActive: {
    backgroundColor: t.color.accent.bg,
    borderColor: t.color.accent.border,
  },

  pillLabel: {
    color: t.color.text.tertiary,
    fontSize: 13,
    fontWeight: "600",
  },
  pillLabelActive: {
    color: t.color.accent.lightest,
  },

  badge: {
    marginLeft: t.space._2 - 2,
    backgroundColor: t.color.glass.bgHover,
    borderRadius: t.radius.md,
    minWidth: 20,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeActive: {
    backgroundColor: t.color.accent.bgStrong,
  },
  badgeText: {
    color: t.color.text.muted,
    fontSize: 10,
    fontWeight: "700",
  },
  badgeTextActive: {
    color: t.color.accent.lighter,
  },
});
