/*
 * Regression: the library list uses Swipeable (a PanGestureHandler), which
 * crashes on device with "PanGestureHandler must be used as a descendant of
 * GestureHandlerRootView" unless the root layout provides that wrapper.
 * Web never enforces this, so only a native run (or this test) catches it.
 */
import { create, act } from "react-test-renderer";
import { GestureHandlerRootView } from "react-native-gesture-handler";

jest.mock("../../global.css", () => ({}), { virtual: true });
jest.mock("react-native-reanimated", () => ({}), { virtual: true });
jest.mock("@/services/epubPathsMigration", () => ({
  migrateEpubPaths: jest.fn(async () => {}),
}));

jest.mock("expo-router", () => {
  const React = require("react");
  const Stack = Object.assign(
    ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    { Screen: () => null }
  );
  return { Stack };
});
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

import RootLayout from "../_layout";

const mockStack = jest.requireMock("expo-router").Stack;

test("root layout wraps the navigator in GestureHandlerRootView", () => {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<RootLayout />);
  });

  const rootViews = tree.root.findAllByType(GestureHandlerRootView);
  expect(rootViews.length).toBeGreaterThan(0);
  // the navigator (Stack) must render inside it
  expect(rootViews[0].findAllByType(mockStack).length).toBeGreaterThan(0);
  act(() => tree.unmount());
});
