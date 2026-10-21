# PO Studio

PO Studio is a browser based purchase order tool with a companion phone barcode scanner. The desktop page resolves scanned barcodes against its catalog; the phone sync service relays barcode and quantity updates to the open desktop order.

## Project files

- `outputs/po-studio.html` — current desktop app, including its catalog data.
- `mobile-scan.html` — phone scanner page.
- `sync-server.js` — HTTPS pairing and scan relay service.
- `package.json` — Node.js scripts and dependencies.
- `PHONE-SYNC.md` — setup and deployment instructions.
- `work/pom-studio-refined.html` — editable desktop app template.

## Run the sync service

Use Node.js 20 or later. Install dependencies with `npm install`, set `APP_PASSWORD` to a private passphrase of at least 16 characters, then run `npm start`. `PUBLIC_BASE_URL` is only needed when hosting outside Render.

## Publish the website

The project includes `render.yaml` for a no-monthly-cost Render Free web service with HTTPS. Keep this GitHub repository private; the generated desktop HTML includes the store and product catalog. In Render, choose **New → Blueprint**, connect `aap-rauf/po-studio`, and apply the Blueprint. Set `APP_PASSWORD` to a private passphrase of at least 16 characters when prompted. Render provides the public URL; the service uses it automatically to create phone-pairing links.

Render Free is a low-cost-start option, not reliable always-on hosting: the service sleeps after 15 minutes without inbound traffic, the first request after sleep can take about a minute, and Render can restart it. Phone pairing sessions are held in memory and end when the service restarts or sleeps. The desktop catalog and saved drafts remain in that browser's local storage. Render grants 750 free service hours per workspace per month; without a payment method, reaching usage limits suspends the service instead of charging an overage. See `PHONE-SYNC.md` for the deployment steps and limits.

The repository should remain private: the generated desktop HTML contains store IDs and the current product catalog. Do not deploy it to a host you do not trust.

