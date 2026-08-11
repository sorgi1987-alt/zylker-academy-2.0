import React from 'react';

/**
 * The Zylker Academy mark: a bold "Z" stroke on a rounded gradient tile.
 * One inline SVG, no image request, so it renders instantly everywhere it's
 * used — the sidebar (expanded and collapsed), the sign-in screen, the
 * favicon (see index.html, same shape hand-encoded as a data URI).
 */
export default function Logo({ size = 30 }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="10" fill="url(#zylkerLogoGrad)" />
      <path d="M12 13.5h16L12 26.5h16" stroke="#fff" strokeWidth="3.4"
        strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="zylkerLogoGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6C8BC2" />
          <stop offset="1" stopColor="#3D5A82" />
        </linearGradient>
      </defs>
    </svg>
  );
}
