import React from 'react';
import { useLanguage } from './I18nContext.jsx';

/**
 * A two-way switch rather than a dropdown menu: with exactly two languages, a
 * `pop-wrap` menu (the pattern Shell.jsx's account/create menus use) is more
 * machinery than the choice needs. Used both inside the authenticated shell
 * and on the sign-in screen, which renders standalone outside that shell.
 */
export default function LanguageToggle({ className = '' }) {
  const [language, setLanguage] = useLanguage();

  return (
    <div className={`lang-toggle ${className}`} role="group" aria-label="Language / Idioma">
      <button
        type="button"
        className={`lang-toggle-opt ${language === 'en' ? 'active' : ''}`}
        aria-pressed={language === 'en'}
        onClick={() => setLanguage('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={`lang-toggle-opt ${language === 'es' ? 'active' : ''}`}
        aria-pressed={language === 'es'}
        onClick={() => setLanguage('es')}
      >
        ES
      </button>
    </div>
  );
}
