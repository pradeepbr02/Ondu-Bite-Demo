import mongoose from 'mongoose';
import { Category, Product, Variant } from './models.js';
import { Inventory } from '../inventory/models.js';
import { CatalogMigration } from './migration.js';
import { currentCollection, mixPhotoSources } from './current-collection.js';

export const mixesMigrationKey = 'ondu-ready-to-mix-and-bisibele-v1';
export type ImportedPhoto = { path: string; note: string };
export async function migrateMixes(photos: Map<string, ImportedPhoto>) {
  return mongoose.connection.transaction(
    async (session) => {
      if (await CatalogMigration.exists({ key: mixesMigrationKey }).session(session))
        return { applied: false };
      for (const source of mixPhotoSources)
        if (!photos.get(source.slug)?.path.match(/^\/media\/product-[a-f0-9]{24}$/))
          throw new Error(`Missing cloud photo: ${source.slug}`);
      const slugs = currentCollection.flatMap((c) => c.products.map((p) => p.slug));
      const hidden = await Product.find({ active: true, slug: { $nin: slugs } })
        .session(session)
        .select('slug')
        .lean();
      await Product.updateMany(
        { active: true, slug: { $nin: slugs } },
        { $set: { active: false }, $inc: { revision: 1 } },
        { session },
      );
      await Category.updateMany(
        { slug: { $nin: currentCollection.map((c) => c.slug) } },
        { $set: { active: false } },
        { session },
      );
      const changes = [];
      for (const [displayOrder, c] of currentCollection.entries()) {
        const category = await Category.findOneAndUpdate(
          { slug: c.slug },
          { $set: { name: c.name, kannadaName: c.kannadaName, displayOrder, active: true } },
          { upsert: true, session, returnDocument: 'after' },
        );
        let categoryImage = '';
        for (const p of c.products) {
          const old = await Product.findOne({ slug: p.slug }).session(session).lean();
          const photo = photos.get(p.slug);
          const images = photo
            ? [photo.path, ...(old?.images ?? []).filter((i) => i !== photo.path)].slice(0, 8)
            : (old?.images ?? []);
          if (!images.length) throw new Error(`Missing product image: ${p.slug}`);
          const product = await Product.findOneAndUpdate(
            { slug: p.slug },
            {
              $set: {
                name: p.name,
                kannadaName: p.kannadaName,
                categoryId: category!._id,
                active: true,
                images,
                ...(photo ? { imagePresentation: 'package', imageNote: photo.note } : {}),
              },
              $inc: { revision: 1 },
              $setOnInsert: {
                ingredients: [],
                allergens: [],
                description: `${p.name} from the Ondu Packet pantry. Branded packaging is shown as a reference. Verified preparation, ingredients and shelf-life information will be added before sales open.`,
              },
            },
            { upsert: true, session, returnDocument: 'after', setDefaultsOnInsert: false },
          );
          if (!categoryImage) categoryImage = images[0]!;
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
              { upsert: true, session },
            );
            // Carry forward the user's 30-piece preference for newly introduced variants only.
            await Inventory.updateOne(
              { sku },
              { $setOnInsert: { onHand: 30, reserved: 0 } },
              { upsert: true, session },
            );
          }
          changes.push({
            slug: p.slug,
            previousImages: old?.images ?? [],
            primaryImage: images[0],
          });
        }
        await Category.updateOne(
          { _id: category!._id },
          { $set: { image: categoryImage, imagePresentation: 'package' } },
          { session },
        );
      }
      const summary = {
        categories: 4,
        products: 10,
        variants: 30,
        newVariantStock: 30,
        hiddenProducts: hidden.map((p) => p.slug),
        changes,
      };
      await CatalogMigration.create([{ key: mixesMigrationKey, summary }], { session });
      return { applied: true, categories: 4, products: 10, variants: 30 };
    },
    { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
  );
}
