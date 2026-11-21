import mongoose from 'mongoose';
import { readConfig } from '../config.js';
import { connectDatabase } from '../db.js';
import { Category, Product, Variant } from '../modules/catalog/models.js';
import { Inventory, Reservation } from '../modules/inventory/models.js';
import { currentCollection } from '../modules/catalog/current-collection.js';

try {
  const config = readConfig();
  if (config.NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production.');
  await connectDatabase(config.MONGODB_URI);
  for (const model of [Category, Product, Variant, Inventory, Reservation]) await model.init();
  for (const [index, c] of currentCollection.entries()) {
    const category = await Category.findOneAndUpdate(
      { slug: c.slug },
      { $setOnInsert: { name: c.name, kannadaName: c.kannadaName, displayOrder: index } },
      { upsert: true, returnDocument: 'after' },
    );
    for (const p of c.products) {
      const product = await Product.findOneAndUpdate(
        { slug: p.slug },
        {
          $setOnInsert: {
            name: p.name,
            kannadaName: p.kannadaName,
            categoryId: category!._id,
            description: `Demo ${p.name}. Replace with verified product information before launch.`,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      for (const weightGrams of [250, 500, 1000]) {
        const sku = `${p.slug.toUpperCase()}-${weightGrams}`;
        await Variant.updateOne(
          { sku },
          {
            $setOnInsert: {
              productId: product!._id,
              weightGrams,
              pricePaise: weightGrams * 100,
              currency: 'INR',
            },
          },
          { upsert: true },
        );
        // Fresh development fixtures only. Never reset an existing balance.
        await Inventory.updateOne(
          { sku },
          { $setOnInsert: { onHand: 30, reserved: 0 } },
          { upsert: true },
        );
      }
    }
  }
  console.log(
    'Demo catalog ready: 4 categories, 10 products, 30 SKUs. Existing records were preserved.',
  );
} catch (error) {
  const failure = error as { name?: string; code?: number };
  console.error(
    JSON.stringify({
      message:
        'Demo seeding failed. Check environment, database connectivity and write permissions.',
      type: failure.name,
      code: failure.code,
    }),
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
