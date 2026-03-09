import { SafeAreaView } from 'react-native';
import AnalyticsScreen from '@/features/analytics/AnalyticsScreen';

export default function AnalyticsTab() {
  return (
    <SafeAreaView className="flex-1 bg-neutral-950">
      <AnalyticsScreen />
    </SafeAreaView>
  );
}
