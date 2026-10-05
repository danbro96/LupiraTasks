import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, View } from 'react-native';
import { ProgressBar, Text } from 'react-native-paper';
import { useSyncStatus } from '../../sync/syncStatus';
import { usePrefs } from '../../state/prefs-store';
import { bannerState, type BannerKind } from '../../domain/bannerState';
import type { RootStackParamList } from '../navigation/types';
import { Glyph } from '@danbro96/lupira-expo-paper/components/Glyph';
import { ICONS } from '../icons';
import { useColors } from '../theme';

const ICON_BY_KIND: Record<Exclude<BannerKind, 'syncing'>, (typeof ICONS)['cloudOff' | 'alert']> = {
  offline: ICONS.cloudOff,
  unreachable: ICONS.cloudOff,
  failed: ICONS.alert,
  error: ICONS.alert,
};

/** Sync/error state so offline edits, an unreachable server and failures are obvious: a one-line strip,
 *  and nothing at all when healthy. Syncing is only a thin activity line laid over the top edge, so it
 *  never shifts the screen. */
export function SyncBanner() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const c = useColors();
  const online = useSyncStatus(s => s.online);
  const serverReachable = useSyncStatus(s => s.serverReachable);
  const pending = useSyncStatus(s => s.pending);
  const failed = useSyncStatus(s => s.failed);
  const lastError = useSyncStatus(s => s.lastError);
  const debugEnabled = usePrefs(s => s.debugEnabled);

  const state = bannerState({ online, serverReachable, pending, failed, lastError });
  if (!state) return null;

  if (state.kind === 'syncing') {
    // Syncing fires on every action — worth seeing only in debug mode.
    if (!debugEnabled) return null;
    return (
      <View pointerEvents="none" style={styles.overlay} accessibilityLabel={state.text}>
        <ProgressBar indeterminate color={c.bannerSyncing} style={styles.bar} />
      </View>
    );
  }

  // Failed changes are the only state with a recovery action.
  const reviewable = state.kind === 'failed';
  return (
    <Pressable
      style={[styles.strip, { backgroundColor: state.kind === 'offline' ? c.bannerOffline : c.bannerUnreachable }]}
      onPress={reviewable ? () => nav.navigate('SyncIssues') : undefined}
      disabled={!reviewable}
      accessibilityRole={reviewable ? 'button' : undefined}
      accessibilityLiveRegion="polite"
    >
      {/* The banner tones are dark in both schemes, so the label stays light. */}
      <Text variant="bodySmall" style={[{ color: c.onStatus }, styles.message]} numberOfLines={1}>
        <Glyph name={ICON_BY_KIND[state.kind]} size={14} />  {state.text}
      </Text>
      {reviewable && <Text style={{ color: c.onStatus }}><Glyph name={ICONS.chevronRight} size={16} /></Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Above the screen's later siblings (lists, forms), which would otherwise paint over it.
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
  bar: { height: 2 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28, paddingHorizontal: 12, paddingVertical: 4 },
  message: { flex: 1 },
});
