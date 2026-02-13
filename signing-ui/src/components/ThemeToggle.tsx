import { useTheme } from '../contexts/ThemeContext';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="theme-toggle">
      <button
        onClick={() => setTheme('light')}
        className={`theme-option ${theme === 'light' ? 'active' : ''}`}
        title="Light mode"
        aria-label="Switch to light mode"
      >
        ☀️
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
        title="Dark mode"
        aria-label="Switch to dark mode"
      >
        🌙
      </button>
      <button
        onClick={() => setTheme('system')}
        className={`theme-option ${theme === 'system' ? 'active' : ''}`}
        title="System default"
        aria-label="Use system theme"
      >
        💻
      </button>
    </div>
  );
}
