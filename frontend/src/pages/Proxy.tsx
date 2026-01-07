import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, RefreshCw, Server, Shield, Zap, Plus, Trash2, ArrowRight } from 'lucide-react';
import { useConfigStore } from '../stores/useConfigStore';
import { useAccountStore } from '../stores/useAccountStore';
import { mappingsApi, MappingsResponse } from '../api/mappings';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import Loading from '../components/common/Loading';

export default function Proxy() {
  const { t } = useTranslation();
  const {
    proxyConfig,
    fetchProxyConfig,
    updateProxyConfig,
    loading,
  } = useConfigStore();
  const { accounts, fetchAccounts } = useAccountStore();

  const [copied, setCopied] = useState<string | null>(null);
  const [localConfig, setLocalConfig] = useState({
    apiKey: '',
    sessionStickiness: true,
    schedulingMode: 'cache-first',
  });

  // Model mappings state
  const [mappings, setMappings] = useState<MappingsResponse | null>(null);
  const [newMapping, setNewMapping] = useState({ from: '', to: '' });
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchMappings = async () => {
    try {
      const data = await mappingsApi.getAll();
      setMappings(data);
    } catch (err) {
      console.error('Failed to fetch mappings:', err);
    }
  };

  useEffect(() => {
    fetchProxyConfig();
    fetchAccounts();
    fetchMappings();
  }, []);

  useEffect(() => {
    if (proxyConfig) {
      setLocalConfig({
        apiKey: proxyConfig.apiKey || '',
        sessionStickiness: proxyConfig.sessionStickiness,
        schedulingMode: proxyConfig.schedulingMode,
      });
    }
  }, [proxyConfig]);

  const handleCopy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSaveConfig = async () => {
    if (!proxyConfig) return;
    await updateProxyConfig({
      ...proxyConfig,
      apiKey: localConfig.apiKey || null,
      sessionStickiness: localConfig.sessionStickiness,
      schedulingMode: localConfig.schedulingMode,
    });
  };

  const handleAddMapping = async () => {
    if (!newMapping.from || !newMapping.to) return;
    try {
      await mappingsApi.add(newMapping.from, newMapping.to);
      setNewMapping({ from: '', to: '' });
      setShowAddForm(false);
      fetchMappings();
    } catch (err) {
      console.error('Failed to add mapping:', err);
    }
  };

  const handleDeleteMapping = async (from: string) => {
    try {
      await mappingsApi.remove(from);
      fetchMappings();
    } catch (err) {
      console.error('Failed to delete mapping:', err);
    }
  };

  if (loading && !proxyConfig) {
    return <Loading />;
  }

  const baseUrl = `http://${proxyConfig?.host || '127.0.0.1'}:${proxyConfig?.port || 8094}`;
  const activeAccounts = accounts.filter(a => !a.disabled_for_proxy && !a.is_forbidden);

  const endpoints = [
    {
      name: 'OpenAI Chat Completions',
      url: `${baseUrl}/v1/chat/completions`,
      method: 'POST',
      protocol: 'OpenAI',
    },
    {
      name: 'OpenAI Models',
      url: `${baseUrl}/v1/models`,
      method: 'GET',
      protocol: 'OpenAI',
    },
    {
      name: 'Claude Messages',
      url: `${baseUrl}/v1/messages`,
      method: 'POST',
      protocol: 'Claude',
    },
    {
      name: 'Claude Token Count',
      url: `${baseUrl}/v1/messages/count_tokens`,
      method: 'POST',
      protocol: 'Claude',
    },
  ];

  const schedulingModes = [
    { value: 'cache-first', label: 'Cache First', description: 'Prefer previously used accounts' },
    { value: 'round-robin', label: 'Round Robin', description: 'Rotate through accounts evenly' },
    { value: 'random', label: 'Random', description: 'Random account selection' },
    { value: 'quota-aware', label: 'Quota Aware', description: 'Prefer accounts with higher quota' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{t('proxy.title') || 'API Proxy'}</h1>
        <div className="flex items-center gap-2">
          <Badge variant="success" className="gap-2">
            <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
            Running
          </Badge>
        </div>
      </div>

      {/* Server Status */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Server size={24} className="text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Proxy Server</h3>
              <p className="text-base-content/60 text-sm">
                Listening on {baseUrl}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-base-content/60">Active Accounts</p>
              <p className="text-2xl font-bold text-success">{activeAccounts.length}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Endpoints */}
      <Card title="API Endpoints">
        <div className="space-y-3">
          {endpoints.map((endpoint, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 bg-base-200 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <Badge variant={endpoint.protocol === 'OpenAI' ? 'primary' : 'secondary'}>
                  {endpoint.protocol}
                </Badge>
                <div>
                  <p className="font-medium">{endpoint.name}</p>
                  <code className="text-xs text-base-content/60">{endpoint.url}</code>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="ghost">{endpoint.method}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCopy(endpoint.url, endpoint.name)}
                >
                  {copied === endpoint.name ? (
                    <Check size={16} className="text-success" />
                  ) : (
                    <Copy size={16} />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Quick Copy */}
      <Card title="Quick Configuration">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-base-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Base URL</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleCopy(baseUrl, 'baseUrl')}
              >
                {copied === 'baseUrl' ? <Check size={16} className="text-success" /> : <Copy size={16} />}
              </Button>
            </div>
            <code className="text-sm">{baseUrl}</code>
          </div>

          <div className="p-4 bg-base-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">cURL Example</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleCopy(
                  `curl -X POST ${baseUrl}/v1/chat/completions -H "Content-Type: application/json" -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'`,
                  'curl'
                )}
              >
                {copied === 'curl' ? <Check size={16} className="text-success" /> : <Copy size={16} />}
              </Button>
            </div>
            <code className="text-xs break-all">curl -X POST {baseUrl}/v1/chat/completions ...</code>
          </div>
        </div>
      </Card>

      {/* Routing Configuration */}
      <Card title="Routing Configuration">
        <div className="space-y-4">
          {/* Scheduling Mode */}
          <div>
            <label className="label">
              <span className="label-text font-medium">Scheduling Mode</span>
            </label>
            <select
              className="select select-bordered w-full"
              value={localConfig.schedulingMode}
              onChange={(e) => setLocalConfig({ ...localConfig, schedulingMode: e.target.value })}
            >
              {schedulingModes.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label} - {mode.description}
                </option>
              ))}
            </select>
          </div>

          {/* Session Stickiness */}
          <div className="flex items-center justify-between p-4 bg-base-200 rounded-lg">
            <div className="flex items-center gap-3">
              <Zap size={20} className="text-warning" />
              <div>
                <p className="font-medium">Session Stickiness</p>
                <p className="text-sm text-base-content/60">
                  Keep same account within conversation
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={localConfig.sessionStickiness}
              onChange={(e) => setLocalConfig({ ...localConfig, sessionStickiness: e.target.checked })}
            />
          </div>
        </div>
      </Card>

      {/* Security */}
      <Card title="Security">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-base-200 rounded-lg">
            <Shield size={20} className="text-primary" />
            <div className="flex-1">
              <p className="font-medium">API Key Authentication</p>
              <p className="text-sm text-base-content/60">
                Require API key for proxy requests (optional)
              </p>
            </div>
          </div>

          <div>
            <label className="label">
              <span className="label-text">API Key (leave empty to disable)</span>
            </label>
            <input
              type="password"
              className="input input-bordered w-full"
              placeholder="Enter API key..."
              value={localConfig.apiKey}
              onChange={(e) => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
            />
          </div>
        </div>
      </Card>

      {/* Model Mappings */}
      <Card title="Model Mappings">
        <div className="space-y-4">
          {/* Available Targets */}
          {mappings && (
            <div className="p-3 bg-base-200 rounded-lg">
              <p className="text-sm font-medium mb-2">Available Target Models:</p>
              <div className="flex flex-wrap gap-2">
                {mappings.availableTargets.map((target) => (
                  <span key={target} className="badge badge-outline text-xs">
                    {target}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Add Mapping Form */}
          {showAddForm ? (
            <div className="p-4 bg-base-200 rounded-lg space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">
                    <span className="label-text text-sm">Source Model</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered input-sm w-full"
                    placeholder="e.g., my-custom-model"
                    value={newMapping.from}
                    onChange={(e) => setNewMapping({ ...newMapping, from: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">
                    <span className="label-text text-sm">Target Model</span>
                  </label>
                  <select
                    className="select select-bordered select-sm w-full"
                    value={newMapping.to}
                    onChange={(e) => setNewMapping({ ...newMapping, to: e.target.value })}
                  >
                    <option value="">Select target...</option>
                    {mappings?.availableTargets.map((target) => (
                      <option key={target} value={target}>{target}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleAddMapping} disabled={!newMapping.from || !newMapping.to}>
                  Add Mapping
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setShowAddForm(true)}>
              <Plus size={16} />
              Add Custom Mapping
            </Button>
          )}

          {/* Mappings Table */}
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Source Model</th>
                  <th></th>
                  <th>Target Model</th>
                  <th>Type</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {/* Custom mappings (editable) */}
                {mappings && Object.entries(mappings.custom).map(([from, to]) => (
                  <tr key={`custom-${from}`} className="hover">
                    <td><code className="text-xs">{from}</code></td>
                    <td><ArrowRight size={14} className="text-base-content/40" /></td>
                    <td><code className="text-xs">{to}</code></td>
                    <td><Badge variant="success" className="text-xs">Custom</Badge></td>
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-error"
                        onClick={() => handleDeleteMapping(from)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
                {/* Built-in Claude mappings */}
                {mappings && Object.entries(mappings.builtIn.anthropic).map(([from, to]) => (
                  <tr key={`anthropic-${from}`} className="opacity-60">
                    <td><code className="text-xs">{from}</code></td>
                    <td><ArrowRight size={14} className="text-base-content/40" /></td>
                    <td><code className="text-xs">{to}</code></td>
                    <td><Badge variant="secondary" className="text-xs">Claude</Badge></td>
                    <td></td>
                  </tr>
                ))}
                {/* Built-in OpenAI mappings */}
                {mappings && Object.entries(mappings.builtIn.openai).map(([from, to]) => (
                  <tr key={`openai-${from}`} className="opacity-60">
                    <td><code className="text-xs">{from}</code></td>
                    <td><ArrowRight size={14} className="text-base-content/40" /></td>
                    <td><code className="text-xs">{to}</code></td>
                    <td><Badge variant="primary" className="text-xs">OpenAI</Badge></td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={fetchProxyConfig}>
          <RefreshCw size={16} />
          Reset
        </Button>
        <Button onClick={handleSaveConfig}>
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
