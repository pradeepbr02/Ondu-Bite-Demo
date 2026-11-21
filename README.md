# Ondu Packet ecommerce project

A responsive Next.js storefront and a separate Express/MongoDB API. Brand: **Ondu Packet**. The visual direction combines a warm Indian pantry aesthetic with logo green, golden yellow and white. Store content comes from the API; no mock catalog is substituted when the API fails.

```text
backend/     Express API, MongoDB models, transaction services, worker, tests
frontend/    Next.js storefront, server API gateway, styles, original image assets
scripts/     Local development launcher
```

## Code formatting

From the project root, run `npm ci` once to install the pinned formatting tool, then:

```powershell
npm run format        # Format frontend, backend, tests, scripts and documentation
npm run format:check  # Check formatting without changing files
```

Prettier uses two-space indentation, single quotes in JavaScript/TypeScript, semicolons,
100-character line wrapping and LF line endings. The root `.editorconfig` shares indentation
and newline settings with compatible editors. Secrets, dependencies, generated output,
lockfiles, managed instruction files and public binary assets are excluded from formatting.

## Start the application

Node.js 24+ is required. Dependencies have already been installed in both folders. To reinstall from the lockfiles:

```powershell
npm run install:all
```

The MongoDB configuration is now in **`backend/.env`**. It is ignored by Git. The frontend does not receive the MongoDB URI, password or API session token in client JavaScript.

```powershell
# From the project root; starts API, reservation worker and storefront.
npm run dev
```

Open **http://localhost:3000**. The API listens on port 4000. Use `localhost` for the frontend to match the configured origin. For separate terminals:

```powershell
npm run dev:backend
npm run dev:frontend
# Optional third terminal for expiry sweeps:
npm --prefix backend run worker:inventory
```

Optional frontend server configuration can be placed in `frontend/.env.local`, based on `frontend/.env.example`:

```dotenv
BACKEND_URL=http://127.0.0.1:4000
APP_ORIGIN=http://localhost:3000
```

`BACKEND_URL` is a server-only setting. When deploying, set `APP_ORIGIN` and the backend's `CORS_ORIGIN` to the same exact HTTPS frontend origin. Production session cookies require HTTPS. The current backend deliberately disables new demo checkouts when `NODE_ENV=production`; catalog, accounts and history remain available.

## Store assistant and WhatsApp

Set `GEMINI_API_KEY` in `backend/.env` using a key from [Google AI Studio](https://aistudio.google.com/apikey). The default `GEMINI_MODEL` is `gemini-3.1-flash-lite`. Restart the backend after changing its environment. The assistant can classify typed questions about shipping, pack sizes, checkout, addresses, ingredients, order status and WhatsApp. FAQ answers come from store content and order status comes from the existing signed-in orders API. The shortcuts remain available if Gemini is unconfigured.

Set `WHATSAPP_ORDER_NUMBER` in `frontend/.env.local` to the public WhatsApp Business number, including the country code and using digits only. Restart the storefront after changing it. The assistant and bag open an editable WhatsApp draft with the selected packs and quantities. The customer sends it and the shop confirms the request in WhatsApp. This handoff does not create an order, charge a payment or reserve stock.

## Implemented shopping flows

- Home with internet-sourced food photography, four API-backed categories, Kannada accents and product selections.
- Product search, category filters, price sorting, weight selection and stock availability.
- Product detail pages with variant-specific prices and available product information.
- Guest bag with local persistence; sign-in merges it into the customer cart.
- Registration, sign-in, session restoration and sign-out.
- Cart quantity changes/removal, conflict recovery, estimated shipping and free-shipping progress.
- Add, edit and remove owned Indian delivery addresses.
- Checkout quote review, 15-minute reservation, active checkout resumption and cancellation.
- Order history and immutable order details.
- Informational story and FAQ pages, loading/error/empty states, keyboard focus, mobile navigation and reduced-motion support.

Shipping is **₹59, free from a ₹999 item subtotal**. All checkout orders remain unpaid previews. Razorpay, courier booking, verified product facts and final tax treatment are later slices. There is no simulated successful payment or fabricated delivery status. The FAQ is informational; an AI chatbot has not been added yet.

The active catalog has 4 categories and 10 products: Ready to eat (Upma, Poha, Pongal, Bisibele Bath), Ready to mix (Rava Idli Mix, Gulab Jamun Mix), Coffee (Filter Coffee), and Snacks (Chakli, Nippat, Kodbale). Dry fruits and the former Idli listing are hidden; historical records and reservations remain intact. New variants start with 30 pieces, matching the user-requested stock preference. Product specifications and prices remain preview data. Product and category photos are cloud-backed branded references with credits at /photo-credits. No runtime image files are kept locally. See [asset notes](frontend/docs/ASSETS.md).

## Cloud-only storefront images

The 16 current food photographs were downloaded from Wikimedia Commons, converted to WebP in memory, uploaded to bucket `ecom-ondu-bite` in `us-east-1` under `ondu-bite/storefront/`, downloaded and checksum-verified, and registered in MongoDB mediaassets with source, author, license and conversion notes. Their total size is 2,834,574 bytes. Object names contain content hashes. The supplied brand logo is also in S3. Earlier generated hero/category objects are retained for history but are no longer used by the storefront.

```text
Browser → /media/product-<content-hash> or /media/brand
             ↓ get registered object location from Express
          Private S3 object → streamed response → browser
```

S3 is the sole source of the image bytes. The Next.js route streams its response without writing images to disk. Next image optimization is disabled to avoid an on-disk optimizer cache. The local source PNGs were removed after cloud verification. There is no local image fallback.

The backend reads `AWS_REGION`, `S3_BUCKET`, `S3_PREFIX` and AWS credentials from its environment or the SDK credential chain. It only signs the registered image names and restricts object keys to the storefront prefix. Temporary read links remain server-side; browser-visible URLs stay under `/media/`. Images support ETag/304 revalidation and a five-minute browser cache. Browser caching is normal client behavior, not server-side file storage. No S3 public-access policy or bucket ACL was changed by this migration.

CloudFront is not configured yet. To add it later, attach a distribution to this private bucket using Origin Access Control, then set backend `MEDIA_PUBLIC_BASE_URL=https://your-distribution.cloudfront.net` (bucket root origin, no origin path). The object keys and storefront component URLs do not need to change. The same-origin route can continue streaming, or later redirect to the CDN after delivery is verified.

With the API and storefront running, verify cloud delivery without exposing credentials or signed URLs:

```powershell
npm --prefix backend run images:check
```

The operator-only one-time upload utility is `npm --prefix backend run images:upload -- <source-directory>`, where the supplied directory contains `pantry-hero.png` and `pantry-categories.png`. It converts in memory, uploads only to the configured prefix, verifies the downloaded bytes, and transactionally changes the MongoDB references only after both objects verify. Its input files are not kept in the application repository. The admin product editor also supports authenticated S3 image uploads; there is no public unauthenticated upload endpoint.

## Integration and security boundary

```text
Browser → Next.js /api/store/* → Express /api/v1/* → MongoDB
              HttpOnly cookie       Bearer token
```

The Next.js gateway only forwards explicitly allowed paths and methods. It keeps bearer credentials in an HttpOnly, SameSite=Lax cookie (Secure and `__Host-` prefixed in production), removes the raw token from login JSON, checks the exact Origin on every mutation, and clears invalid/revoked sessions. It does not forward arbitrary upstream URLs or caller-controlled authorization headers. Guest cart storage contains only SKUs and quantities. Logout revokes the database session.

Express CORS explicitly permits the configured frontend origin, GET/POST/PUT/DELETE/OPTIONS, and Content-Type/Authorization/Idempotency-Key headers. It exposes request ID, replay and location headers. Other supplied origins receive 403 before routes execute. Server clients without Origin remain supported; CORS is not authentication. The browser normally makes same-origin gateway requests, so database endpoints and bearer credentials stay server-side.

The existing rate limits are still per-process/IP. Proxying concentrates traffic onto the Next.js server's IP; before public launch, configure a trusted ingress/client-IP contract and shared abuse limits so customers are not grouped into one bucket. Do not blindly trust client-supplied forwarding headers. Catalog loading follows API pagination in bounded batches, so newly added products beyond the original 40 are included. Move filtering/search to paginated server queries if the catalog grows substantially.

## Verification

```powershell
npm run typecheck
npm test
npm run build
```

Backend tests use isolated MongoDB replica sets and never the Atlas database. CORS tests cover allowed origin, disallowed and lookalike origins, missing Origin, and checkout preflight headers. Frontend unit tests cover gateway allowlisting and mutation-origin checks.

For the HTTP integration test, use two separate terminals:

```powershell
# Terminal 1 — temporary test database and API, not Atlas
Set-Location backend
node --import tsx tests/support/store-server.ts
```

```powershell
# Terminal 2 — isolated frontend
Set-Location frontend
$env:BACKEND_URL='http://127.0.0.1:4010'
$env:APP_ORIGIN='http://localhost:3000'
npm run dev
```

Then run `npm --prefix frontend run test:integration` from the project root. The test verifies an isolated-backend response marker before creating any customer or order, and refuses to write if the frontend points at Atlas. It exercises registration, HttpOnly login, authenticated cart/address/checkout, idempotent replay, history, cancellation, revocation and real HTTP CORS. The test-only server binds to loopback and is not part of the production build. Stop it with `Invoke-WebRequest http://127.0.0.1:4010/__test/stop -Method Post` after stopping the test frontend. Clear the temporary `BACKEND_URL` environment override before starting the real app.

Backend API details and architecture notes remain in [backend/README.md](backend/README.md).

## Admin portal

The responsive store administration portal is at /admin. Manage products and S3 images, SKU inventory, order fulfillment, coupon discounts and activity history. Register an account first, then grant it admin access from the backend with: npm run admin:role -- your-email@example.com admin. Sign in again afterward. See backend/docs/ADMIN.md for endpoints, deployment indexes, concurrency rules and current payment/refund limitations.

## Four-category catalog migration

Run npm --prefix backend run catalog:refresh to import/resume the licensed photo downloads and apply the one-time ondu-four-categories-v1 migration. Uploads verify before the transaction changes catalog visibility. Old categories/products are hidden, not deleted; historical orders, reservations and existing SKU balances remain intact. Replays do not overwrite later admin edits. New SKUs begin with zero stock. The historical v1 collection is retained for migration replay. The current development seed creates 4 categories, 10 products and 30 demo SKUs on an empty database.

## Stock and package photo update

All 48 active variants were explicitly set to 30 on-hand pieces at the user request, preserving reserved quantities and prices. The repeat-safe stock:preview operation records before/after balances in catalogmigrations under ondu-user-request-all-stock-30-v1 and does not reset stock again on replay. MTR breakfast packets and Cothas coffee powder reference photos now lead the five relevant product galleries; the other 11 products retain their food photos. All image binaries remain in S3.

## Ready-to-mix collection and refined cards (20 November 2026)

Run npm --prefix backend run catalog:mixes to import the six MTR/Organic Mandya reference photos and apply the repeat-safe ondu-ready-to-mix-and-bisibele-v1 migration. It replaces Dry fruits with Ready to mix, hides Idli, adds Bisibele Bath and two mix products, and refreshes the three snack photos. Existing prices, inventory balances, reservations and order snapshots are preserved; new variants get 30 pieces. Replays preserve later admin changes.

The shop supports category grouping (A–Z/Z–A), price, name and in-stock-first sorting. Search includes English and Kannada names. Images are attached near the viewport through IntersectionObserver plus native lazy loading and async decoding. The hero and main product photo remain eager. Product cards render in batches of 8 with automatic scroll loading and a Load more fallback. Product metadata is still fetched through the existing catalog loader; this is deferred image loading and progressive rendering, not server-side infinite API pagination. Cards use subdued borders, uncropped package images, consistent pack controls and Add buttons; the logo palette and gradients are unchanged.
