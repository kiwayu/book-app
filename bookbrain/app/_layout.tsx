import "../global.css";
import { useEffect } from 'react';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { migrateEpubPaths } from '@/services/epubPathsMigration';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  /* One-time legacy migration (AsyncStorage epub_paths -> book_files).
     Exits instantly once its done-marker is set; resume-safe before that.
     Failures are non-fatal — failed entries retry on the next launch. */
  useEffect(() => {
    migrateEpubPaths().catch(() => {});
  }, []);

  return (
    <ThemeProvider value={DarkTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal"
          options={{ presentation: 'modal', headerShown: false }}
        />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
