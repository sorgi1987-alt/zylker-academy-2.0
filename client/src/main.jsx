import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './AuthContext.jsx';
import { ToastProvider } from './components/Ui.jsx';
import './styles.css';

/**
 * AuthProvider wraps the route tree rather than sitting inside it: the sign-in
 * screen is rendered INSTEAD of the routes, so no page — and therefore no data
 * fetch — is ever mounted before the server has confirmed the session.
 */
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  </React.StrictMode>
);
