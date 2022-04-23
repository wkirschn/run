var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
// Import Mongoose into the project after installing it
const mongoose = require('mongoose');



const bodyparser = require('body-parser')
const crypto = require('crypto');
const multer = require('multer');
const {GridFsStorage} = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');
const methodOverride = require('method-override')











// Create router objects
var indexRouter = require('./routes/index');
var projectsRouter = require('./routes/projects');
var coursesRouter = require('./routes/courses');
var reyclingRouter = require('./routes/recycling')

// Import passport modules
const passport = require('passport');
const session = require('express-session');
const githubStrategy = require('passport-github2').Strategy;

// Import globals file
const config = require('./config/globals');

var app = express();




// Middleware for Multer

app.use(bodyparser.json())
app.use(methodOverride('_method'))













// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Configure passport module https://www.npmjs.com/package/express-session
// secret is a salt value used for hashing
// save forces the session to be saved back to the session store 
// even if it's never modified during the request
app.use(session({
  secret: 's2021pr0j3ctTracker',
  resave: false,
  saveUninitialized: false
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Link passport to the user model
const User = require('./models/user');
passport.use(User.createStrategy());

// Configure passport-github2 with the API keys and user model
// We need to handle two scenarios: new user, or returning user
passport.use(new githubStrategy({
  clientID: config.github.clientId,
  clientSecret: config.github.clientSecret,
  callbackURL: config.github.callbackUrl
},
  // create async callback function
  // profile is github profile
  async (accessToken, refreshToken, profile, done) => {
    // search user by ID
    const user = await User.findOne({ oauthId: profile.id });
    // user exists (returning user)
    if (user) {
      // no need to do anything else
      return done(null, user);
    }
    else {
      // new user so register them in the db
      const newUser = new User({
        username: profile.username,
        oauthId: profile.id,
        oauthProvider: 'Github',
        created: Date.now()
      });
      // add to DB
      const savedUser = await newUser.save();
      // return
      return done(null, savedUser);
    }
  }
));

// Set passport to write/read user data to/from session object
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Register router objects
app.use('/', indexRouter);
app.use('/projects', projectsRouter);
app.use('/courses', coursesRouter);
app.use('/Recycling', reyclingRouter);



// MongoDB Connection

 let connectionString = config.db;


 // Init gfs


const conn = mongoose.createConnection(connectionString);
let gfs;
conn.once('open', function() {
  gfs = Grid(conn.db, mongoose.mongo);
  gfs.collection('uploads');
})


// Storage Engine

const storage = new GridFsStorage({
    url: connectionString,
    file: (req, file) => {
        return new Promise((resolve, reject) => {
            crypto.randomBytes(16, (err, buf) => {
                if (err) {
                    return reject(err);
                }
                const filename = buf.toString('hex') + path.extname(file.originalname);
                const fileInfo = {
                    filename: filename,
                    bucketName: 'uploads'
                };
                resolve(fileInfo);
            });
        });
    }
});
const upload = multer({ storage });




// Use the connect method, and the two handlers to try to connect to the DB
mongoose.connect(connectionString, { useNewUrlParser: true, useUnifiedTopology: true })
  .then((message) => {
    console.log('Connected successfully!');
    gfs = Grid(this.db, mongoose.mongo);
    gfs.collection('uploads');
  })
  .catch((error) => {
    console.log(`Error while connecting! ${error}`);
  });

// HBS Helper Method to select values from dropdown lists
const hbs = require('hbs');
const e = require('express');
const Course = require("./models/course");
const Recycle = require("./models/recycling");
// function name and helper function with parameters
hbs.registerHelper('createOption', (currentValue, selectedValue) => {
  // initialize selected property
  var selectedProperty = '';
  // if values are equal set selectedProperty accordingly
  if (currentValue == selectedValue) {
    selectedProperty = 'selected';
  }
  // return html code for this option element
  // return new hbs.SafeString('<option '+ selectedProperty +'>' + currentValue + '</option>');
  return new hbs.SafeString(`<option ${selectedProperty}>${currentValue}</option>`);
});

// helper function to format date values
hbs.registerHelper('toShortDate', (longDateValue) => {
  return new hbs.SafeString(longDateValue.toLocaleDateString('en-CA'));
});

// app.get('/upload', (req, res) => {
//
//     gfs.files.find().toArray((err, files) => {
//
//         if(!files || files.length === 0) {
//            res.render('index', {files: false});
//             }
//         else {
//                 // Files exist
//
//             files.map(file => {
//                 if(file.contentType === 'image/jpeg' || file.contentType === 'image/png') {
//                     file.isImage = true;
//                 }
//                 else {
//                     file.isImage = false;
//                 }
//             });
//             res.render('upload', {files: files});
//
//             }
//
//
//
// })});
//
// app.post('/upload', upload.single('file'), (req,res) => {
//     res.json({file: req.file, fileName: req.file.filename});
//
// })
// add reusable middleware function to inject it in our handlers below that need authorization
function IsLoggedIn(req,res,next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}


app.get('/recycling/add', IsLoggedIn, (req, res) => {

    Course.find((err, courses) => {
        if (err) {
            console.log(err);
        }
        else {
            res.render('recycling/add', { title: 'Add a New recycling', courses: courses, user: req.user });
        }
    }).sort({ name: -1 });

    gfs.files.find().toArray((err, files) => {



            files.map(file => {
                if(file.contentType === 'image/jpeg' || file.contentType === 'image/png') {
                    file.isImage = true;
                }
                else {
                    file.isImage = false;
                }
            });
            res.render('recycling/add', {files: files});



    })});

// Add POST handler
app.post('/recycling/add', IsLoggedIn,  upload.single('file'), (req, res, next) => {
    // use the project module to save data to DB
    // call create method of the model
    // and map the fields with data from the request
    // callback function will return an error if any or a newProject object

    app.post('/recycling/add', upload.single('file'), (req, res) =>
    {

    })


    Recycle.create({
        objectName: req.body.objectName,
        objectDescription: req.body.objectDescription,
        objectEcoScore: req.body.objectEcoScore,
        objectDisposalMethod: req.body.objectDisposalMethod,
        objectLong: req.body.objectLong,
        objectLat: req.body.objectLat,
        profile_id: req.body.profile_id,
        // file: upload.single('file')
        file: req.file.filename
    }, (err, recyclingObject) => {
        if (err) {
            console.log(err);
        }
        else {
            // We can show a successful message by redirecting them to index

            app.post('/recycling/add', upload.single('file'), (req, res) =>
            {
               /* res.json({file: req.file, fileName: req.file.filename});*/
            })
            res.redirect('/recycling');


        }
    });
});





app.post('/upload', upload.single('file'),  (req,res) => {
    res.json({file: req.file, fileName: req.file.filename});

})







app.get('/files/:filename', (req, res) => {
    gfs.files.findOne({filename: req.params.filename}, (err, file) => {


        //Check for files

        if(!file || file.length === 0) {
            return res.status(404).json({
                err: 'No files exist'
            });
        }

        // Files exist
        return res.json(file);
    })
});

app.get('/image/:filename', (req, res) => {
    gfs.files.findOne({filename: req.params.filename}, (err, file) => {


        //Check for files

        if(!file || file.length === 0) {
            return res.status(404).json({
                err: 'No files exist'
            });
        }

        // Check if image is content type
        if(file.contentType === 'image/jpeg' || file.contentType === 'img/png') {
            // Read output to browser
            const readstream = gfs.createReadStream(file.filename);
            readstream.pipe(res);
        } else {
         res.status(404).json({
             err: 'Not an image'
         });
        }

    })
});



// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
