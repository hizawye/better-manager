import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Server, RefreshCw } from 'lucide-react';
import { useAccountStore } from '../stores/useAccountStore';
import { useProviderStore } from '../stores/useProviderStore';
import { useServerStatus } from '../hooks/useServerStatus';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Loading from '../components/common/Loading';

export default function Dashboard() {
  const { t } = useTranslation();
  const { accounts, currentAccount, fetchAccounts, loading } = useAccountStore();
  const { status: providerStatus, fetchStatus } = useProviderStore();
  const { status: serverStatus, version, latency, refresh: refreshServer } = useServerStatus();

  useEffect(() => {
    fetchAccounts();
    fetchStatus();
  }, []);

  if (loading) {
    return <Loading />;
  }

  const activeAccounts = accounts.filter(
    (a) => !a.disabled_for_proxy && !a.is_forbidden
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>

      {/* Server Status */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Server size={24} className={serverStatus === 'ok' ? 'text-success' : serverStatus === 'error' ? 'text-error' : 'text-warning'} />
            <div>
              <h3 className="font-semibold">{t('proxy.serverStatus')}</h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={serverStatus === 'ok' ? 'success' : serverStatus === 'error' ? 'error' : 'warning'}>
                  {serverStatus === 'ok' ? t('proxy.running') : serverStatus === 'error' ? t('proxy.stopped') : 'Loading...'}
                </Badge>
                {version && <span className="text-sm text-base-content/60">v{version}</span>}
                {latency !== undefined && <span className="text-sm text-base-content/60">{latency}ms</span>}
              </div>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={refreshServer} title="Refresh">
            <RefreshCw size={16} />
          </Button>
        </div>
      </Card>

      {/* Current Account */}
      <Card title={t('dashboard.currentAccount')}>
        {currentAccount ? (
          <div>
            <p className="text-lg font-medium">{currentAccount.email}</p>
            <div className="flex gap-2 mt-2">
              <Badge variant="primary">
                {currentAccount.subscription_tier || 'FREE'}
              </Badge>
              {!currentAccount.is_forbidden && !currentAccount.disabled_for_proxy && (
                <Badge variant="success">{t('accounts.active')}</Badge>
              )}
            </div>
            {currentAccount.quota_info && (
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-base-content/60">Gemini Pro</p>
                  <p className="text-2xl font-bold">
                    {currentAccount.quota_info.pro_quota}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-base-content/60">Gemini Flash</p>
                  <p className="text-2xl font-bold">
                    {currentAccount.quota_info.flash_quota}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-base-content/60">Imagen 3</p>
                  <p className="text-2xl font-bold">
                    {currentAccount.quota_info.image_quota}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-base-content/60">{t('dashboard.noAccount')}</p>
        )}
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="stat">
            <div className="stat-title">{t('dashboard.totalAccounts')}</div>
            <div className="stat-value">{accounts.length}</div>
          </div>
        </Card>

        <Card>
          <div className="stat">
            <div className="stat-title">{t('dashboard.activeAccounts')}</div>
            <div className="stat-value text-success">{activeAccounts.length}</div>
          </div>
        </Card>

        <Card>
          <div className="stat">
            <div className="stat-title">{t('dashboard.providerHealth')}</div>
            <div className="stat-value text-primary">
              {providerStatus
                ? Object.values(providerStatus.providers).filter((p) => p.enabled)
                    .length
                : 0}
            </div>
            <div className="stat-desc">providers enabled</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
