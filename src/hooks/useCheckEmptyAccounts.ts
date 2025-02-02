import { useSelector } from 'react-redux';
import { RootState } from 'stores/index';
import { AccountsSlice } from 'stores/types';

function comparor(prev: AccountsSlice, next: AccountsSlice): boolean {
  if (next.isReady) {
    if ((prev.accounts.length && !next.accounts.length) || (!prev.accounts.length && next.accounts.length)) {
      return false;
    }
  }

  return true;
}

export default function useCheckEmptyAccounts(): boolean {
  const { accounts } = useSelector((state: RootState) => state.accounts, comparor);

  return !accounts.length;
}
