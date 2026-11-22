# Administration

Open `/admin` on the frontend. Sign in through the existing account page. Customer accounts cannot access admin data, even by calling the backend directly.

## First administrator

Register your own account in the storefront, then run from the backend folder:

```powershell
npm run admin:role -- your-email@example.com admin
```

Sign in again after promotion. The command revokes existing sessions. To revoke admin access, run the same command with `customer` instead of `admin`. There are no default production admin credentials and no public role management endpoint.

Existing administrators can open **Admin access** in the portal and grant or revoke access using the registered account email. Changes revoke the target account’s sessions and are recorded in **Activity**. An administrator cannot change their own role through the portal.

Run `npm run db:indexes` when deploying to install the new audit, coupon and order indexes. Restart the API and frontend after building. The inventory expiry worker continues to release expired checkout reservations independently.

## API contract

All routes below use `/api/v1/admin`, require an active admin bearer session and return `{ data }`. List routes support `page`, `limit` (maximum 50), and `q`, and return pagination metadata. The browser uses `/api/store/admin/...` through the HttpOnly-cookie gateway. Mutations require the exact frontend Origin.

| Method     | Path                             | Purpose                                                                  |
| ---------- | -------------------------------- | ------------------------------------------------------------------------ |
| GET        | `/me`, `/summary`, `/categories` | Access, dashboard, category selection                                    |
| PUT        | `/access`                        | Update a registered account role using `{ email, role }`                 |
| GET / POST | `/products`                      | Search products / create product and variants                            |
| GET / PUT  | `/products/:id`                  | Read / edit product with expected `revision`                             |
| POST       | `/images`                        | Raw JPEG/PNG/WebP body, max 8 MB; returns stable `/media/product-<hash>` |
| GET        | `/inventory`                     | SKU balances: onHand, reserved, available                                |
| POST       | `/inventory/adjustments`         | `{ operationId: UUID, sku, delta, reason }`                              |
| GET        | `/orders`, `/orders/:orderId`    | Order list and detail; list accepts status/fulfillmentStatus             |
| PUT        | `/orders/:orderId/fulfillment`   | `{ expectedStatus, status, carrier?, trackingNumber? }`                  |
| GET / POST | `/discounts`                     | Search / create coupon                                                   |
| PUT        | `/discounts/:id`                 | Edit coupon with expected `revision`                                     |
| GET        | `/audit`                         | Paginated actor/action/target/time history                               |

Products accept `name`, `slug`, `categoryId`, `description`, `active`, `images`, `ingredients`, `allergens`, and `variants`. Each variant has `sku`, `weightGrams`, `pricePaise`, `active`. New variants start at zero stock. Existing SKUs/weights cannot be repurposed or removed; deactivate them instead. Product edits and audit records commit together. Slugs and SKU/weight combinations are unique. Referenced images must already exist in the cloud manifest. Images are decoded and re-encoded to WebP in memory and uploaded to private S3; no runtime image files are written locally.

Stock deltas are transactional and cannot reduce onHand below reserved or exceed the stock limit. Reusing an operationId with the same input returns the original result; different input returns 409. Every adjustment requires a reason and commits with its audit entry. Checkout reservations and adjustments contend on the same inventory documents, preventing lost updates.

Fulfillment permits UNFULFILLED → PROCESSING → SHIPPED → DELIVERED only for CONFIRMED / CAPTURED orders. Shipping requires carrier and tracking number. The expected current status prevents concurrent changes from silently overwriting one another. Tracking is exposed on customer order details. This records shipment progress; carrier booking, refunds, returns and paid-order cancellation are not implemented. There is no manual payment confirmation. Until Razorpay is integrated, ordinary demo checkouts remain unpaid and cannot be fulfilled.

Coupons accept `code`, `kind` (PERCENT or FIXED), `value` (integer percentage or paise), `minSubtotalPaise`, `maxDiscountPaise` (0 means uncapped), ISO UTC `startsAt` and `endsAt`, and `active`. The UI accepts rupees and local date/time and converts to this contract. Start is inclusive; end exclusive. Coupons apply to item subtotal, never shipping, and do not stack. Percentage amounts round down to paise; discounts leave at least one paise of item subtotal payable. Shipping remains ₹59, free from ₹999 before discount. There are no redemption limits or per-customer limits in this version.

Customer checkout quote/create bodies now accept optional `couponCode`. The backend recalculates eligibility and amount at reservation time, includes coupon/discount in the quote fingerprint and snapshots it into order totals. Invalid/expired/disabled codes fail with 409. Editing a coupon does not alter existing order totals.

## Validation

`npm test` covers authorization, role injection/revocation, transactional product creation, stale edits, concurrent inventory changes, duplicate retries, reserved stock protection, coupon totals/expiry, fulfillment state transitions and S3 upload validation (mocked S3, isolated MongoDB).

For a disposable browser review, run `node --import tsx tests/support/admin-server.ts` from backend. This uses an isolated in-memory replica set on port 4015, with synthetic data and test-only admin `admin@example.test` / `Review-only-password-123`. Start the frontend on port 3100 with BACKEND_URL=http://127.0.0.1:4015 and APP_ORIGIN=http://localhost:3100. Run `node --test --test-isolation=none tests/admin-integration.mjs` from frontend to exercise the real gateway and CORS. Do not point this fixture at Atlas; it creates its own disposable database and never reads the application URI.
