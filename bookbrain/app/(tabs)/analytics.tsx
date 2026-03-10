import { SafeAreaView } from 'react-native-safe-area-context';
import AnalyticsScreen from '@/features/analytics/AnalyticsScreen';
import { t } from '@/theme';

export default function AnalyticsTab() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg.base }}>
      <AnalyticsScreen />
    </SafeAreaView>
  );
}
