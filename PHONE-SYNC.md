# PO Studio phone sync

This Node service hosts the desktop PO Studio page and a small phone scanner page. The phone submits only a barcode and quantity; the desktop browser resolves the barcode against its own catalog and adds the item to the currently selected store's open PO. The server keeps pairing tokens and pending scan events in memory and expires them automatically. It does not store the product catalog, store list, or saved drafts.

## Free hosted setup on Render

The repository includes a Render Blueprint in `render.yaml` configured for Render's Free web service.

1. Keep the GitHub repository private because the app HTML contains your store and product catalog.
2. In Render, choose **New → Blueprint**, connect `aap-rauf/po-studio`, and apply the Blueprint from `main`.
3. When prompted, set `APP_PASSWORD` to a private passphrase of at least 16 characters. Do not add `PUBLIC_BASE_URL`; Render provides its HTTPS URL automatically.
4. Wait until the service is live, then open its `onrender.com` URL on the desktop and sign in. Select a store, choose **Pair phone**, and scan the QR with your phone.

This costs $0/month while you stay within Render's Free allowances. Render Free web services sleep after 15 minutes without inbound traffic and take about a minute to start when the next request arrives. They can also restart at any time. The pairing session and in-flight scans are held in server memory, so a sleep or restart ends the current phone pairing; create a new QR code and reconnect. The phone's next request after sleep may be delayed while the service starts. Keep the Render dashboard open to monitor usage. Render provides 750 free instance hours per workspace per calendar month. If you do not add a payment method, exceeding included bandwidth or build limits suspends the relevant service/build instead of charging you. These limits make Free suitable for trying the workflow or intermittent, low-volume use, but not business-critical always-on service. Render itself says Free instances are not for production applications.

To deploy on another Node host, set the start command to `npm start`, set `APP_PASSWORD` to a private passphrase of at least 16 characters, and set `PUBLIC_BASE_URL` to the service's public HTTPS origin, for example `https://po-sync.example.com`. The host must support long-lived Server-Sent Events. Both devices connect out to the host, so the desktop does not need router port forwarding. No Google account or spreadsheet is used.

Open the hosted root URL on the desktop, choose a store, then select **Pair phone**. Scan the displayed QR with the phone's camera. The phone page requests camera permission and sends each barcode/quantity to the desktop PO. Keep the desktop PO Studio tab open while scanning.

The desktop PO page is password protected because its HTML contains the product and store catalog. The QR link is a separate temporary bearer link. Pairing is available for five minutes; an active phone session expires after inactivity or at the end of the workday. Closing pairing invalidates the link. The host relays temporary barcode/quantity events, so use a host you trust. The catalog, stores, and saved drafts stay in the desktop browser's local storage.

## Local development

Run `npm install`, set `APP_PASSWORD`, and run `npm start`. For hosting outside Render, also set `PUBLIC_BASE_URL`. Camera pairing requires an HTTPS origin. The local HTTP URL is suitable for checking that the desktop page and health route load; it is not sufficient for phone camera pairing.

