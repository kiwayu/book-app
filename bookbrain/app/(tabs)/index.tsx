import { SafeAreaView } from 'react-native-safe-area-context';
import LibraryScreen from '@/features/library/LibraryScreen';
import { t } from '@/theme';

export default function LibraryTab() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg.base }}>
      <LibraryScreen />
    </SafeAreaView>
  );
}
