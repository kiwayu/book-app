import { useWindowDimensions } from "react-native";

export type Breakpoint = "mobile" | "tablet" | "desktop";

const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
} as const;

export function useBreakpoint(): {
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
  columns: number;
} {
  const { width } = useWindowDimensions();

  const breakpoint: Breakpoint =
    width >= BREAKPOINTS.desktop
      ? "desktop"
      : width >= BREAKPOINTS.tablet
        ? "tablet"
        : "mobile";

  return {
    breakpoint,
    isMobile: breakpoint === "mobile",
    isTablet: breakpoint === "tablet",
    isDesktop: breakpoint === "desktop",
    width,
    columns: breakpoint === "desktop" ? 4 : breakpoint === "tablet" ? 3 : 2,
  };
}

export function useResponsiveValue<T>(mobile: T, tablet: T, desktop: T): T {
  const { breakpoint } = useBreakpoint();
  switch (breakpoint) {
    case "desktop": return desktop;
    case "tablet": return tablet;
    default: return mobile;
  }
}
