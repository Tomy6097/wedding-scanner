const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const path = require('path');
const { connectDB } = require('./db');

const authRoutes  = require('./routes/auth');
const guestRoutes = require('./routes/guests');

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'wedding-checkin-secret-2024',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api/auth',   authRoutes);
app.use('/api/guests', guestRoutes);

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
