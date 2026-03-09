import { SafeAreaView } from 'react-native';
import SearchScreen from '@/features/books/SearchScreen';

export default function SearchTab() {
  return (
    <SafeAreaView className="flex-1 bg-neutral-950">
      <SearchScreen />
    </SafeAreaView>
  );
}
