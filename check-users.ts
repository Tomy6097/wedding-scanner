import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGO_URI = process.env.MONGO_URI!;

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  role: String,
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

(async () => {
  await mongoose.connect(MONGO_URI);
  console.log('Connected');

  const users = await User.find({}, { username: 1, role: 1, password: 1 });
  console.log(`\nFound ${users.length} user(s):`);

  for (const u of users) {
    const tryPasswords = ['admin123', 'scanner123', 'Admin@1234', 'admin', 'password123'];
    let matched = 'unknown';
    for (const p of tryPasswords) {
      if (bcrypt.compareSync(p, u.password as string)) { matched = p; break; }
    }
    console.log(`  ${u.username} (${u.role}) — password: ${matched}`);
  }

  await mongoose.disconnect();
})();
