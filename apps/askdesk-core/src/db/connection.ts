import mongoose from 'mongoose';

export async function connectDb(uri: string): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true
    });
    return conn;
  } catch (error) {
    throw new Error(
      `[askdesk-core] Failed to connect to MongoDB at ${uri}: ${(error as Error).message}`
    );
  }
}

export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
