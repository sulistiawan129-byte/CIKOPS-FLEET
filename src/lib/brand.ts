/* ════════════════════════════════════════════════════════════
 * BRAND CONFIG — single source of truth for product identity.
 *
 * This is the ONLY file you need to edit to white-label this
 * product for a new customer/deployment. Every screen (Driver
 * Panel, Dashboard, PDF/Excel report headers, browser tab title,
 * PWA install prompt) reads its app name from here — nothing
 * else in the codebase should hardcode a company name.
 *
 * After changing these values, also update the two static asset
 * files that can't import TypeScript at build time:
 *   - public/manifest.json  → "name" / "short_name" / theme_color
 *   - public/logo.png, public/icon-192.png, public/icon-512.png
 * ════════════════════════════════════════════════════════════ */

export const BRAND = {
  /** Short product name — shown in the topbar, login screen, PWA icon label. */
  name: "FleetOS",

  /** Filename-safe uppercase name, used as a prefix for exported CSV/PDF/Excel files (e.g. "FLEETOS_Report_2026-08-01.pdf"). No spaces. */
  slug: "FLEETOS",

  /** Full/long name — shown in <title>, footers, formal report headers. */
  fullName: "FleetOS — Fleet Management System",

  /** One-line tagline shown under the logo on splash/login screens. */
  tagline: "Fleet Management",

  /** Used in <meta name="description"> and PDF report cover pages. */
  description: "Fleet & Driver Task Management System",

  /** Shown in footers: "© {year} {copyrightName}. All rights reserved." */
  copyrightName: "FleetOS",

  /** Version string shown in footers (e.g. driver panel splash screen). */
  version: "v1.0",
} as const;
