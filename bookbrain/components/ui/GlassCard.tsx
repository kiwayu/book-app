import { View, type ViewProps } from "react-native";
import { BlurView } from "expo-blur";
import { twMerge } from "tailwind-merge";

interface GlassCardProps extends ViewProps {
  intensity?: number;
  className?: string;
}

export function GlassCard({
  intensity = 40,
  className,
  children,
  ...props
}: GlassCardProps) {
  return (
    <View
      className={twMerge(
        "rounded-2xl overflow-hidden border border-white/10",
        className
      )}
      {...props}
    >
      <BlurView intensity={intensity} tint="dark" className="flex-1 p-4">
        {children}
      </BlurView>
    </View>
  );
}
