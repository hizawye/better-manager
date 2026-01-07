import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Settings, Play, Check, X, Eye, EyeOff } from 'lucide-react';
import { useProviderStore } from '../stores/useProviderStore';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Loading from '../components/common/Loading';

type DispatchMode = 'off' | 'always' | 'fallback';

export default function Providers() {
  const { t } = useTranslation();
  const {
    status,
    metrics,
    testResult,
    fetchStatus,
    fetchMetrics,
    resetMetrics,
    updateAnthropicConfig,
    testAnthropicConnection,
    toggleAnthropic,
    loading,
  } = useProviderStore();

  const [showConfig, setShowConfig] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [formData, setFormData] = useState({
    baseUrl: '',
    apiKey: '',
    dispatchMode: 'off' as DispatchMode,
  });

  useEffect(() => {
    fetchStatus();
    fetchMetrics();
  }, []);

  useEffect(() => {
    if (status?.providers?.anthropic) {
      const config = status.providers.anthropic;
      setFormData({
        baseUrl: config.baseUrl || 'https://api.anthropic.com',
        apiKey: '',
        dispatchMode: config.dispatchMode,
      });
    }
  }, [status]);

  const handleResetMetrics = async () => {
    if (confirm(t('providers.confirmReset'))) {
      await resetMetrics();
    }
  };

  const handleSaveConfig = async () => {
    const updates: Record<string, unknown> = {
      dispatchMode: formData.dispatchMode,
    };
    if (formData.baseUrl) {
      updates.baseUrl = formData.baseUrl;
    }
    if (formData.apiKey) {
      updates.apiKey = formData.apiKey;
    }
    await updateAnthropicConfig(updates);
    setFormData(prev => ({ ...prev, apiKey: '' }));
  };

  const handleTestConnection = async () => {
    await testAnthropicConnection();
  };

  const handleToggle = async (enabled: boolean) => {
    await toggleAnthropic(enabled);
  };

  if (loading && !status) {
    return <Loading />;
  }

  const anthropicConfig = status?.providers?.anthropic;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{t('providers.title')}</h1>
        <Button onClick={handleResetMetrics} variant="ghost">
          <RefreshCw size={20} />
          {t('providers.resetMetrics')}
        </Button>
      </div>

      {/* Anthropic Provider Configuration */}
      <Card title="Anthropic Provider">
        <div className="space-y-4">
          {/* Status Row */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Status:</span>
              <Badge variant={anthropicConfig?.enabled ? 'success' : 'error'}>
                {anthropicConfig?.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
              {anthropicConfig?.hasApiKey && (
                <Badge variant="primary">API Key Set</Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => handleToggle(!anthropicConfig?.enabled)}
                variant={anthropicConfig?.enabled ? 'ghost' : 'primary'}
                disabled={loading}
              >
                {anthropicConfig?.enabled ? 'Disable' : 'Enable'}
              </Button>
              <Button
                onClick={() => setShowConfig(!showConfig)}
                variant="ghost"
              >
                <Settings size={16} />
                Configure
              </Button>
            </div>
          </div>

          {/* Dispatch Mode Display */}
          <div className="flex justify-between items-center">
            <span className="text-sm">Dispatch Mode:</span>
            <Badge variant={anthropicConfig?.dispatchMode === 'always' ? 'success' : anthropicConfig?.dispatchMode === 'fallback' ? 'warning' : 'error'}>
              {anthropicConfig?.dispatchMode || 'off'}
            </Badge>
          </div>

          {/* Base URL Display */}
          {anthropicConfig?.baseUrl && (
            <div className="flex justify-between items-center">
              <span className="text-sm">Base URL:</span>
              <span className="text-sm font-mono text-base-content/70">
                {anthropicConfig.baseUrl}
              </span>
            </div>
          )}

          {/* Configuration Panel */}
          {showConfig && (
            <div className="mt-4 p-4 bg-base-200 rounded-lg space-y-4">
              <h3 className="font-semibold">Configuration</h3>

              {/* Base URL */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Base URL</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  placeholder="https://api.anthropic.com"
                  value={formData.baseUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, baseUrl: e.target.value }))}
                />
                <label className="label">
                  <span className="label-text-alt">Use https://api.anthropic.com for direct Anthropic, or a compatible endpoint like z.ai</span>
                </label>
              </div>

              {/* API Key */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">API Key</span>
                  {anthropicConfig?.hasApiKey && (
                    <span className="label-text-alt text-success">Currently set</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    className="input input-bordered w-full pr-10"
                    placeholder={anthropicConfig?.hasApiKey ? '(unchanged)' : 'sk-ant-...'}
                    value={formData.apiKey}
                    onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Dispatch Mode */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Dispatch Mode</span>
                </label>
                <select
                  className="select select-bordered w-full"
                  value={formData.dispatchMode}
                  onChange={(e) => setFormData(prev => ({ ...prev, dispatchMode: e.target.value as DispatchMode }))}
                >
                  <option value="off">Off - Never use Anthropic provider</option>
                  <option value="always">Always - Route all claude-* models to Anthropic</option>
                  <option value="fallback">Fallback - Use when Gemini fails</option>
                </select>
                <label className="label">
                  <span className="label-text-alt">
                    {formData.dispatchMode === 'off' && 'All requests will go through Gemini backend'}
                    {formData.dispatchMode === 'always' && 'All Claude model requests will use native Anthropic API'}
                    {formData.dispatchMode === 'fallback' && 'Uses Anthropic API only when Gemini backend fails'}
                  </span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between pt-2">
                <Button
                  onClick={handleTestConnection}
                  variant="ghost"
                  disabled={loading || !anthropicConfig?.hasApiKey}
                >
                  <Play size={16} />
                  Test Connection
                </Button>
                <div className="flex gap-2">
                  <Button onClick={() => setShowConfig(false)} variant="ghost">
                    Cancel
                  </Button>
                  <Button onClick={handleSaveConfig} disabled={loading}>
                    Save Configuration
                  </Button>
                </div>
              </div>

              {/* Test Result */}
              {testResult && (
                <div className={`alert ${testResult.success ? 'alert-success' : 'alert-error'} mt-4`}>
                  <span className="flex items-center gap-2">
                    {testResult.success ? <Check size={16} /> : <X size={16} />}
                    {testResult.message}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Metrics for Anthropic */}
          {(() => {
            const providerMetrics = metrics.find((m) => m.provider === 'anthropic');
            if (!providerMetrics) return null;
            return (
              <>
                <div className="divider my-2"></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="stat bg-base-200 rounded-lg p-3">
                    <div className="stat-title text-xs">Requests</div>
                    <div className="stat-value text-lg">{providerMetrics.requestCount}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg p-3">
                    <div className="stat-title text-xs">Success Rate</div>
                    <div className="stat-value text-lg">
                      {providerMetrics.requestCount > 0
                        ? ((providerMetrics.successCount / providerMetrics.requestCount) * 100).toFixed(1)
                        : 0}%
                    </div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg p-3">
                    <div className="stat-title text-xs">Avg Latency</div>
                    <div className="stat-value text-lg">{providerMetrics.avgLatencyMs.toFixed(0)}ms</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg p-3">
                    <div className="stat-title text-xs">Cost</div>
                    <div className="stat-value text-lg">${providerMetrics.totalCost.toFixed(4)}</div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </Card>

      {/* Gemini Backend (Default) */}
      <Card title="Gemini Backend (Default)">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm">Status:</span>
            <Badge variant="success">Active</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">Description:</span>
            <span className="text-sm text-base-content/70">Routes Claude requests to Gemini models via Cloud Code tokens</span>
          </div>

          {/* Metrics for Gemini */}
          {(() => {
            const providerMetrics = metrics.find((m) => m.provider === 'gemini');
            if (!providerMetrics) return null;
            return (
              <>
                <div className="divider my-2"></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="stat bg-base-200 rounded-lg p-3">
                    <div className="stat-title text-xs">Requests</div>
                    <div className="stat-value text-lg">{providerMetrics.requestCount}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg p-3">
                    <div className="stat-title text-xs">Success Rate</div>
                    <div className="stat-value text-lg">
                      {providerMetrics.requestCount > 0
                        ? ((providerMetrics.successCount / providerMetrics.requestCount) * 100).toFixed(1)
                        : 0}%
                    </div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg p-3">
                    <div className="stat-title text-xs">Avg Latency</div>
                    <div className="stat-value text-lg">{providerMetrics.avgLatencyMs.toFixed(0)}ms</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg p-3">
                    <div className="stat-title text-xs">Tokens In/Out</div>
                    <div className="stat-value text-sm">
                      {providerMetrics.totalTokensIn.toLocaleString()} / {providerMetrics.totalTokensOut.toLocaleString()}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </Card>

      {/* All Metrics Summary */}
      {metrics.length > 0 && (
        <Card title={t('providers.metrics')}>
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Requests</th>
                  <th>Success Rate</th>
                  <th>Avg Latency</th>
                  <th>Total Cost</th>
                  <th>Tokens In/Out</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.provider}>
                    <td className="font-medium capitalize">{m.provider}</td>
                    <td>{m.requestCount}</td>
                    <td>
                      {m.requestCount > 0
                        ? ((m.successCount / m.requestCount) * 100).toFixed(1)
                        : 0}
                      %
                    </td>
                    <td>{m.avgLatencyMs.toFixed(0)}ms</td>
                    <td>${m.totalCost.toFixed(4)}</td>
                    <td>
                      {m.totalTokensIn.toLocaleString()} /{' '}
                      {m.totalTokensOut.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
