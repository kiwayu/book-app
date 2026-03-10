import { SafeAreaView } from 'react-native-safe-area-context';
import SearchScreen from '@/features/books/SearchScreen';
import { t } from '@/theme';

export default function SearchTab() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg.base }}>
      <SearchScreen />
    </SafeAreaView>
  );
}
