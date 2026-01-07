import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, RefreshCw } from 'lucide-react';
import { useMonitorStore } from '../stores/useMonitorStore';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Loading from '../components/common/Loading';

export default function Monitor() {
  const { t } = useTranslation();
  const { logs, stats, fetchLogs, fetchStats, clearLogs, loading } =
    useMonitorStore();
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchLogs();
      fetchStats();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handleClearLogs = async () => {
    if (confirm(t('monitor.confirmClear'))) {
      await clearLogs();
    }
  };

  if (loading && !stats) {
    return <Loading />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{t('monitor.title')}</h1>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 btn btn-ghost">
            <input
              type="checkbox"
              className="toggle"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>{t('monitor.autoRefresh')}</span>
          </label>
          <Button onClick={() => { fetchLogs(); fetchStats(); }} variant="ghost">
            <RefreshCw size={20} />
          </Button>
          <Button onClick={handleClearLogs} variant="error">
            <Trash2 size={20} />
            {t('monitor.clearLogs')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <div className="stat">
              <div className="stat-title">{t('monitor.totalRequests')}</div>
              <div className="stat-value">{stats.totalRequests}</div>
            </div>
          </Card>

          <Card>
            <div className="stat">
              <div className="stat-title">{t('monitor.successRate')}</div>
              <div className="stat-value text-success">
                {stats.totalRequests > 0
                  ? ((stats.successCount / stats.totalRequests) * 100).toFixed(1)
                  : 0}
                %
              </div>
            </div>
          </Card>

          <Card>
            <div className="stat">
              <div className="stat-title">{t('monitor.avgLatency')}</div>
              <div className="stat-value text-primary">
                {stats.avgLatency.toFixed(0)}ms
              </div>
            </div>
          </Card>

          <Card>
            <div className="stat">
              <div className="stat-title">{t('monitor.totalTokens')}</div>
              <div className="stat-value text-info">
                {(stats.totalTokensIn + stats.totalTokensOut).toLocaleString()}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Logs Table */}
      <Card title={t('monitor.logs')}>
        {logs.length === 0 ? (
          <p className="text-center text-base-content/60 py-8">No logs yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>{t('monitor.timestamp')}</th>
                  <th>{t('monitor.account')}</th>
                  <th>{t('monitor.model')}</th>
                  <th>{t('monitor.statusCode')}</th>
                  <th>{t('monitor.latency')}</th>
                  <th>{t('monitor.tokens')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-xs">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="text-xs">{log.account_email}</td>
                    <td className="text-xs font-medium">{log.model}</td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          log.status_code >= 200 && log.status_code < 300
                            ? 'badge-success'
                            : 'badge-error'
                        }`}
                      >
                        {log.status_code}
                      </span>
                    </td>
                    <td>{log.latency_ms}ms</td>
                    <td>
                      {log.tokens_in} / {log.tokens_out}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
