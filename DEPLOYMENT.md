# Deployment Guide: LeadGen Pro

This document outlines the steps to deploy the LeadGen Pro SaaS platform to production using **Railway** (Backend) and **Vercel** (Frontend).

## Prerequisites
- A [Stripe](https://stripe.com) account (Live or Test mode).
- An [Apify](https://apify.com) account.
- An [OpenAI](https://openai.com) account.
- A [Railway](https://railway.app) account.
- A [Vercel](https://vercel.com) account.

---

## 🚀 1. Backend Deployment (Railway)

Railway is excellent for Node.js apps that need a filesystem (for our JSON DB) or you can later migrate to a real DB.

### Steps:
1. **GitHub Sync**: Push your project to a GitHub repository.
2. **New Project**: In Railway, click **New Project** > **Deploy from GitHub repo**.
3. **Select Repo**: Choose your LeadGen Pro repository.
4. **Environment Variables**: Add the following in the **Variables** tab:
   - `NODE_ENV`: `production`
   - `PORT`: `3000` (Railway will handle this automatically)
   - `JWT_SECRET`: A long random string.
   - `STRIPE_SECRET_KEY`: Your Stripe Secret Key.
   - `STRIPE_WEBHOOK_SECRET`: Obtain this after setting up the webhook in Stripe Dashboard.
   - `STRIPE_PRICE_BASIC`: Price ID for Basic plan.
   - `STRIPE_PRICE_PRO`: Price ID for Pro plan.
   - `APIFY_API_KEY`: Your Apify API Key.
   - `OPENAI_API_KEY`: Your OpenAI API Key.
   - `SMTP_USER`: Email for sending outreach.
   - `SMTP_PASS`: App password for the email.
   - `APP_URL`: Your production URL (e.g., `https://your-app.up.railway.app`).
   - `ALLOWED_ORIGINS`: Your Vercel frontend URL.

---

## 🎨 2. Frontend Deployment (Vercel)

Vercel is the best home for static frontends.

### Steps:
1. **New Project**: In Vercel, click **Add New** > **Project**.
2. **Import Repo**: Select the same GitHub repo.
3. **Framework Preset**: Choose **Other** or **Plain HTML**.
4. **Build Settings**: 
   - Root Directory: `./public`
5. **Environment Variables**:
   - Vercel doesn't strictly need them for this static setup, but ensuring your `app.js` points to the Railway API is key.
   - *Note*: Since the current frontend uses relative paths (e.g., `fetch('/api/...')`), if you deploy separately, you may need to update `app.js` to use an absolute `BASE_URL` or use a Vercel proxy (`vercel.json`).

---

## ⚓ 3. Stripe Webhook Setup

1. Go to **Stripe Dashboard** > **Developers** > **Webhooks**.
2. Add an endpoint: `https://your-railway-url.com/api/stripe/webhook`.
3. Select events:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
4. Copy the **Signing Secret** and add it as `STRIPE_WEBHOOK_SECRET` in Railway.

---

## 🛠 Production Checklist
- [ ] Change `JWT_SECRET` to a secure production key.
- [ ] Enable Stripe Live mode (or stay in Test mode for staging).
- [ ] Ensure all API keys have appropriate usage limits.
- [ ] Check console logs in Railway for any `[PLAN CHECK]` or `[USAGE TRACK]` events.
