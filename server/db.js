const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// When running inside Electron, DATA_DIR is set to the user's app data folder.
// On Render.com, the persistent disk is mounted at /data.
// Otherwise use local ./data folder.
const dataDir = process.env.DATA_DIR ||
                (process.env.NODE_ENV === 'production' ? '/data' : path.join(__dirname, '..', 'data'));
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const adapter = new FileSync(path.join(dataDir, 'wedding.json'));
const db = low(adapter);

// Set defaults
db.defaults({
  users: [],
  guests: []
}).write();

// Seed default admin
if (!db.get('users').find({ username: 'admin' }).value()) {
  db.get('users').push({
    id: 1,
    username: 'admin',
    password: bcrypt.hashSync('admin123', 10),
    role: 'admin'
  }).write();
  console.log('Default admin created: admin / admin123');
}

// Seed default scanner
if (!db.get('users').find({ username: 'scanner' }).value()) {
  db.get('users').push({
    id: 2,
    username: 'scanner',
    password: bcrypt.hashSync('scanner123', 10),
    role: 'scanner'
  }).write();
  console.log('Default scanner created: scanner / scanner123');
}

module.exports = db;
