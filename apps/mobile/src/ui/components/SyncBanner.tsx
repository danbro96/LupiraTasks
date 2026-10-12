import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { bannerState } from '@danbro96/lupira-sync-engine/bannerState';
import { useOnline } from '@danbro96/lupira-expo-query/online';
import { StatusBanner } from '@danbro96/lupira-expo-paper/components/StatusBanner';
import { useSyncStatus } from '../../state/syncStatus';
import { usePrefs } from '../../state/prefs-store';
import { TASK_ITEM, TASK_LIST } from '../../domain/ops';
import type { RootStackParamList } from '../navigation/types';

export const SYNC_LABELS = { [TASK_LIST]: 'lists', [TASK_ITEM]: 'tasks' };

export function SyncBanner() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const online = useOnline();
  const status = useSyncStatus();
  const debugEnabled = usePrefs(s => s.debugEnabled);

  const state = bannerState({ ...status, online }, SYNC_LABELS);
  const reviewable = state?.kind === 'parked' || state?.kind === 'error';
  // A routine sync fires on every action — worth seeing only in debug mode.
  return <StatusBanner state={state} onPress={reviewable ? () => nav.navigate('SyncIssues') : undefined} progress={debugEnabled} />;
}
