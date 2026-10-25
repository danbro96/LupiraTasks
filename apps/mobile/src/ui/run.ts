import { toast, toastError } from '@danbro96/lupira-expo-feedback/toast';

/** Fires a user action from an event handler; a rejection surfaces as `failMsg`. */
export function run(action: () => Promise<unknown>, failMsg: string, successMsg?: string): void {
  action().then(
    () => {
      if (successMsg) toast(successMsg);
    },
    () => toastError(failMsg),
  );
}
