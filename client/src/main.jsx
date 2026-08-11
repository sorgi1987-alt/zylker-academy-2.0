import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './AuthContext.jsx';
import { ToastProvider } from './components/Ui.jsx';
import { I18nProvider } from './i18n/I18nContext.jsx';
import './styles.css';

/**
 * AuthProvider wraps the route tree rather than sitting inside it: the sign-in
 * screen is rendered INSTEAD of the routes, so no page — and therefore no data
 * fetch — is ever mounted before the server has confirmed the session.
 *
 * I18nProvider wraps everything, including ToastProvider, so a toast raised
 * before sign-in (or by the toast/error chrome itself) is translated too.
 */
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </HashRouter>
  </React.StrictMode>
);
