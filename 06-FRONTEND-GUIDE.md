# Frontend Guide - React Application

## Overview

The frontend is a **React 19** application built with **TypeScript**, **TailwindCSS**, and **Vite**. It provides a desktop UI for managing accounts, configuring the proxy, and monitoring requests.

## Technology Stack

- **Framework**: React 19.1.0 + TypeScript
- **Build Tool**: Vite 7.0.4
- **Styling**: TailwindCSS 3.4 + DaisyUI 5.5
- **Routing**: React Router DOM v7
- **State Management**: Zustand 5.0
- **Internationalization**: i18next + react-i18next
- **Icons**: Lucide React
- **Animations**: Framer Motion
- **Charts**: Recharts

## Project Structure

```
src/
├── components/
│   ├── common/          # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx
│   │   └── ThemeManager.tsx
│   ├── layout/          # Layout components
│   │   ├── Layout.tsx   # Main app shell
│   │   ├── Sidebar.tsx  # Navigation sidebar
│   │   └── Header.tsx
│   └── account/         # Account-specific components
│       ├── AccountCard.tsx
│       ├── AccountList.tsx
│       └── OAuthDialog.tsx
├── pages/
│   ├── Dashboard.tsx    # Overview & metrics
│   ├── Accounts.tsx     # Account management
│   ├── ApiProxy.tsx     # Proxy server control
│   ├── Monitor.tsx      # Request monitoring
│   └── Settings.tsx     # App configuration
├── stores/              # Zustand stores
│   ├── useAccountStore.ts
│   ├── useConfigStore.ts
│   └── useProxyStore.ts
├── services/            # API layer
│   ├── api.ts           # Tauri invoke wrappers
│   └── types.ts         # TypeScript types
├── utils/
│   ├── formatters.ts    # Number, date formatting
│   └── validators.ts    # Input validation
├── locales/
│   ├── en/
│   │   └── translation.json
│   └── zh/
│       └── translation.json
├── App.tsx              # Root component
├── main.tsx             # React entry point
└── i18n.ts              # i18next configuration
```

## Routing Configuration

### App Routes (`App.tsx`)

```typescript
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: 'accounts',
        element: <Accounts />,
      },
      {
        path: 'api-proxy',
        element: <ApiProxy />,
      },
      {
        path: 'monitor',
        element: <Monitor />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}
```

### Layout Component (`components/layout/Layout.tsx`)

```typescript
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

## State Management (Zustand)

### Account Store (`stores/useAccountStore.ts`)

```typescript
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface Account {
  id: number;
  email: string;
  subscription_tier: string;
  quota_info?: {
    pro_quota: number;
    flash_quota: number;
    image_quota: number;
  };
  is_forbidden: boolean;
  disabled_for_proxy: boolean;
}

interface AccountStore {
  accounts: Account[];
  currentAccount: Account | null;
  loading: boolean;
  
  fetchAccounts: () => Promise<void>;
  fetchCurrentAccount: () => Promise<void>;
  switchAccount: (email: string) => Promise<void>;
  deleteAccount: (id: number) => Promise<void>;
  refreshQuota: (id: number) => Promise<void>;
}

export const useAccountStore = create<AccountStore>((set, get) => ({
  accounts: [],
  currentAccount: null,
  loading: false,
  
  fetchAccounts: async () => {
    set({ loading: true });
    try {
      const accounts = await invoke<Account[]>('get_accounts');
      set({ accounts, loading: false });
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
      set({ loading: false });
    }
  },
  
  fetchCurrentAccount: async () => {
    try {
      const current = await invoke<Account | null>('get_current_account');
      set({ currentAccount: current });
    } catch (error) {
      console.error('Failed to fetch current account:', error);
    }
  },
  
  switchAccount: async (email: string) => {
    try {
      await invoke('switch_account', { email });
      await get().fetchCurrentAccount();
      await get().fetchAccounts();
    } catch (error) {
      console.error('Failed to switch account:', error);
      throw error;
    }
  },
  
  deleteAccount: async (id: number) => {
    try {
      await invoke('delete_account', { id });
      await get().fetchAccounts();
    } catch (error) {
      console.error('Failed to delete account:', error);
      throw error;
    }
  },
  
  refreshQuota: async (id: number) => {
    try {
      await invoke('refresh_quota_by_id', { id });
      await get().fetchAccounts();
    } catch (error) {
      console.error('Failed to refresh quota:', error);
      throw error;
    }
  },
}));
```

### Config Store (`stores/useConfigStore.ts`)

```typescript
interface AppConfig {
  language: string;
  theme: string;
  auto_start: bool;
  page_size: number;
  // ... more config
}

interface ConfigStore {
  config: AppConfig | null;
  loadConfig: () => Promise<void>;
  updateConfig: (partial: Partial<AppConfig>) => Promise<void>;
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: null,
  
  loadConfig: async () => {
    const config = await invoke<AppConfig>('get_config');
    set({ config });
  },
  
  updateConfig: async (partial) => {
    const current = get().config;
    const updated = { ...current, ...partial };
    await invoke('save_config', { config: updated });
    set({ config: updated });
  },
}));
```

## Key Pages

### Dashboard (`pages/Dashboard.tsx`)

```typescript
export default function Dashboard() {
  const { accounts, currentAccount } = useAccountStore();
  const { t } = useTranslation();
  
  // Calculate average quotas
  const avgQuotas = useMemo(() => {
    const active = accounts.filter(a => !a.is_forbidden);
    return {
      pro: average(active.map(a => a.quota_info?.pro_quota ?? 0)),
      flash: average(active.map(a => a.quota_info?.flash_quota ?? 0)),
      image: average(active.map(a => a.quota_info?.image_quota ?? 0)),
    };
  }, [accounts]);
  
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
      
      {/* Current Account Card */}
      <Card>
        <h2>{t('dashboard.currentAccount')}</h2>
        {currentAccount ? (
          <AccountSummary account={currentAccount} />
        ) : (
          <p>{t('dashboard.noAccount')}</p>
        )}
      </Card>
      
      {/* Average Quotas */}
      <div className="grid grid-cols-3 gap-4">
        <QuotaCard
          title="Gemini Pro"
          value={avgQuotas.pro}
          max={100}
        />
        <QuotaCard
          title="Gemini Flash"
          value={avgQuotas.flash}
          max={100}
        />
        <QuotaCard
          title="Imagen 3"
          value={avgQuotas.image}
          max={100}
        />
      </div>
      
      {/* Recommended Account */}
      <BestAccountCard accounts={accounts} />
    </div>
  );
}
```

### Accounts Page (`pages/Accounts.tsx`)

```typescript
export default function Accounts() {
  const { accounts, deleteAccount, refreshQuota } = useAccountStore();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const handleDelete = async (id: number) => {
    if (confirm(t('accounts.confirmDelete'))) {
      await deleteAccount(id);
    }
  };
  
  const handleBatchRefresh = async () => {
    await Promise.all(selectedIds.map(id => refreshQuota(id)));
    setSelectedIds([]);
  };
  
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t('accounts.title')}</h1>
        
        <div className="flex gap-2">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus /> {t('accounts.add')}
          </Button>
        </div>
      </div>
      
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-3 gap-4">
          {accounts.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              selected={selectedIds.includes(account.id)}
              onSelect={(id) => toggleSelection(id)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <AccountTable
          accounts={accounts}
          selectedIds={selectedIds}
          onSelect={setSelectedIds}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
```

### API Proxy Page (`pages/ApiProxy.tsx`)

```typescript
export default function ApiProxy() {
  const [running, setRunning] = useState(false);
  const [config, setConfig] = useState<ProxyConfig | null>(null);
  
  useEffect(() => {
    loadProxyConfig();
    checkStatus();
  }, []);
  
  const loadProxyConfig = async () => {
    const cfg = await invoke<ProxyConfig>('get_proxy_config');
    setConfig(cfg);
  };
  
  const checkStatus = async () => {
    const status = await invoke<{running: boolean}>('get_proxy_status');
    setRunning(status.running);
  };
  
  const toggleServer = async () => {
    if (running) {
      await invoke('stop_proxy_server');
    } else {
      await invoke('start_proxy_server');
    }
    await checkStatus();
  };
  
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1>{t('proxy.title')}</h1>
        <StatusBadge running={running} />
      </div>
      
      {/* Server Control */}
      <Card>
        <h2>{t('proxy.serverControl')}</h2>
        <Button onClick={toggleServer}>
          {running ? t('proxy.stop') : t('proxy.start')}
        </Button>
      </Card>
      
      {/* Configuration */}
      <Card>
        <h2>{t('proxy.configuration')}</h2>
        <ConfigForm config={config} onSave={saveConfig} />
      </Card>
      
      {/* Model Mappings */}
      <Card>
        <h2>{t('proxy.modelMapping')}</h2>
        <ModelMappingEditor
          mappings={config?.custom_mapping ?? {}}
          onChange={(updated) => updateMapping(updated)}
        />
      </Card>
    </div>
  );
}
```

## Component Examples

### Account Card (`components/account/AccountCard.tsx`)

```typescript
interface AccountCardProps {
  account: Account;
  selected?: boolean;
  onSelect?: (id: number) => void;
  onDelete?: (id: number) => void;
}

export default function AccountCard({ 
  account, 
  selected, 
  onSelect, 
  onDelete 
}: AccountCardProps) {
  const { t } = useTranslation();
  
  return (
    <div className={cn(
      "card bg-base-100 shadow-xl",
      selected && "ring-2 ring-primary"
    )}>
      <div className="card-body">
        {/* Header */}
        <div className="flex justify-between items-start">
          <h3 className="card-title text-sm">{account.email}</h3>
          
          {onSelect && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelect(account.id)}
            />
          )}
        </div>
        
        {/* Tier Badge */}
        <div className="badge badge-primary">
          {account.subscription_tier || 'FREE'}
        </div>
        
        {/* Quotas */}
        <div className="space-y-2">
          <QuotaBar
            label="Pro"
            value={account.quota_info?.pro_quota ?? 0}
          />
          <QuotaBar
            label="Flash"
            value={account.quota_info?.flash_quota ?? 0}
          />
        </div>
        
        {/* Status */}
        {account.is_forbidden && (
          <div className="badge badge-error">
            {t('accounts.forbidden')}
          </div>
        )}
        
        {/* Actions */}
        <div className="card-actions justify-end">
          <Button size="sm" onClick={() => onDelete?.(account.id)}>
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

## Internationalization

### i18n Setup (`i18n.ts`)

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from './locales/en/translation.json';
import zhTranslation from './locales/zh/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
      zh: { translation: zhTranslation },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
```

### Translation Files

**locales/en/translation.json**:
```json
{
  "dashboard": {
    "title": "Dashboard",
    "currentAccount": "Current Account",
    "averageQuota": "Average Quota"
  },
  "accounts": {
    "title": "Accounts",
    "add": "Add Account",
    "delete": "Delete",
    "confirmDelete": "Are you sure?"
  }
}
```

## Styling

### TailwindCSS Configuration (`tailwind.config.js`)

```javascript
export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        secondary: '#8b5cf6',
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: ['light', 'dark', 'cupcake'],
  },
};
```

### Theme Management (`components/common/ThemeManager.tsx`)

```typescript
export default function ThemeManager() {
  const { config } = useConfigStore();
  
  useEffect(() => {
    if (config?.theme) {
      document.documentElement.setAttribute('data-theme', config.theme);
    }
  }, [config?.theme]);
  
  return null;
}
```

## Performance Optimizations

1. **Code Splitting**: React Router lazy loading
2. **Memoization**: useMemo for expensive calculations
3. **Virtual Scrolling**: For long account lists
4. **Debouncing**: Search inputs, config updates
5. **Optimistic Updates**: Immediate UI feedback

## Best Practices

1. **Type Safety**: Use TypeScript for all components
2. **Component Composition**: Build small, reusable components
3. **Custom Hooks**: Extract reusable logic
4. **Error Handling**: Try-catch in async operations
5. **Accessibility**: Use semantic HTML, ARIA labels
