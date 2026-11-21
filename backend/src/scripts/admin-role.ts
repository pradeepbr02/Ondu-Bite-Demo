import mongoose from 'mongoose';
import { z } from 'zod';
import { readConfig } from '../config.js';
import { connectDatabase } from '../db.js';
import { Customer, Session } from '../modules/identity/models.js';
import { AdminAudit } from '../modules/admin/models.js';

try {
  const email = z.email().parse(process.argv[2]?.trim().toLowerCase());
  const role = z.enum(['admin', 'customer']).parse(process.argv[3] ?? 'admin');
  await connectDatabase(readConfig().MONGODB_URI);
  await mongoose.connection.transaction(async (session) => {
    const customer = await Customer.findOneAndUpdate(
      { email, active: true },
      { $set: { role } },
      { session, returnDocument: 'after' },
    );
    if (!customer) throw new Error('Register an account with this email first.');
    await Session.deleteMany({ customerId: customer._id }).session(session);
    await AdminAudit.create(
      [
        {
          actorId: customer._id,
          action: 'ROLE_CHANGED_BY_CLI',
          target: customer.id,
          details: { role },
        },
      ],
      { session },
    );
  });
  console.log(`Role set to ${role}. Sign in again; previous sessions were revoked.`);
} catch {
  console.error(
    'Role change failed. Usage: npm run admin:role -- registered-email admin|customer. Check the account and database configuration.',
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
