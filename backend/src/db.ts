import mongoose from 'mongoose';

export async function connectDatabase(uri: string, production = false) {
  await mongoose.connect(uri, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 5000,
    autoIndex: !production,
  });
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    await mongoose.disconnect();
    throw new Error('MongoDB must be a replica set or sharded cluster for inventory transactions.');
  }
  // Model initialization must be allowed to wait for the initial connection.
  // Disabling buffering at module import time races autoCreate before db exists.
  mongoose.set('bufferCommands', false);
}
