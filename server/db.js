const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/wedding-checkin';

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connected');
    await seedDefaults();
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
}

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role:     { type: String, enum: ['admin', 'scanner'], required: true }
}, { timestamps: true });

const guestSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  phone:         { type: String, default: null },
  table_number:  { type: String, default: null },  // e.g. "Table 5" or "VIP"
  unique_id:     { type: String, unique: true, required: true },
  qr_token:      { type: String, unique: true, required: true },
  status:        { type: String, enum: ['unused', 'used'], default: 'unused' },
  checked_in_at: { type: Date, default: null },
  checked_in_by: { type: String, default: null }
}, { timestamps: true });

const settingsSchema = new mongoose.Schema({
  key:   { type: String, unique: true, required: true },
  value: { type: String, default: '' }
});

// Activity log — every scan attempt is recorded
const activitySchema = new mongoose.Schema({
  action:     { type: String, enum: ['granted', 'used', 'invalid', 'reset'], required: true },
  guest_name: { type: String, default: null },
  guest_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', default: null },
  scanned_by: { type: String, default: null },
  token_used: { type: String, default: null },
  note:       { type: String, default: null }
}, { timestamps: true });

const User     = mongoose.model('User',     userSchema);
const Guest    = mongoose.model('Guest',    guestSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const Activity = mongoose.model('Activity', activitySchema);

async function seedDefaults() {
  const adminExists = await User.findOne({ username: 'admin' });
  if (!adminExists) {
    await User.create({ username: 'admin', password: bcrypt.hashSync('admin123', 10), role: 'admin' });
    console.log('Default admin created: admin / admin123');
  }
  const scannerExists = await User.findOne({ username: 'scanner' });
  if (!scannerExists) {
    await User.create({ username: 'scanner', password: bcrypt.hashSync('scanner123', 10), role: 'scanner' });
    console.log('Default scanner created: scanner / scanner123');
  }
  const eventExists = await Settings.findOne({ key: 'event_name' });
  if (!eventExists) {
    await Settings.create({ key: 'event_name', value: 'Our Wedding' });
  }
}

module.exports = { connectDB, User, Guest, Settings, Activity };
