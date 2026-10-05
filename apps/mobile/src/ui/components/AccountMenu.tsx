import { AccountButton } from '@danbro96/lupira-expo-paper/components/AccountButton';
import { useAuth } from '../../state/auth-store';

export function AccountMenu() {
  const user = useAuth(s => s.user);
  return <AccountButton name={user?.name ?? user?.sub ?? 'Account'} />;
}
