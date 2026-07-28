import React from 'react';
import { NavLink } from 'react-router-dom';

/**
 * Sub-navigation for the Learning Hub.
 *
 * The three views are one subject seen three ways — the catalogue, the learners
 * on it, and what the connector did — so they share a heading rather than
 * appearing as three unrelated entries in the main menu.
 */
export default function LearningNav() {
  const cls = ({ isActive }) => (isActive ? 'active' : undefined);
  return (
    <nav className="subnav" aria-label="Learning Hub sections">
      <NavLink to="/learning/courses" className={cls}>Courses</NavLink>
      <NavLink to="/learning/enrolments" className={cls}>Learners</NavLink>
      <NavLink to="/learning/sync-log" className={cls}>Synchronisation log</NavLink>
    </nav>
  );
}
