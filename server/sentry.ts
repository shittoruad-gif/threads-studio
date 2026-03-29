/**
 * Sentry Error Monitoring
 *
 * Initializes Sentry for error tracking in production.
 * Set SENTRY_DSN in .env to enable.
 */

import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.log("[Sentry] SENTRY_DSN not configured, error tracking disabled");
    return;
  }

  if (initialized) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    beforeSend(event) {
      // Strip sensitive data from error reports
      if (event.request?.headers) {
        delete event.request.headers['cookie'];
        delete event.request.headers['authorization'];
      }
      return event;
    },
  });

  initialized = true;
  console.log("[Sentry] Error tracking initialized");
}

/**
 * Capture an exception to Sentry
 */
export function captureException(error: Error | unknown, context?: Record<string, unknown>) {
  if (!initialized) {
    console.error("[Error]", error);
    return;
  }

  if (context) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Capture a message to Sentry
 */
export function captureMessage(message: string, level: "info" | "warning" | "error" = "info") {
  if (!initialized) {
    console.log(`[${level}] ${message}`);
    return;
  }

  Sentry.captureMessage(message, level);
}
