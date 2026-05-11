const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

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

// ── Users ─────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role:     { type: String, enum: ['admin', 'scanner'], required: true }
}, { timestamps: true });

// ── Events ────────────────────────────────────────────────────
const eventSchema = new mongoose.Schema({
  name:        { type: String, required: true },       // e.g. "John & Jane Wedding"
  client_name: { type: String, default: null },        // e.g. "John Smith"
  date:        { type: Date, default: null },
  venue:       { type: String, default: null },
  status:      { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
  color:       { type: String, default: '#7c3aed' },   // accent color for the event
  pin:         { type: String, default: null }          // 4-digit PIN for scanner access
}, { timestamps: true });

// ── Guests ────────────────────────────────────────────────────
const guestSchema = new mongoose.Schema({
  event_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  name:          { type: String, required: true },
  phone:         { type: String, default: null },
  table_number:  { type: String, default: null },
  unique_id:     { type: String, unique: true, required: true },
  qr_token:      { type: String, unique: true, required: true },
  status:        { type: String, enum: ['unused', 'used'], default: 'unused' },
  checked_in_at: { type: Date, default: null },
  checked_in_by: { type: String, default: null },
  sms_sent:      { type: Boolean, default: false },
  sms_sent_at:   { type: Date, default: null }
}, { timestamps: true });

// ── Settings ──────────────────────────────────────────────────
const settingsSchema = new mongoose.Schema({
  key:   { type: String, unique: true, required: true },
  value: { type: String, default: '' }
});

// ── Activity Log ──────────────────────────────────────────────
const activitySchema = new mongoose.Schema({
  event_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
  action:     { type: String, enum: ['granted', 'used', 'invalid', 'reset'], required: true },
  guest_name: { type: String, default: null },
  guest_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', default: null },
  scanned_by: { type: String, default: null },
  token_used: { type: String, default: null },
  note:       { type: String, default: null }
}, { timestamps: true });

const User     = mongoose.model('User',     userSchema);
const Event    = mongoose.model('Event',    eventSchema);
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
  // Migrate old guests (no event_id) into a default event
  const orphanGuests = await Guest.countDocuments({ event_id: { $exists: false } });
  if (orphanGuests > 0) {
    let defaultEvent = await Event.findOne({ name: 'Default Event' });
    if (!defaultEvent) {
      defaultEvent = await Event.create({ name: 'Default Event', client_name: 'Migrated' });
    }
    await Guest.updateMany({ event_id: { $exists: false } }, { $set: { event_id: defaultEvent._id } });
    console.log(`Migrated ${orphanGuests} guests to Default Event`);
  }
}

module.exports = { connectDB, User, Event, Guest, Settings, Activity };
