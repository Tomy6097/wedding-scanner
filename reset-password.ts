import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({ username: String, password: String, role: String });
const User = mongoose.model('User', userSchema);

(async () => {
  await mongoose.connect(process.env.MONGO_URI!);
  console.log('Connected');

  const newHash = bcrypt.hashSync('admin123', 10);

  const result = await User.updateMany(
    { username: 'admin' },
    { $set: { password: newHash } }
  );
  console.log(`Updated ${result.modifiedCount} admin user(s) → password: admin123`);

  const scannerHash = bcrypt.hashSync('scanner123', 10);
  const r2 = await User.updateMany(
    { username: 'scanner' },
    { $set: { password: scannerHash } }
  );
  console.log(`Updated ${r2.modifiedCount} scanner user(s) → password: scanner123`);

  await mongoose.disconnect();
  console.log('Done ✓');
})();
