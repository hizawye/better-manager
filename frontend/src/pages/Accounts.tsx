import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { useAccountStore } from '../stores/useAccountStore';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Loading from '../components/common/Loading';

export default function Accounts() {
  const { t } = useTranslation();
  const {
    accounts,
    fetchAccounts,
    toggleAccount,
    deleteAccount,
    setCurrentAccount,
    refreshQuota,
    loading,
  } = useAccountStore();

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleDelete = async (id: number) => {
    if (confirm(t('accounts.confirmDelete'))) {
      await deleteAccount(id);
    }
  };

  const handleToggle = async (id: number) => {
    await toggleAccount(id);
  };

  const handleSetCurrent = async (id: number) => {
    await setCurrentAccount(id);
  };

  const handleRefreshQuota = async (id: number) => {
    await refreshQuota(id);
  };

  const handleAddAccount = () => {
    window.open('/oauth/start', '_blank');
  };

  if (loading && accounts.length === 0) {
    return <Loading />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{t('accounts.title')}</h1>
        <Button onClick={handleAddAccount}>
          <Plus size={20} />
          {t('accounts.addAccount')}
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <p className="text-center text-base-content/60">
            {t('accounts.noAccounts')}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <Card key={account.id}>
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{account.email}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="primary">
                        {account.subscription_tier || 'FREE'}
                      </Badge>
                      {account.is_forbidden && (
                        <Badge variant="error">{t('accounts.forbidden')}</Badge>
                      )}
                      {!account.disabled_for_proxy && !account.is_forbidden && (
                        <Badge variant="success">{t('accounts.active')}</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {account.quota_info && (
                  <div className="space-y-2">
                    {/* Pro Quota */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Pro</span>
                        <span className="font-medium">{account.quota_info.pro_quota} remaining</span>
                      </div>
                      <div className="w-full bg-base-300 rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (account.quota_info.pro_quota / 50) * 100)}%` }}
                        />
                      </div>
                    </div>
                    {/* Flash Quota */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Flash</span>
                        <span className="font-medium">{account.quota_info.flash_quota} remaining</span>
                      </div>
                      <div className="w-full bg-base-300 rounded-full h-2">
                        <div
                          className="bg-success h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (account.quota_info.flash_quota / 1500) * 100)}%` }}
                        />
                      </div>
                    </div>
                    {/* Image Quota */}
                    {account.quota_info.image_quota > 0 && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Image</span>
                          <span className="font-medium">{account.quota_info.image_quota} remaining</span>
                        </div>
                        <div className="w-full bg-base-300 rounded-full h-2">
                          <div
                            className="bg-warning h-2 rounded-full transition-all"
                            style={{ width: `${Math.min(100, (account.quota_info.image_quota / 50) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-base-300">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleSetCurrent(account.id)}
                  >
                    {t('accounts.setCurrent')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleToggle(account.id)}
                  >
                    {t('accounts.toggleStatus')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRefreshQuota(account.id)}
                    title="Refresh Quota"
                  >
                    <RefreshCw size={16} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(account.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
