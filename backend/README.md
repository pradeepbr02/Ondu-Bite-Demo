# ECOM API — catalog, customers, carts and reserved checkout

This API now lives in `backend/`. Run commands in this document from that folder. The separate Next.js storefront and root development instructions are documented in `../README.md`. The frontend authenticates through a same-origin server gateway with an HttpOnly cookie; direct API clients continue using bearer tokens.

Express 5 + TypeScript + MongoDB/Mongoose. India-only, one warehouse, INR prices in integer paise, independent stock per weight SKU.

## Run locally

Requires Node.js 24+ and MongoDB configured as a replica set (MongoDB Atlas also works). A standalone `mongod` cannot run our inventory transactions. The API checks this at startup.

```powershell
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
# Edit .env: set MONGODB_URI to your replica set / Atlas connection string.
npm run db:indexes
npm run seed
npm run dev
```

In another terminal, `npm run worker:inventory` runs reservation-expiry sweeps every five seconds. It is safe to run multiple expiry workers. The worker closes linked unpaid checkouts/orders and releases stock in the same transaction. Checkout reads also clean up an expired owned hold when the worker has not run. Ordinary catalog and cart requests do not create reservations.

The demo seed inserts 5 categories, 40 products and 120 SKUs. It never resets existing prices or stock. Prices, food information and stock are illustrative, not a production catalog. Demo seeding refuses `NODE_ENV=production`.

## Available HTTP endpoints

| Method       | Path                           | Behavior                                                 |
| ------------ | ------------------------------ | -------------------------------------------------------- |
| GET          | `/health/live`                 | Process liveness                                         |
| GET          | `/health/ready`                | MongoDB connection readiness                             |
| GET          | `/api/v1/categories`           | Active categories in display order                       |
| GET          | `/api/v1/products`             | Active products with active variants and availability    |
| GET          | `/api/v1/products/:slug`       | Product details, ingredients, allergens, variants        |
| POST         | `/api/v1/auth/register`        | Register with name, email and password                   |
| POST         | `/api/v1/auth/login`           | Create a 24-hour bearer session                          |
| GET          | `/api/v1/auth/me`              | Current authenticated customer                           |
| POST         | `/api/v1/auth/logout`          | Revoke the current session                               |
| POST         | `/api/v1/auth/logout-all`      | Revoke all sessions for the current customer             |
| GET          | `/api/v1/cart`                 | Current customer's cart, live prices and availability    |
| PUT          | `/api/v1/cart`                 | Replace cart using an expected revision                  |
| GET / POST   | `/api/v1/addresses`            | List or create owned delivery addresses                  |
| PUT / DELETE | `/api/v1/addresses/:id`        | Replace or delete an owned address                       |
| POST         | `/api/v1/checkouts/quote`      | Quote current cart, address and shipping                 |
| POST         | `/api/v1/checkouts`            | Atomically create checkout, pending order and stock hold |
| GET          | `/api/v1/checkouts/active`     | Resume current checkout, or null                         |
| GET          | `/api/v1/checkouts/:id`        | Read owned checkout and order snapshot                   |
| POST         | `/api/v1/checkouts/:id/cancel` | Cancel unpaid checkout and release stock                 |
| GET          | `/api/v1/orders`               | Paginated customer order history                         |
| GET          | `/api/v1/orders/:id`           | Owned order snapshot and current status                  |

Product query parameters: `category` (slug), `page` (1–1000, default 1), `limit` (1–40, default 12). Unknown parameters are rejected. Unknown categories return an empty list. Inactive parent categories also hide their products. Offset pagination is intentionally sufficient for our initial 40-product catalog.

```powershell
Invoke-RestMethod http://localhost:4000/api/v1/categories
Invoke-RestMethod 'http://localhost:4000/api/v1/products?category=nuts&limit=8'
Invoke-RestMethod http://localhost:4000/api/v1/products/almonds
```

Example variant:

```json
{
  "sku": "ALMONDS-500",
  "weightGrams": 500,
  "pricePaise": 50000,
  "currency": "INR",
  "inStock": true
}
```

Availability is advisory. Only successful stock reservation guarantees a hold. Inventory counts, reservation ownership, and internal database metadata are not exposed by the catalog API. Responses currently use `Cache-Control: no-store`; we will separate cacheable catalog content from live availability before enabling shared caching.

Errors use `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`. Validation errors also contain field details. Each response has an `X-Request-Id` header. Request logs omit bodies, tokens, URLs and database credentials.

## Structure and learning notes

```text
src/app.ts                  Express middleware, routes, common errors
src/server.ts               Configuration, DB startup, shutdown
src/modules/catalog/        Product/category/variant models and read APIs
src/modules/inventory/      Stock and reservation models, internal operations
src/modules/identity/       Password hashing, opaque sessions, authentication routes
src/modules/cart/           Owned carts, revision checks, live price calculation
src/modules/addresses/      Owned Indian delivery address CRUD
src/modules/checkout/       Quote, transactional coordinator, order snapshots/lifecycle
src/worker.ts               Recoverable database-driven expiry sweeps
src/scripts/                Explicit index creation and demo seed
tests/integration.test.ts   HTTP tests and real MongoDB transaction/race tests
tests/identity-cart.test.ts Authentication, session revocation, cart isolation/race tests
tests/checkout.test.ts      Quote consent, snapshots, rollback, expiry and concurrency
```

`createApp()` does not listen or connect to MongoDB. This keeps HTTP testing independent of production startup. Express 5 forwards rejected async handlers to the central error middleware.

`reserveStock()` is an internal service, not an HTTP endpoint. The authenticated checkout coordinator calls `reserveStockInSession()` to share one database session across the checkout, order, cart revision claim, reservation and inventory audit events. Do not open a nested transaction or run parallel operations inside that transaction. This slice prepares a pending purchase; it does not create a Razorpay payment session or collect money.

Reservations use conditional `$inc` updates with `onHand - reserved >= quantity` inside one transaction. A failure for any SKU rolls back the entire cart. A unique checkout ID plus a canonical item fingerprint handles replay and detects reuse with changed contents or ownership. Retrying an expired reservation returns its existing released state rather than creating another hold.

Expiry uses a conditional `ACTIVE → RELEASED` transition and counter updates in one transaction. There is no TTL deletion. A periodic sweep recovers missed runs without a queue. Redis is intentionally deferred until we add caching and asynchronous jobs that need it.

## Authentication and cart walkthrough

Registration accepts `{ "name": "Shopper", "email": "you@example.com", "password": "a-long-unique-password" }`. Passwords must be 12–128 characters, are never trimmed, and are stored with a random salt and asynchronous scrypt (N=32768, r=8, p=3). Email is trimmed and lowercased. Unknown fields, including requested roles, are rejected. Registration returns public profile fields; login is a separate request.

Login accepts email and password and returns `data.accessToken`, `data.tokenType`, `data.expiresAt`, and `data.customer`. Send `Authorization: Bearer <accessToken>` on protected requests. Tokens are 32 random bytes; only their SHA-256 hashes are stored. Authorization checks expiry on every request, independently of MongoDB TTL cleanup, and rejects disabled customers. Logout deletes the session immediately. Logout-all affects only the authenticated customer's sessions.

This API currently uses bearer tokens, not cookies. For manual API clients keep the token private. For the future Next.js storefront, use a server-side session/BFF with a Secure, HttpOnly cookie and CSRF protection; do not put API tokens in localStorage or URLs. A refresh flow is not implemented: login again after expiry. All deployed authentication traffic requires HTTPS.

```powershell
# Use your own account/password. Never commit real credentials in request files.
$register = @{ name='Shopper'; email='you@example.com'; password='a-long-unique-password' } | ConvertTo-Json
Invoke-RestMethod http://localhost:4000/api/v1/auth/register -Method Post -ContentType application/json -Body $register
$credentials = @{ email='you@example.com'; password='a-long-unique-password' } | ConvertTo-Json
$login = Invoke-RestMethod http://localhost:4000/api/v1/auth/login -Method Post -ContentType application/json -Body $credentials
$headers = @{ Authorization="Bearer $($login.data.accessToken)" }
$cart = Invoke-RestMethod http://localhost:4000/api/v1/cart -Headers $headers
$body = @{ revision=$cart.data.revision; items=@(@{ sku='ALMONDS-500'; quantity=2 }) } | ConvertTo-Json -Depth 4
Invoke-RestMethod http://localhost:4000/api/v1/cart -Method Put -Headers $headers -ContentType application/json -Body $body
```

Cart writes accept exactly `{ "revision": 0, "items": [{ "sku": "ALMONDS-500", "quantity": 2 }] }`. New carts have revision 0. Every successful write increments it. On `409 CART_CONFLICT`, fetch the cart and reconcile changes before retrying. Clear a cart by saving an empty `items` array with its current revision; remove an item by omitting it from the replacement array. A lost successful response can yield a conflict on retry, so fetch the latest state rather than blindly resubmitting.

Cart ownership comes exclusively from the authenticated session. There is no client-supplied customer ID and no stored client-supplied price. Carts allow up to 20 distinct SKUs and 20 packs per SKU. Saving a currently unavailable product is rejected; stock shortages may remain in the cart and are reported as issues. Reads flag products deactivated since the cart was saved, and `subtotalPaise` becomes null when an item cannot be priced. Subtotals exclude shipping, taxes and promotions: they are not final payable quotes. `canCheckout` is advisory catalog/stock eligibility; the checkout coordinator will validate the full purchase again. Cart writes never reserve inventory.

The credential limiter allows 20 register/login requests per IP per 15 minutes; the general API limit is 120 requests per minute. Both are currently per process. Registration reports duplicate emails explicitly (an account-enumeration tradeoff); login uses generic errors and performs a password derivation even for unknown emails. Before public launch, add verified email, password reset, account-aware abuse controls and shared rate limiting.

`npm run db:check` validates database connectivity and transaction capability without printing connection credentials. The local `.env` is ignored; never paste it into documentation or commits. The configured application database is `ecom`.

## Address and checkout walkthrough

All address, checkout and order endpoints require the bearer session. Address IDs are MongoDB object IDs; checkout and order IDs are UUIDs. Every query includes the authenticated customer ID. Reading or changing another customer's resource returns 404.

Address input: `name`, `phone`, `line1`, optional `line2`, `city`, `stateCode`, `postalCode`, and optional `country` (only `IN`). Phone accepts a 10-digit Indian mobile number or the same number prefixed with `+91`; the stored value uses `+91`. PIN/state validation is syntactic, not proof that a courier serves the address.

Shipping is **5900 paise (₹59), free when item subtotal is at least 99900 paise (₹999)**. Totals are explicitly `pricingMode: DEMO`: prices are used as listed, with no additional tax calculation. Responses include `paymentAvailable: false` and `serviceability: UNVERIFIED`. Production startup disables new demo quotes and checkout creation with `503 CHECKOUT_NOT_READY` by default.

To offer demo checkout on Render, keep `NODE_ENV=production`, set `DEMO_CHECKOUT_ENABLED=true` on the API service, and deploy. The API runs the reservation expiry loop itself whenever this flag is set, so the demo can run without a separate worker. It checks for expired holds as soon as it starts. If the API sleeps, cleanup resumes when it starts again. Each demo checkout holds stock in the configured database for up to 15 minutes under normal operation. Payments and fulfillment remain unavailable for unpaid demo orders.

Using `$headers` from the login example above:

```powershell
$addressBody = @{ name='Shopper'; phone='9876543210'; line1='123 Example Street'; city='Chennai'; stateCode='TN'; postalCode='600001'; country='IN' } | ConvertTo-Json
$address = Invoke-RestMethod http://localhost:4000/api/v1/addresses -Method Post -Headers $headers -ContentType application/json -Body $addressBody
$cart = Invoke-RestMethod http://localhost:4000/api/v1/cart -Headers $headers
$quoteBody = @{ cartRevision=$cart.data.revision; addressId=$address.data.id } | ConvertTo-Json
$quote = Invoke-RestMethod http://localhost:4000/api/v1/checkouts/quote -Method Post -Headers $headers -ContentType application/json -Body $quoteBody
$checkoutHeaders = $headers.Clone()
$checkoutHeaders['Idempotency-Key'] = [guid]::NewGuid().ToString()
$checkoutBody = @{ cartRevision=$cart.data.revision; addressId=$address.data.id; quoteFingerprint=$quote.data.quoteFingerprint } | ConvertTo-Json
$checkout = Invoke-RestMethod http://localhost:4000/api/v1/checkouts -Method Post -Headers $checkoutHeaders -ContentType application/json -Body $checkoutBody
Invoke-RestMethod "http://localhost:4000/api/v1/checkouts/$($checkout.data.checkoutId)" -Headers $headers
# Optional cancellation:
Invoke-RestMethod "http://localhost:4000/api/v1/checkouts/$($checkout.data.checkoutId)/cancel" -Method Post -Headers $headers
```

1. A quote reads active products, variant prices, the selected owned address and the expected cart revision in a consistent database snapshot. It checks stock but does not reserve it. Its fingerprint covers the exact customer/cart revision, address snapshot, item snapshots and pricing policy.
2. Creation requires that fingerprint and a UUID `Idempotency-Key`. Changed prices or addresses produce `409 QUOTE_CHANGED`; a cart edit produces `409 CART_CONFLICT`. Request a new quote and show it to the customer before retrying.
3. Within one transaction, creation increments the cart revision, inserts checkout and pending order snapshots, reserves every SKU conditionally, and records a `RESERVED` audit event. Any failure rolls all of these back. The cart contents remain available for editing; its new revision prevents a concurrent edit from silently crossing checkout creation.
4. A partial unique index enforces one active checkout per customer, even for different simultaneous idempotency keys. Resume via `/checkouts/active` or cancel before starting another. This limits holds per account; stronger verified-account/abuse controls remain necessary before launch.
5. Repeating the same key and body returns the original checkout with HTTP 200 (`Idempotency-Replayed: true`); initial creation returns 201. Changed contents with an old key produce `409 IDEMPOTENCY_CONFLICT`. Replays do not extend the 15-minute reservation or recreate cancelled/expired holds. To start a genuinely new attempt, fetch the current cart, obtain a new quote and use a new key.
6. Cancellation and expiry transition the active reservation, checkout and unpaid order together and record one `RELEASED` event. Multiple workers/cancel requests cannot release the same stock twice. Keep the worker running even though owned checkout reads also support lazy expiry.

Pending orders are not paid orders and must not trigger fulfillment. Their stored item prices, address and totals remain fixed when the catalog, address book or cart changes. Order list query parameters are `page` (default 1) and `limit` (default 10, maximum 20); pending, cancelled and expired attempts currently appear in this history with explicit status. Shipping creation and notifications are deferred until a verified captured payment confirms the order.

## Verification

```powershell
npm run typecheck
npm test
npm run build
```

Tests start an isolated, temporary MongoDB replica set; they never use `MONGODB_URI` or your real data. On first run, `mongodb-memory-server` downloads a MongoDB binary to `.cache/mongodb-binaries` (network access required). Tests verify last-pack contention across 100 checkout attempts, transaction rollback, concurrent idempotent retries, and duplicate expiry workers.

## Production boundaries and next slice

This is a runnable backend foundation, not a completed production commerce system. Customer authentication, addresses, carts, demo checkout/order snapshots, reservation auditing and coordinated expiry are implemented; admin privileges and routes are not exposed. Next: Razorpay integration with durable webhooks, payment reconciliation, late-payment resolution and refunds. Stock consumption is deliberately not implemented before those payment boundaries exist.

Before enabling live checkout, finalize pricing/tax and courier serviceability, and add payment-driven stock movement, fulfillment/refund/outbox workflows. Reservation/release audit events already commit with stock holds. Payment confirmation must coordinate with cancellation/expiry and handle late capture; the current unpaid-only demo lifecycle must be extended before enabling payments. Before horizontally scaling, replace the current per-process rate limiter with a shared store or gateway limits. Set proxy trust to the actual deployment topology, run index creation before serving traffic, configure backups and secret management, and deploy the expiry worker as a supervised process. Production disables automatic index building; `npm run db:indexes` explicitly creates indexes without dropping existing ones.

Technical references: [Express error handling](https://expressjs.com/en/guide/error-handling/), [Mongoose transactions](https://mongoosejs.com/docs/transactions.html), [MongoDB atomicity](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/).
