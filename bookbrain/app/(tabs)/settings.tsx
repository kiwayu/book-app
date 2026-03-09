import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native';

export default function SettingsTab() {
  return (
    <SafeAreaView className="flex-1 bg-neutral-950">
      <View className="px-4 pt-4">
        <Text className="text-white text-2xl font-bold">Settings</Text>
        <Text className="text-neutral-500 text-sm mt-1">
          Preferences and app configuration
        </Text>
      </View>
    </SafeAreaView>
  );
}
