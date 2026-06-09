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
  name:        { type: String, required: true },
  client_name: { type: String, default: null },
  date:        { type: Date, default: null },
  venue:       { type: String, default: null },
  status:      { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
  color:       { type: String, default: '#7c3aed' },
  pin:         { type: String, default: null },
  // Card template (QR card)
  card_image:       { type: String, default: null },
  card_qr_x:        { type: Number, default: null },
  card_qr_y:        { type: Number, default: null },
  card_qr_size:     { type: Number, default: 20 },
  // Invitation card template
  invite_image:     { type: String, default: null },
  invite_name_x:    { type: Number, default: null },
  invite_name_y:    { type: Number, default: null },
  invite_name_size: { type: Number, default: 5 },
  invite_name_color:{ type: String, default: '#000000' },
  // Thank you card template
  thanks_image:     { type: String, default: null },
  thanks_name_x:    { type: Number, default: null },
  thanks_name_y:    { type: Number, default: null },
  thanks_name_size: { type: Number, default: 5 },
  thanks_name_color:{ type: String, default: '#000000' }
}, { timestamps: true });

// ── Guests ────────────────────────────────────────────────────
const guestSchema = new mongoose.Schema({
  event_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  name:          { type: String, required: true },
  phone:         { type: String, default: null },
  table_number:  { type: String, default: null },
  unique_id:     { type: String, unique: true, required: true },
  qr_token:      { type: String, unique: true, required: true },
  ticket_type:   { type: String, enum: ['S', 'D'], default: 'S' },
  scan_count:    { type: Number, default: 0 },
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

// ── Bookings ──────────────────────────────────────────────────
const bookingSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  phone:      { type: String, required: true },
  event_date: { type: String, default: null },
  package:    { type: String, default: null },
  message:    { type: String, default: null },
  status:     { type: String, enum: ['new', 'contacted', 'confirmed', 'cancelled'], default: 'new' },
  notes:      { type: String, default: null }   // admin internal notes
}, { timestamps: true });

const User     = mongoose.model('User',     userSchema);
const Event    = mongoose.model('Event',    eventSchema);
const Guest    = mongoose.model('Guest',    guestSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const Activity = mongoose.model('Activity', activitySchema);
const Booking  = mongoose.model('Booking',  bookingSchema);

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

module.exports = { connectDB, User, Event, Guest, Settings, Activity, Booking };
