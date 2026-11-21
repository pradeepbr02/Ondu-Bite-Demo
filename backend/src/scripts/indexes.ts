import mongoose from 'mongoose';
import { Category, Product, Variant } from '../modules/catalog/models.js';
import { Inventory, Reservation, InventoryEvent } from '../modules/inventory/models.js';
import { readConfig } from '../config.js';
import { connectDatabase } from '../db.js';
import { Customer, Session } from '../modules/identity/models.js';
import { Cart } from '../modules/cart/models.js';
import { Address } from '../modules/addresses/models.js';
import { Checkout, Order } from '../modules/checkout/models.js';
import { MediaAsset } from '../modules/media/models.js';
import { AdminAudit, Discount } from '../modules/admin/models.js';

try {
  await connectDatabase(readConfig().MONGODB_URI, true);
  for (const model of [
    Category,
    Product,
    Variant,
    Inventory,
    Reservation,
    InventoryEvent,
    Customer,
    Session,
    Cart,
    Address,
    Checkout,
    Order,
  ])
    await model.createIndexes();
  await MediaAsset.createIndexes();
  await AdminAudit.createIndexes();
  await Discount.createIndexes();
  console.log('Database indexes created.');
} catch {
  console.error('Index creation failed. Check database connectivity and index permissions.');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
