var express = require('express');
var path = require('path');
var sqlite3 = require('sqlite3').verbose();
var bcrypt = require('bcryptjs');
var jwt = require('jsonwebtoken');
var fs = require('fs');

var app = express();
var PORT = process.env.PORT || 3000;
var JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// ensure data directory
var dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// open sqlite database
var dbFile = path.join(dataDir, 'app.db');
var db = new sqlite3.Database(dbFile);

// initialize tables
db.serialize(function() {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT,
    description TEXT,
    date TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id)
    )`);
});

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// JWT verification middleware
function verifyToken(req, res, next) {
  var token = req.cookies ? req.cookies.token : null;
  if (!token) {
    return res.redirect('/login');
  }
  try {
    var decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.redirect('/login');
  }
}

// Simple cookie parsing (for JWT in cookie)
app.use(function(req, res, next) {
  var cookies = {};
  if (req.headers.cookie) {
    req.headers.cookie.split('; ').forEach(function(cookie) {
      var parts = cookie.split('=');
      cookies[parts[0]] = parts[1];
    });
  }
  req.cookies = cookies;
  
  // Check if user is authenticated
  if (req.cookies.token) {
    try {
      var decoded = jwt.verify(req.cookies.token, JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      // Token expired or invalid
    }
  }
  
  next();
});

// Redirect authenticated users away from login/register
app.use(function(req, res, next) {
  if (req.user && (req.path === '/login' || req.path === '/register')) {
    return res.redirect('/dashboard');
  }
  next();
});

// Register handler
app.post('/register', function (req, res) {
    var name = req.body.name || '';
    var email = req.body.email || '';
    var password = req.body.password || '';

    if (!email || !password) {
        return res.status(400).send('Email and password required');
    }

    var hashed = bcrypt.hashSync(password, 10);

    var stmt = db.prepare('INSERT INTO users (name, email, password) VALUES (?,?,?)');
    stmt.run(name, email, hashed, function (err) {
        if (err) {
            if (err.message && err.message.indexOf('UNIQUE') !== -1) {
                return res.status(409).send('User already exists');
            }
            console.error(err);
            return res.status(500).send('Internal server error');
        }

        // simple redirect to login page after registration
        res.redirect('/login');
    });
    stmt.finalize();
});

// Login handler
app.post('/login', function (req, res) {
    var email = req.body.email || '';
    var password = req.body.password || '';

    if (!email || !password) {
        return res.status(400).send('Email and password required');
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], function (err, row) {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal server error');
        }
        if (!row) return res.status(401).send('Invalid credentials');

        var ok = bcrypt.compareSync(password, row.password);
        if (!ok) return res.status(401).send('Invalid credentials');

        // create JWT token
        var token = jwt.sign({ id: row.id, email: row.email, name: row.name }, JWT_SECRET, { expiresIn: '24h' });
        
        // set cookie with token
        res.setHeader('Set-Cookie', `token=${token}; Path=/; HttpOnly; Max-Age=86400`);
        
        // redirect to dashboard
        return res.redirect('/dashboard');
    });
});

// Dashboard (protected route)
app.get('/dashboard', verifyToken, function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'dashboard', 'index.html'));
});

// API endpoint to get current user
app.get('/api/me', verifyToken, function (req, res) {
  res.json({ user: req.user });
});

// Logout
app.get('/logout', function (req, res) {
  res.setHeader('Set-Cookie', 'token=; Path=/; Max-Age=0');
  res.redirect('/');
});

// Transaction API endpoints
// GET all transactions for user
app.get('/api/transactions', verifyToken, function (req, res) {
  db.all('SELECT * FROM transactions WHERE userId = ? ORDER BY date DESC, createdAt DESC', [req.user.id], function (err, rows) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to fetch transactions' });
    }
    res.json({ transactions: rows || [] });
  });
});

// POST new transaction
app.post('/api/transactions', verifyToken, function (req, res) {
  var type = req.body.type || '';
  var amount = parseFloat(req.body.amount) || 0;
  var category = req.body.category || '';
  var description = req.body.description || '';
  var date = req.body.date || new Date().toISOString().split('T')[0];

  if (!type || !amount) {
    return res.status(400).json({ error: 'Type and amount required' });
  }

  var stmt = db.prepare('INSERT INTO transactions (userId, type, amount, category, description, date) VALUES (?,?,?,?,?,?)');
  stmt.run(req.user.id, type, amount, category, description, date, function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to add transaction' });
    }
    res.json({ success: true, id: this.lastID });
  });
  stmt.finalize();
});

// PUT update transaction
app.put('/api/transactions/:id', verifyToken, function (req, res) {
  var id = req.params.id;
  var type = req.body.type;
  var amount = parseFloat(req.body.amount);
  var category = req.body.category;
  var description = req.body.description;
  var date = req.body.date;

  var stmt = db.prepare('UPDATE transactions SET type=?, amount=?, category=?, description=?, date=? WHERE id=? AND userId=?');
  stmt.run(type, amount, category, description, date, id, req.user.id, function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to update transaction' });
    }
    res.json({ success: true });
  });
  stmt.finalize();
});

// DELETE transaction
app.delete('/api/transactions/:id', verifyToken, function (req, res) {
  var id = req.params.id;

  var stmt = db.prepare('DELETE FROM transactions WHERE id=? AND userId=?');
  stmt.run(id, req.user.id, function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to delete transaction' });
    }
    res.json({ success: true });
  });
  stmt.finalize();
});

app.listen(PORT, function() {
    console.log(`Server is running on http://localhost:${PORT}`);
});