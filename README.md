# WayGo

Your route. Your seat. Sorted.

Independent web app: its own source, data namespace, API, Git repository, and Vercel project. No hub or dependency on the other nine products.

## Run

Requires Node.js 22.13+ (Node 24 recommended). No third-party runtime dependencies.

```sh
npm start
# http://localhost:3000
npm test
npm run build
```

## What works

Product-specific browsing and filters, validated forms, calculated totals, durable local SQLite records, private cookie-scoped workspaces, record history, permitted status changes, JSON export, responsive layout, keyboard-accessible dialogs, and explicit browser-only demo mode when production storage is not configured.

## Vercel

Import this repository as a separate Vercel project. Build: `npm run build`; output: `dist`; framework: Other. The `api/records.js` function is deployed alongside the static app.

For durable cloud records configure `SESSION_SECRET` (random 32+ bytes), `KV_REST_API_URL`, and `KV_REST_API_TOKEN` from a Redis REST database. Never commit credentials. Each app must use a different session secret. The app namespace separates records; independent databases are recommended. Without these variables, the UI explicitly uses browser-only demonstration records.

## Product boundaries

This is a working MVP, not an operating marketplace. Catalog entries and prices are labelled sample data. No money is collected, no provider availability is verified, and requests are not sent to real providers. Accounts, identity verification, operator onboarding, real inventory and availability, payment-provider integration, notification delivery, and admin dispute handling need implementation before commercial launch. SurePlug does not provide escrow. Session workspaces are anonymous and browser-bound; clearing cookies loses access to server-side records. Current data store uses read-modify-write and needs transactional concurrency control before multi-tab/high-volume production use.

## Data & security

HTTP-only signed cookie; same-origin mutation checks; input and price validation on the server; escaped user output; restrictive security headers. Only the private session can access its records. Local database files and secrets are excluded from git. No personal contact details are needed for demo workflows. Do not enter sensitive information into sample records.
