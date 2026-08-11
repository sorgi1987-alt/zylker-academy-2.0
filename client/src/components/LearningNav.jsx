import React from 'react';
import { NavLink } from 'react-router-dom';
import { useT } from '../i18n/I18nContext.jsx';

/**
 * Sub-navigation for the Learning Hub.
 *
 * The three views are one subject seen three ways — the catalogue, the learners
 * on it, and what the connector did — so they share a heading rather than
 * appearing as three unrelated entries in the main menu.
 */
export default function LearningNav() {
  const t = useT();
  const cls = ({ isActive }) => (isActive ? 'active' : undefined);
  return (
    <nav className="subnav" aria-label={t('common.learningNav.sectionsLabel')}>
      <NavLink to="/learning/courses" className={cls}>{t('common.learningNav.courses')}</NavLink>
      <NavLink to="/learning/enrolments" className={cls}>{t('common.learningNav.learners')}</NavLink>
      <NavLink to="/learning/sync-log" className={cls}>{t('common.learningNav.syncLog')}</NavLink>
    </nav>
  );
}
