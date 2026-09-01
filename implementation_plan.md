# Implementation Plan - Deploying FPL Team Builder on Vercel

This document outlines the step-by-step plan for adapting and deploying the **FPL Team Builder** web application on **Vercel** for 24/7 global availability.

---

## Architecture Overview

Currently, the app relies on a custom Node.js HTTP server (`server.js`) to:
1. Serve static frontend assets (`index.html`, `css/`, `js/`).
2. Proxy requests from `/api/*` to `https://fantasy.premierleague.com/api/*` with custom headers (`User-Agent`, `Referer`) to bypass CORS restrictions.

When deploying to Vercel:
- **Frontend**: Vercel automatically hosts static assets (`index.html`, CSS, JS) on its global CDN.
- **Backend API Proxy**: `server.js` will be adapted into a **Vercel Serverless Function** (`/api/[...path].js`) or configured with a lightweight `vercel.json` routing configuration to handle FPL API proxying without needing a persistent Node.js process.

---

## User Review Required

> [!IMPORTANT]
> **GitHub Integration & Deployment Options**:
> - Vercel connects directly to your GitHub repository (`https://github.com/Spabhi/fplbuilder.git`).
> - Every git push will automatically trigger a production deployment.
> - The free Vercel Hobby plan provides unlimited serverless invocations and global CDN hosting suitable for this application.

---

## Proposed Changes

### Configuration & Infrastructure

#### [NEW] [vercel.json](file:///Users/spoorthymaringanti/FPL_App/vercel.json)
- Define routing rules and serverless API rewrites so `/api/*` calls are routed to the Vercel Serverless Function proxy.

---

### Backend API Proxy

#### [NEW] [api/[...path].js](file:///Users/spoorthymaringanti/FPL_App/api/[...path].js)
- Create a Vercel Serverless Function targeting `/api/*`.
- Replicate the custom headers (`User-Agent`, `Referer`, `Accept`) and CORS headers from `server.js` to ensure reliable server-side proxying of FPL data on Vercel's edge/serverless infrastructure.

---

### Project Files & Documentation

#### [MODIFY] [package.json](file:///Users/spoorthymaringanti/FPL_App/package.json)
- Add build/start scripts suitable for Vercel deployment and local testing.

#### [MODIFY] [README.md](file:///Users/spoorthymaringanti/FPL_App/README.md)
- Add single-click Vercel deployment instructions and badge.

---

## Verification Plan

### Local Verification
1. Test Vercel build locally using Vercel CLI (`npx vercel dev`).
2. Verify frontend loads correctly and `/api/bootstrap-static/`, `/api/fixtures/`, `/api/event/{gw}/live/` return 200 OK responses with FPL data.

### Production Verification
1. Import repository on [vercel.com](https://vercel.com).
2. Deploy production build.
3. Access the generated `.vercel.app` URL from desktop & mobile browsers to confirm pitch rendering, player list, live scores, and auto-pick features function smoothly.
