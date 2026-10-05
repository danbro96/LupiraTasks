import { ScrollView, StyleSheet, View } from 'react-native';
import { List, Switch } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Screen } from '@danbro96/lupira-expo-paper/components/Screen';
import { IdentityHeader } from '@danbro96/lupira-expo-paper/components/IdentityHeader';
import { VersionLine } from '@danbro96/lupira-expo-diagnostics/VersionLine';
import { SegmentedPicker } from '@danbro96/lupira-expo-paper/components/SegmentedPicker';
import { SyncBanner } from '../components/SyncBanner';
import { useAuth } from '../../state/auth-store';
import { usePrefs, type RowSpacing, type TextSize } from '../../state/prefs-store';
import { spacing } from '../theme';

const TEXT_SIZES = ['small', 'default', 'large'] as const;
const TEXT_SIZE_LABELS: Record<TextSize, string> = { small: 'Small', default: 'Default', large: 'Large' };
const ROW_SPACINGS = ['compact', 'default', 'roomy'] as const;
const ROW_SPACING_LABELS: Record<RowSpacing, string> = { compact: 'Compact', default: 'Default', roomy: 'Roomy' };

export function SettingsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuth(s => s.user);
  const debugEnabled = usePrefs(s => s.debugEnabled);
  const textSize = usePrefs(s => s.textSize);
  const rowSpacing = usePrefs(s => s.rowSpacing);

  return (
    <Screen banner={<SyncBanner />}>
      <ScrollView>
        <IdentityHeader name={user?.name ?? user?.sub ?? 'Not signed in'} sub={user?.name ? user.sub : undefined} />

        <List.Subheader>Account</List.Subheader>
        <List.Item title="Archived lists" onPress={() => nav.navigate('ArchivedLists')} />

        <List.Subheader>Display</List.Subheader>
        <List.Item title="Task text size" />
        <View style={styles.picker}>
          <SegmentedPicker
            options={TEXT_SIZES}
            selected={textSize}
            onSelect={v => void usePrefs.getState().setTextSize(v)}
            getLabel={v => TEXT_SIZE_LABELS[v]}
          />
        </View>
        <List.Item title="Row spacing" />
        <View style={styles.picker}>
          <SegmentedPicker
            options={ROW_SPACINGS}
            selected={rowSpacing}
            onSelect={v => void usePrefs.getState().setRowSpacing(v)}
            getLabel={v => ROW_SPACING_LABELS[v]}
          />
        </View>

        <List.Subheader>Developer</List.Subheader>
        <List.Item
          title="Enable debug"
          description="Show the developer tools and the on-device log"
          right={() => (
            <Switch
              value={debugEnabled}
              onValueChange={v => void usePrefs.getState().setDebugEnabled(v)}
              accessibilityLabel="Enable debug"
            />
          )}
        />
        {debugEnabled ? (
          <List.Item title="Developer options" onPress={() => nav.navigate('Developer')} />
        ) : null}

        <List.Subheader>About</List.Subheader>
        <VersionLine />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  picker: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
});
