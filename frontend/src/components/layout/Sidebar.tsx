import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Users,
  Server,
  Zap,
  Activity,
  Settings,
} from 'lucide-react';

export default function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: t('dashboard.title') },
    { path: '/accounts', icon: Users, label: t('accounts.title') },
    { path: '/proxy', icon: Zap, label: t('proxy.title') || 'API Proxy' },
    { path: '/providers', icon: Server, label: t('providers.title') },
    { path: '/monitor', icon: Activity, label: t('monitor.title') },
    { path: '/settings', icon: Settings, label: t('settings.title') },
  ];

  return (
    <div className="w-64 bg-base-200 min-h-screen p-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Better Manager</h1>
        <p className="text-sm text-base-content/60">v0.1.0</p>
      </div>

      <ul className="menu gap-2">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive =
            path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path);

          return (
            <li key={path}>
              <Link
                to={path}
                className={isActive ? 'active' : ''}
              >
                <Icon size={20} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
