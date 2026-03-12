# Lead Generation Service

A automated tool to find businesses without websites and reach out to them with personalized offers for landing page services.

## Overview

This project uses **Apify** to scrape business information (like Google Maps listings) and filters for those missing a website. It then generates personalized cold emails to pitch professional landing page services.

## Features

- **Business Discovery:** Automated scraping via Apify.
- **Lead Filtering:** Identify high-potential leads (no existing website).
- **Personalized Outreach:** AI-driven or template-based email generation.
- **Email Automation:** Integration for sending cold emails.

## Usage

The system is split into three phases:

1. **Phase 1: Discovery**
   Find construction companies in Columbus without websites.
   ```bash
   node src/index.js find
   ```
   *Results are saved to the `/data` folder for review.*

2. **Phase 2: Preview Outreach (Dry Run)**
   See exactly what emails would be sent without actually sending them.
   ```bash
   node src/index.js mail
   ```

3. **Phase 3: Live Outreach**
   Send the personalized emails to the discovered leads.
   ```bash
   node src/index.js send
   ```

## Project Structure

- `src/finder.js`: Logic for scraping and filtering leads via Apify.
- `src/mailer.js`: Email templates and nodemailer configuration.
- `src/index.js`: Main controller for the workflow.
- `data/`: Stores JSON results from your discovery runs.
