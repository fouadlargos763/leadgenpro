# Production Deployment Plan

This document summarizes the deployment configuration and provides a checklist for launching the LeadGenPro SaaS platform.

## 🏗 Repository Structure
- `public/`: Static frontend files (HTML/CSS/JS).
- `src/`: Backend logic modules (Auth, Billing, AI, Scraper).
- `data/`: Local JSON database (Note: `.gitignore` protects sensitive user data).
- `server.js`: Main Express server (Production-hardened).
- `package.json`: Dependency and script management.

## 🚀 Deployment Targets
- **Backend**: [Railway](https://railway.app) (Recommended for Node.js + File persistence).
- **Frontend**: [Vercel](https://vercel.com) (Optimal for high-speed static delivery).

## 🔑 Environment Variables Validation
Ensure these are set in your production environment:
- `NODE_ENV`: `production`
- `PORT`: (Managed by host)
- `JWT_SECRET`: [REQUIRED]
- `STRIPE_SECRET_KEY`: [REQUIRED]
- `STRIPE_WEBHOOK_SECRET`: [REQUIRED]
- `APIFY_API_KEY`: [REQUIRED]
- `OPENAI_API_KEY`: [REQUIRED]
- `SMTP_USER` & `SMTP_PASS`: [REQUIRED]
- `ALLOWED_ORIGINS`: [REQUIRED] (Set to your Vercel URL)

## ✅ Deployment Checklist

### Step 1: GitHub Integration
- [ ] Initialize Git repository: `git init`
- [ ] Add all files: `git add .`
- [ ] Commit: `git commit -m "LeadGenPro SaaS Initial Version"`
- [ ] Push to GitHub (Private repository recommended).

### Step 2: Railway (Backend)
- [ ] Connect GitHub repository to Railway.
- [ ] Add all variables from `.env.example` to the Railway Dashboard.
- [ ] Verify the build logs show `🚀 LeadGen Pro Backend Live`.

### Step 3: Vercel (Frontend)
- [ ] Import the repository into Vercel.
- [ ] Set the "Root Directory" to `public`.
- [ ] Set `ALLOWED_ORIGINS` in Railway to the assigned Vercel domain.

### Step 4: Stripe Configuration
- [ ] Register the Railway Webhook URL in Stripe.
- [ ] Update `STRIPE_WEBHOOK_SECRET` in Railway with the signing secret.
- [ ] Perform a test transaction using a test card.

## 🛡 Production-Ready Confirmation
The platform has been audited for:
- [x] **Security**: Helmet headers and CORS protection enabled.
- [x] **Stability**: Global error handling and production logging (Morgan).
- [x] **Scalability**: Usage tracking and plan enforcement integrated.
- [x] **Maintenance**: Detailed `DEPLOYMENT.md` and `.env.example` provided.
