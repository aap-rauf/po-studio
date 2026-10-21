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

Use Node.js 20 or later. Install dependencies with `npm install`, configure `APP_PASSWORD` and `PUBLIC_BASE_URL` as described in `PHONE-SYNC.md`, then run `npm start`.

## Publish the website

The project includes `render.yaml` for deployment as one HTTPS web service on Render. Keep this GitHub repository private; the generated desktop HTML includes the store and product catalog. Connect the private repository to Render and create a Blueprint from it. Render asks you to set an app password during setup and provides the public URL; the service uses that URL automatically to create phone-pairing links. The Blueprint selects an always-on paid plan. Review the current price in Render before creating the service.

The repository should remain private: the generated desktop HTML contains store IDs and the current product catalog. Do not deploy it to a host you do not trust.

