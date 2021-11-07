require('dotenv').config();

const express = require('express');
const socket = require('socket.io');
const app = express();
const bodyParser = require('body-parser');
const flash = require('express-flash');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const passport = require('passport');
const session = require('express-session');
const uuid = require('uuid');
const bcrypt = require('bcrypt');
const UserService = require('./src/user');

require('./src/config/passport');
require('./src/config/local');

const mongodbUri = process.env.MONGO_URI;

mongoose.connect(
  mongodbUri,
  {
    useUnifiedTopology: true,
    useNewUrlParser: true,
    useFindAndModify: false,
    useCreateIndex: true,
  },
  (error) => {
    if (error) console.log(error);
  }
);

var db = mongoose.connection;
db.on('connected', () =>
  console.log('Local instance of MongoDB connected successfully')
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));

app.use(cookieParser());
app.use(
  session({
    secret: 'secr3t',
    resave: false,
    saveUninitialized: true,
  })
);

app.use(flash());

app.use(passport.initialize());
app.use(passport.session());

const isLoggedIn = (req, res, next) => {
  req.user ? next() : res.sendStatus(401);
};

app.get('/', (req, res) => {
  res.render('local/signin.ejs');
});

app.get('/health', (req, res) => {
  const data = {
    uptime: process.uptime(),
    message: 'Server running',
    date: new Date(),
  };
  res.status(200).send(data);
});

app.get('/local/signup', (req, res) => {
  res.render('local/signup.ejs');
});

app.get('/local/signin', (req, res) => {
  res.render('local/signin.ejs');
});

app.post(
  '/auth/local/signin',
  passport.authenticate('local', {
    successRedirect: '/main',
    failureRedirect: '/local/signin',
    failureFlash: true,
  })
);

app.get('/main', isLoggedIn, (req, res) => {
  res.render('main.ejs', { user: req.user });
});

app.get('/auth/logout', (req, res) => {
  req.flash('success', 'Successfully logged out');
  req.session.destroy(function () {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

app.post('/auth/local/signup', async (req, res) => {
  const { first_name, last_name, email, password } = req.body;

  if (password.length < 8) {
    req.flash(
      'error',
      'Account not created. Password must be 7+ characters long'
    );
    return res.redirect('/local/signup');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await UserService.addLocalUser({
      id: uuid.v4(),
      email,
      firstName: first_name,
      lastName: last_name,
      password: hashedPassword,
    });
  } catch (e) {
    req.flash(
      'error',
      'Error creating a new account. Try a different login method.'
    );
    res.redirect('/local/signup');
  }

  res.redirect('/local/signin');
});

app.post(
  '/auth/local/signin',
  passport.authenticate('local', {
    successRedirect: '/main',
    failureRedirect: '/local/signin',
    failureFlash: true,
  })
);

var port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  console.log(`Chat Bot listening on port ${port}`);
});

const io = socket(server);

io.on('connection', (socket) => {
  socket.on('joining msg', (username) => {
    console.log('New user connected');
    io.emit('chat message', `${username} joined the chat`);
  });

  socket.on('disconnect', (username) => {
    console.log('user disconnected');
    io.emit('chat message', `${username} left the chat`);
  });

  socket.on('chat message', (msg) => {
    if (msg.author != undefined && msg.message != undefined) {
      var botMsg = `Hey ${msg.author}, you said '${msg.message}', right?`;
      var botJson = { author: 'ottonova bot', message: botMsg };
    } else if (msg.type == 'date') {
      var date = new Date(msg.data);
      weekDays = [];
      for (i = 0; i < 7; i++) {
        let day = date.getDay();

        if (day != 6 && day != 0)
          weekDays.push(date.toLocaleDateString('en-US', { weekday: 'long' }));

        date.setDate(date.getDate() + 1);
      }
      var botJson = { author: 'ottonova bot', days: weekDays };
    } else if (msg.type == 'map') {
      var botJson = {
        author: 'ottonova bot',
        latitude: msg.data.lat,
        longitude: msg.data.lng,
      };
    } else if (msg.type == 'rate') {
      var botJson = {
        author: 'ottonova bot',
        lowerLimit: msg.data[0],
        upperLimit: msg.data[1],
      };
    } else if (msg.type == 'complete') {
      var botJson = {
        author: 'ottonova bot',
        data: [msg.data[0], msg.data[1]],
      };
    }
    io.emit('chat message', botJson);
  });
});
