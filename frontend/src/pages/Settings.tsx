import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfigStore } from '../stores/useConfigStore';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Loading from '../components/common/Loading';

export default function Settings() {
  const { t } = useTranslation();
  const {
    proxyConfig,
    theme,
    language,
    setTheme,
    setLanguage,
    fetchProxyConfig,
    loading,
  } = useConfigStore();

  useEffect(() => {
    fetchProxyConfig();
  }, []);

  if (loading && !proxyConfig) {
    return <Loading />;
  }

  const themes = ['light', 'dark', 'cupcake'];
  const languages = [
    { code: 'en', name: 'English' },
    { code: 'zh', name: '中文' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('settings.title')}</h1>

      {/* Proxy Configuration */}
      {proxyConfig && (
        <Card title={t('settings.proxy')}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">
                  <span className="label-text">{t('settings.host')}</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={proxyConfig.host}
                  disabled
                />
              </div>
              <div>
                <label className="label">
                  <span className="label-text">{t('settings.port')}</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={proxyConfig.port}
                  disabled
                />
              </div>
            </div>

            <div>
              <label className="label">
                <span className="label-text">{t('settings.schedulingMode')}</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full"
                value={proxyConfig.schedulingMode}
                disabled
              />
              <label className="label">
                <span className="label-text-alt text-base-content/60">
                  Read-only - configure via .env file
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                className="toggle"
                checked={proxyConfig.sessionStickiness}
                disabled
              />
              <span>{t('settings.sessionStickiness')}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Appearance */}
      <Card title={t('settings.theme')}>
        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('settings.theme')}</span>
          </label>
          <select
            className="select select-bordered w-full max-w-xs"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            {themes.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Language */}
      <Card title={t('settings.language')}>
        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('settings.language')}</span>
          </label>
          <select
            className="select select-bordered w-full max-w-xs"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>
      </Card>
    </div>
  );
}
