import mongoose from 'mongoose';
import { connectDatabase } from '../db.js';
import { readConfig } from '../config.js';

try {
  await connectDatabase(readConfig().MONGODB_URI, true);
  await mongoose.connection.db!.admin().ping();
  console.log('MongoDB connection verified; transactions supported.');
} catch (error) {
  // Do not print raw driver errors, connection strings, or credentials.
  console.error(
    JSON.stringify({
      message: 'MongoDB connection failed.',
      type: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
