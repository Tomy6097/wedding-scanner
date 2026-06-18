require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const path = require('path');
const { connectDB } = require('./db');

const authRoutes      = require('./routes/auth');
const guestRoutes     = require('./routes/guests');
const settingsRoutes  = require('./routes/settings');
const activityRoutes  = require('./routes/activity');
const userRoutes      = require('./routes/users');
const eventRoutes     = require('./routes/events');
const dashboardRoutes = require('./routes/dashboard');
const bookingRoutes   = require('./routes/bookings');
const { router: whatsappRoutes } = require('./routes/whatsapp');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/wedding-checkin';
const PORT      = process.env.PORT || 3000;

app.set('io', io);
app.set('trust proxy', 1);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'wedding-checkin-secret-2024',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000  // 24 hours (was 8)
  }
}));

app.use(express.static(path.join(__dirname, '..', 'public')));

// Landing page
app.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'landing.html'));
});

// ── Keep-alive ping endpoint (prevents Render free tier sleep) ──
app.get('/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth',       authRoutes);
app.use('/api/guests',    guestRoutes);
app.use('/api/settings',  settingsRoutes);
app.use('/api/activity',  activityRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/events',    eventRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/bookings',  bookingRoutes);
app.use('/api/whatsapp',  whatsappRoutes);

// ── Public guest page route ──────────────────────────────────
// Serves the SPA for /guest/:token — frontend handles the display
app.get('/guest/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'guest.html'));
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🎊 Wedding Check-in System running at http://localhost:${PORT}`);
    console.log('   Admin login:   admin / admin123');
    console.log('   Scanner login: scanner / scanner123\n');
  });
});
