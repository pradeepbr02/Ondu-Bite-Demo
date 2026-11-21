import mongoose, { Schema, model } from 'mongoose';
import { Category, Product, Variant } from './models.js';
import { Inventory } from '../inventory/models.js';
import { pantryCollection } from './collection.js';

const CatalogMigration = model(
  'CatalogMigration',
  new Schema(
    { key: { type: String, unique: true, required: true }, summary: Schema.Types.Mixed },
    { timestamps: true },
  ),
);
export { CatalogMigration };
export async function migratePantry(images: Map<string, string>) {
  const key = 'ondu-four-categories-v1';
  return mongoose.connection.transaction(
    async (session) => {
      if (await CatalogMigration.exists({ key }).session(session))
        return { applied: false, categories: 4, products: 16 };
      // Every image must be uploaded first; a failed import leaves the catalog untouched.
      for (const category of pantryCollection)
        for (const p of category.products)
          if (!images.get(p.slug)) throw new Error(`Missing cloud photo: ${p.slug}`);
      const slugs = pantryCollection.flatMap((c) => c.products.map((p) => p.slug));
      await Category.updateMany(
        { slug: { $nin: pantryCollection.map((c) => c.slug) } },
        { $set: { active: false } },
        { session },
      );
      await Product.updateMany(
        { slug: { $nin: slugs } },
        { $set: { active: false }, $inc: { revision: 1 } },
        { session },
      );
      for (const [index, input] of pantryCollection.entries()) {
        const category = await Category.findOneAndUpdate(
          { slug: input.slug },
          {
            $set: {
              name: input.name,
              kannadaName: input.kannadaName,
              image: images.get(input.products[0].slug),
              displayOrder: index,
              active: true,
            },
          },
          { session, upsert: true, returnDocument: 'after' },
        );
        for (const p of input.products) {
          const product = await Product.findOneAndUpdate(
            { slug: p.slug },
            {
              $set: {
                name: p.name,
                kannadaName: p.kannadaName,
                categoryId: category!._id,
                active: true,
                images: [images.get(p.slug)!],
              },
              $inc: { revision: 1 },
              $setOnInsert: {
                ingredients: [],
                allergens: [],
                description: `${p.name}, from the Ondu Packet pantry. Photography shows a serving suggestion. Verified preparation, ingredient and shelf-life information will be added before sales open.`,
              },
            },
            { session, upsert: true, returnDocument: 'after', setDefaultsOnInsert: false },
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
                  active: true,
                },
              },
              { session, upsert: true },
            );
            // Preserve all existing stock and reservations. Newly introduced SKUs start empty.
            await Inventory.updateOne(
              { sku },
              { $setOnInsert: { onHand: 0, reserved: 0 } },
              { session, upsert: true },
            );
          }
        }
      }
      const summary = { applied: true, categories: 4, products: 16, variants: 48, newSkuStock: 0 };
      await CatalogMigration.create([{ key, summary }], { session });
      return summary;
    },
    { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
  );
}
