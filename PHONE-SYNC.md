# PO Studio phone sync

This Node service hosts the desktop PO Studio page and a small phone scanner page. The phone submits only a barcode and quantity; the desktop browser resolves the barcode against its own catalog and adds the item to the currently selected store's open PO. The server keeps pairing tokens and pending scan events in memory and expires them automatically. It does not store the product catalog, store list, or saved drafts.

## Deploy to Render

The repository includes a Render Blueprint in `render.yaml`. Keep the GitHub repository private, connect it to Render, and create a Blueprint from the repository. The Blueprint starts one always-on Node web service, runs the health check at `/health`, and prompts you to set `APP_PASSWORD` (at least 16 characters). Render supplies the public HTTPS URL; the server uses it to build the phone pairing link automatically.

The Blueprint uses Render's paid `starter` plan so the service does not go to sleep during normal use. Review Render's current price in its dashboard before creating the service. You can select a free plan for a trial, but free services sleep after inactivity and a restart clears active phone pairings.

To deploy on another Node host, set the start command to `npm start`, set `APP_PASSWORD` to a private passphrase of at least 16 characters, and set `PUBLIC_BASE_URL` to the service's public HTTPS origin, for example `https://po-sync.example.com`. The host must support long-lived Server-Sent Events. Both devices connect out to the host, so the desktop does not need router port forwarding. No Google account or spreadsheet is used.

Open the hosted root URL on the desktop, choose a store, then select **Pair phone**. Scan the displayed QR with the phone's camera. The phone page requests camera permission and sends each barcode/quantity to the desktop PO. Keep the desktop PO Studio tab open while scanning.

The desktop PO page is password protected because its HTML contains the product and store catalog. The QR link is a separate temporary bearer link. Pairing is available for five minutes; an active phone session expires after inactivity or at the end of the workday. Closing pairing invalidates the link. The host relays temporary barcode/quantity events, so use a host you trust. The catalog, stores, and saved drafts stay in the desktop browser's local storage.

## Local development

Run `npm install` and `npm start`, then set `APP_PASSWORD` and (if not running behind Render) `PUBLIC_BASE_URL`. Camera pairing requires a public HTTPS origin. The local HTTP URL is suitable for checking that the desktop page and health route load; it is not sufficient for phone camera pairing.

