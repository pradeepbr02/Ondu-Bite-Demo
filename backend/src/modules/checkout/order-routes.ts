import { Router } from 'express';
import { z } from 'zod';
import { requireCustomer } from '../identity/auth.js';
import { Order } from './models.js';
import { getActiveCheckout, getCheckout, orderDto } from './service.js';
import { AppError } from '../../shared/errors.js';

export const orderRouter = Router();
orderRouter.use(requireCustomer);
orderRouter.get('/', async (req, res) => {
  const { page, limit } = z
    .object({
      page: z.coerce.number().int().min(1).max(1000).default(1),
      limit: z.coerce.number().int().min(1).max(20).default(10),
    })
    .strict()
    .parse(req.query);
  await getActiveCheckout(res.locals.customer.id);
  const filter = { customerId: res.locals.customer.id };
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  res.json({
    data: orders.map(orderDto),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});
orderRouter.get('/:id', async (req, res) => {
  const orderId = z.string().uuid().parse(req.params.id);
  const order = await Order.findOne({ customerId: res.locals.customer.id, orderId }).lean();
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  const checkout = await getCheckout(res.locals.customer.id, order.checkoutId);
  res.json({ data: checkout.order });
});
