import { Pressable, Text, type PressableProps } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { twMerge } from "tailwind-merge";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<PressableProps, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label: string;
  className?: string;
  textClassName?: string;
}

const VARIANT_CONTAINER: Record<ButtonVariant, string> = {
  default: "bg-indigo-600/90",
  secondary: "bg-white/10",
  outline: "bg-transparent border border-white/15",
  ghost: "bg-transparent",
  destructive: "bg-red-600/90",
};

const VARIANT_TEXT: Record<ButtonVariant, string> = {
  default: "text-white",
  secondary: "text-neutral-200",
  outline: "text-neutral-200",
  ghost: "text-neutral-300",
  destructive: "text-white",
};

const SIZE_CONTAINER: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 rounded-lg",
  md: "px-4 py-2.5 rounded-xl",
  lg: "px-6 py-3.5 rounded-xl",
};

const SIZE_TEXT: Record<ButtonSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export function Button({
  variant = "default",
  size = "md",
  label,
  className,
  textClassName,
  disabled,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(scale.value, { damping: 15, stiffness: 300 }) }],
  }));

  return (
    <AnimatedPressable
      style={animatedStyle}
      className={twMerge(
        "items-center justify-center flex-row",
        VARIANT_CONTAINER[variant],
        SIZE_CONTAINER[size],
        disabled && "opacity-40",
        className
      )}
      disabled={disabled}
      onPressIn={(e) => {
        scale.value = 0.96;
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = 1;
        onPressOut?.(e);
      }}
      {...props}
    >
      <Text
        className={twMerge(
          "font-semibold",
          VARIANT_TEXT[variant],
          SIZE_TEXT[size],
          textClassName
        )}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
