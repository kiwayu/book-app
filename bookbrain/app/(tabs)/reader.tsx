import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native';
import { useLibraryStore } from '@/store/libraryStore';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'expo-router';

export default function ReaderTab() {
  const currentBook = useLibraryStore((s) => s.currentBook);
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-neutral-950">
      <View className="flex-1 items-center justify-center px-8">
        {currentBook ? (
          <View className="items-center">
            <Text className="text-white text-lg font-bold text-center">
              {currentBook.title}
            </Text>
            <Text className="text-neutral-400 text-sm mt-1 mb-6">
              {currentBook.authors ?? 'Unknown author'}
            </Text>
            <Button
              label="Open Reader"
              onPress={() => router.push('/modal')}
            />
          </View>
        ) : (
          <View className="items-center">
            <Text className="text-neutral-400 text-base text-center">
              No book selected.{'\n'}Choose a book from your library to start reading.
            </Text>
            <Button
              label="Go to Library"
              variant="secondary"
              className="mt-4"
              onPress={() => router.push('/(tabs)')}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
