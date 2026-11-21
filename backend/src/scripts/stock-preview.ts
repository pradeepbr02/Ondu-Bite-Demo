import mongoose from 'mongoose';
import { readConfig } from '../config.js';
import { connectDatabase } from '../db.js';
import { Category, Product, Variant } from '../modules/catalog/models.js';
import { Inventory } from '../modules/inventory/models.js';
import { CatalogMigration } from '../modules/catalog/migration.js';

// Explicitly requested one-time stock setting. Replays never reset later changes.
try {
  const config = readConfig();
  if (config.NODE_ENV === 'production') throw new Error('Preview stock is disabled in production.');
  await connectDatabase(config.MONGODB_URI);
  await CatalogMigration.init();
  const result = await mongoose.connection.transaction(
    async (session) => {
      const key = 'ondu-user-request-all-stock-30-v1';
      if (await CatalogMigration.exists({ key }).session(session))
        return { applied: false, reason: 'Preview stock was already received.' };
      const categories = await Category.find({ active: true }).session(session).lean();
      const products = await Product.find({
        active: true,
        categoryId: { $in: categories.map((c) => c._id) },
      })
        .session(session)
        .lean();
      const variants = await Variant.find({
        active: true,
        productId: { $in: products.map((p) => p._id) },
      })
        .session(session)
        .lean();
      const balances = await Inventory.find({ sku: { $in: variants.map((v) => v.sku) } })
        .session(session)
        .lean();
      if (balances.length !== variants.length || balances.some((b) => b.reserved > 30))
        throw new Error('Missing inventory or reservations exceed the requested balance.');
      const changed = await Inventory.updateMany(
        { sku: { $in: balances.map((b) => b.sku) }, reserved: { $lte: 30 } },
        { $set: { onHand: 30 } },
        { session },
      );
      const summary = {
        reason: 'User explicitly requested every active product variant stock be set to 30 pieces.',
        packsPerSku: 30,
        matchedSkus: changed.matchedCount,
        adjustedSkus: changed.modifiedCount,
        adjustments: balances.map((b) => ({
          sku: b.sku,
          before: b.onHand,
          after: 30,
          reserved: b.reserved,
        })),
      };
      await CatalogMigration.create([{ key, summary }], { session });
      return {
        applied: true,
        matchedSkus: changed.matchedCount,
        adjustedSkus: changed.modifiedCount,
        packsPerSku: 30,
      };
    },
    { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
  );
  console.log(JSON.stringify(result));
} catch {
  console.error(
    'Preview stock receipt failed. Check environment and database configuration. No partial adjustments were committed.',
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
