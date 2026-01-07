import { useConfigStore } from '../../stores/useConfigStore';
import { useAccountStore } from '../../stores/useAccountStore';
import { Sun, Moon } from 'lucide-react';

export default function Header() {
  const { theme, setTheme, language, setLanguage } = useConfigStore();
  const { currentAccount } = useAccountStore();

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'zh' : 'en');
  };

  return (
    <div className="navbar bg-base-100 border-b border-base-300">
      <div className="flex-1">
        {currentAccount && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-base-content/60">Current:</span>
            <span className="font-medium">{currentAccount.email}</span>
            <span className="badge badge-sm badge-primary">
              {currentAccount.subscription_tier || 'FREE'}
            </span>
          </div>
        )}
      </div>

      <div className="flex-none gap-2">
        <button className="btn btn-ghost btn-sm" onClick={toggleLanguage}>
          {language.toUpperCase()}
        </button>

        <button className="btn btn-ghost btn-circle btn-sm" onClick={toggleTheme}>
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
      </div>
    </div>
  );
}
