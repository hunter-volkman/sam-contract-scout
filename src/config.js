/**
 * config.js
 * ---------
 * Central place for all credentials and configuration.
 * Values are read from environment variables (or a .env file).
 *
 * Required to run with real data:
 *   SAM_API_KEY       — from sam.gov/profile/details  (free)
 *   ANTHROPIC_API_KEY — from console.anthropic.com
 *
 * Optional:
 *   MODEL — Claude model id (default: claude-sonnet-4-5)
 *
 * The agent runs in demo mode if SAM_API_KEY or ANTHROPIC_API_KEY is absent.
 */

try {
  const { config: loadDotenv } = await import('dotenv');
  loadDotenv();
} catch {
  // dotenv not installed or no .env — that's fine
}

export const config = {
  SAM_API_KEY:       process.env.SAM_API_KEY       ?? '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  MODEL:             process.env.MODEL             ?? 'claude-sonnet-4-5',
};
