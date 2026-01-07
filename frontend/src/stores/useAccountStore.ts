import { create } from 'zustand';
import { accountsApi } from '../api/accounts';
import type { Account } from '../api/types';

interface AccountStore {
  accounts: Account[];
  currentAccount: Account | null;
  loading: boolean;
  error: string | null;

  // Actions
  fetchAccounts: () => Promise<void>;
  setCurrentAccount: (id: number) => Promise<void>;
  toggleAccount: (id: number) => Promise<void>;
  deleteAccount: (id: number) => Promise<void>;
  refreshAccounts: () => Promise<void>;
  refreshQuota: (id: number) => Promise<void>;
}

export const useAccountStore = create<AccountStore>((set, get) => ({
  accounts: [],
  currentAccount: null,
  loading: false,
  error: null,

  fetchAccounts: async () => {
    set({ loading: true, error: null });
    try {
      const accounts = await accountsApi.getAll();
      // Find current account (first non-disabled, non-forbidden)
      const current = accounts.find(
        (a) => !a.disabled_for_proxy && !a.is_forbidden
      ) || null;
      set({ accounts, currentAccount: current, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch accounts',
        loading: false,
      });
    }
  },

  setCurrentAccount: async (id: number) => {
    try {
      await accountsApi.setCurrent(id);
      await get().fetchAccounts();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to set current account',
      });
      throw error;
    }
  },

  toggleAccount: async (id: number) => {
    try {
      await accountsApi.toggle(id);
      await get().fetchAccounts();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to toggle account',
      });
      throw error;
    }
  },

  deleteAccount: async (id: number) => {
    try {
      await accountsApi.delete(id);
      await get().fetchAccounts();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete account',
      });
      throw error;
    }
  },

  refreshAccounts: async () => {
    await get().fetchAccounts();
  },

  refreshQuota: async (id: number) => {
    try {
      await accountsApi.refreshQuota(id);
      await get().fetchAccounts();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to refresh quota',
      });
      throw error;
    }
  },
}));
