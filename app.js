Object.clone = function (obj) {
    return Object.create(Object.getPrototypeOf(obj), Object.getOwnPropertyNames(obj).reduce(function (memo, name) {
        return (memo[name] = Object.getOwnPropertyDescriptor(obj, name)) && memo;
    }, {}));
}
//noinspection JSUnresolvedVariable

var express = require('express')
    , http = require('http')
    , blogRoutes = require('./routes/blog')
    , path = require('path')
    , fs = require('fs')
    , cookie = require('cookie')
    , passportSocketIo = require("passport.socketio")
    , MemoryStore = express.session.MemoryStore
    , sessionStore = new MemoryStore()
    , q = require('q')
    , blogModels = require('./models/models')
    , passport = require('./auth/local').passport_local;




//set up database models to mongoose
var Blog = blogModels.Blog;
var User = blogModels.User;
var Update = blogModels.Update;

var app = express();
//noinspection JSValidateTypes


app.configure(function () {
    //noinspection JSUnresolvedVariable,JSValidateTypes,MagicNumberJS
    app.set('port', process.env.PORT || 3000);
    //noinspection JSUnresolvedVariable
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    //noinspection JSUnresolvedFunction
    app.use(express.favicon());
    app.use(express.logger('dev'));
    //noinspection JSUnresolvedFunction
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser('secret'));
    //TODO:Config: make secrete changable in config
    app.use(express.session({store: sessionStore, secret: 'secret', key: 'express.sid'}));
    // Initialize Passport! Also use passport.session() middleware, to support
    // persistent login sessions (recommended).
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(app.router);
    app.use(require('less-middleware')({ src: __dirname + '/public' }));
    app.use(express.static(path.join(__dirname, 'public')));
});




//TODO:config: This will be the intial admin user
(function checkForAdmin() {
    var defaultAdminName = 'administrator';
    var usertype = "superuser";
    ('Checking for initial admin user');
    User.count({username: defaultAdminName,admin:usertype}, function (err, count) {
        if (count < 1) {
            ('did not find admin user ... creating...');
            var user = new User({username: defaultAdminName, password: defaultAdminName,admin:usertype}).
                save(function (err) {
                    if (err) {
                        console.log(err);
                        ('error creating initial admin user admin');
                    } else {
                        ('inital admin user created username is '+defaultAdminName+'  password is '+defaultAdminName+'. \n ' +
                            'please change password for username '+defaultAdminName+' a.s.a.p.');
                    }
                });
        }
    });
})();

app.configure('development', function () {
    app.use(express.errorHandler());
});

//Blog Routes
app.get('/blog', blogRoutes.allBlogs);

app.get('/blog/:id', blogRoutes.getABlog);

app.post('/blog', passport.ensureAuthenticated, blogRoutes.createBlog);
//edit
app.post('/blog/:id', passport.ensureAuthenticated, blogRoutes.updateBlog);

app.delete('/blog/:id', passport.ensureAuthenticated, blogRoutes.deleteBlog);

//Auth Routes

app.get('/checkauthed', passport.ensureAuthenticated, function (req, res) {
    User.find({_id:req.session.passport.user},function(err,user){
        if(err)console.log(err);
        console.log(user[0].username);
        //noinspection MagicNumberJS
        return res.send(user[0].username, 200);
    })
});


//Update docs routes

app.get('/lastUpdateSame', function (req, res) {
    Update.findOne({}).lean().exec(function (err, update) {
        var returnResult = [];
        if (err)(err);
        if (update == null) {
            var updateCreate = new Update();
            updateCreate.save(function (err, newUpdate) {
                if (err)console.log(err);
                returnResult.push(newUpdate);
                res.end(JSON.stringify(returnResult));
            });
        } else {
            returnResult.push(update);
            res.end(JSON.stringify(returnResult));
        }
    })
});

app.get('/lastUpdateSame/:date', function (req, res) {
    var dateFromClient = req.params.date;
    var response = [];

    Update.findOne({}, function (err, update) {
        var obj = {};
        if (update == null) {
            obj.result = "false";
        } else {
            if (dateFromClient == update.lastUpdate.getTime()) {
                obj.result = "false";
            } else {
                obj.lastUpdate = update.lastUpdate;
                obj.result = "true";
            }
        }
        response.push(obj);
        return res.end(JSON.stringify(response));
    });

});

//Logging in and Registration routes

app.post('/logout', function (req, res) {
    req.logout();
    //noinspection MagicNumberJS
    res.send('loggedout', 410);
});

app.post('/login',
    passport.authenticate('local'),
    function (req, res) {
        res.send('authed', 200);
    });
//for admin side
app.post('/auth/login', function (req, res) {
    User.findOne({'username': req.body.username, 'password': req.body.password,admin:{$in:['superuser','admin']}}, function (err, administrator) {
        if (err)console.log(err);
        if (administrator) {
            req.session.loggedIn = true;
        } else {
            req.session.loggedIn = false;
        }

        return res.send(200);
    });

});


app.get('username',passport.ensureAuthenticated,function(req,res){
    req.send(req.session.username,200);
});

app.post('/register', function (req, res) {
    var userCount = 0,
        adminCount = 0,
        username = req.body.username,
        password = req.body.password,
        minUsernameLength = 5,
        maxUsernameLength = 16,
        minPasswordLength = 5,
        maxPasswordLength = 16;

    User.count({username: username}, function (err, count) {
        if (err)console.log(err);
        userCount = count;
        //then get admin count
        User.count({username: username,admin :{$in:['superuser','admin']}} , function (err, count) {
            if (err)console.log(err);
            adminCount = count;
            //then check count
            //TODO:redo this section of code in promises
            //username checks
            if (userCount < 1 && adminCount < 1 && username != undefined && username != "" && username.length > minUsernameLength && username.length < maxUsernameLength &&
                //password checks
                password != undefined && password.length > minPasswordLength && password.length < maxPasswordLength && password != username) {
                var user = new User(req.body);
                user.save(function (err) {
                    if (err)console.log(err);
                });
                return res.end(JSON.stringify({'success': 'true'}));
            } else {
                var errorMessage = "";
                if (password == undefined) {
                    password = "";
                }
                if (username == undefined || username == "") {
                    errorMessage = 'Please enter a username';
                } else if (username.length < minUsernameLength) {
                    errorMessage = 'Username must be longer than ' + minUsernameLength;
                } else if (username.length > maxUsernameLength) {
                    errorMessage = 'Username must be shorter than ' + maxUsernameLength;
                } else if (password.length < minPasswordLength) {
                    errorMessage = 'Password must be longer than ' + minPasswordLength;
                } else if (password.length > maxPasswordLength) {
                    errorMessage = 'Password must be shorter than ' + maxPasswordLength;
                } else if (password == username) {
                    errorMessage = 'Password can not be the same as username';
                }
                if (userCount >= 1 || adminCount >= 1) {
                    errorMessage = 'username already taken';
                }
                if (errorMessage == "") {
                    errorMessage = 'unknown error';
                }
                return res.end(JSON.stringify({'fail': errorMessage}));
            }
        });
    });


});


//comment system routes

app.post('/addBlogPost', passport.ensureAuthenticated, function (req, res) {
    var newBlogEntry = new Blog(req.body);
    newBlogEntry.save(function (err) {
        if (err)console.log(err);
    });
    return res.end(JSON.stringify({'success': 'true'}));
});

app.post('/comments', passport.ensureAuthenticated, function (req) {
    Blog.findOne({_id: req.body.id}, function (err, blog) {
        blog.comments.unshift({body: req.body.body, date: Date.now()});
        blog.save(function (err, blog) {
            if (err)console.log(err);
            var update = new Update();
            update.save(function(err,update){if(err)console.log(err);});
        })
    })
});

//file handler routes

app.post('/upload', passport.ensureAuthenticated, function (req, res) {
    var name = req.files.userPhoto.name;
    fs.readFile(req.files.userPhoto.path, function (err, data) {
        var newPath = __dirname + "/public/uploads/" + name;
        fs.writeFile(newPath, data, function (err) {
            res.redirect("back");
        });
    });
});



var server = http.createServer(app).listen(app.get('port'), function () {
    console.log("server listening " + app.get('port'));
});
var io = require('socket.io').listen(server);

//************SOCKET.IO**************************//

io.configure(function () {
    io.set("authorization", passportSocketIo.authorize({
        key: 'express.sid',       //the cookie where express (or connect) stores its session id.
        secret: 'secret', //the session secret to parse the cookie
        store: sessionStore,     //the session store that express uses
        fail: function (data, accept) {
            accept(null, false);             // second param takes boolean on whether or not to allow handshake
        },
        success: function (data, accept) {
            accept(null, true);
        }
    }));
});
var connectedusers = [];

io.sockets.on('connection', function (socket) {
    socket.emit('connected', {conn: 'true'});
    socket.on('loggedin', function () {
        ('logged in ');
        socket.emit('login');
    });
    socket.on('subscribe', function (data) {
        ('subscribed');

        socket.handshake.room = data.room;
        var duplicateUserForRoom = false;
        var usersForThisRoom = [];
        for (var a = 0; a < connectedusers.length; a++) {
            if (connectedusers[a].id == socket.handshake.user[0]._id && connectedusers[a].room == data.room) {
            }
            if (connectedusers[a].room == data.room) {
                usersForThisRoom.push(connectedusers[a]);
            }
        }
        var clients = io.sockets.clients(data.room);
        for (var i = 0; i < clients.length; i++) {
            console.log("================================================================next client loading....");
        }
        if (duplicateUserForRoom == false) {
            socket.join(data.room);
            connectedusers.push({room: data.room, id: socket.handshake.user[0]._id, username: socket.handshake.user[0].username});

            usersForThisRoom.push({room: data.room, id: socket.handshake.user[0]._id, username: socket.handshake.user[0].username});


            socket.emit('initialuserlist', usersForThisRoom);
            socket.broadcast.in(data.room).emit('updateusers', usersForThisRoom);
        }


    });
    socket.on('sentcomment', function (data) {
        socket.broadcast.in(data.room).emit('commentsupdated', '', "updateNow");
    });
    socket.on('unsubscribe', function (data) {
        console.log('unsubscribe');
        socket.leave(data.room);
        var usersForThisRoom = [];
        var buffer = connectedusers;
        for (var a = 0; a < connectedusers.length; a++) {
            if (connectedusers[a].id == socket.handshake.user[0]._id) {
                buffer.splice(a, 1);
            }
            if (connectedusers[a] != undefined && connectedusers[a].room == data.room) {
                usersForThisRoom.push(connectedusers[a]);
            }
        }
        connectedusers = buffer;
        (io.sockets.manager.rooms);
        var clients = io.sockets.clients(data.room);
        for (var i = 0; i < clients.length; i++) {
            console.log("================================================================next client loading....");
        }
        socket.broadcast.to(data.room).emit('updateusers', usersForThisRoom);
    });
    socket.on('disconnect', function () {
        socket.leave(socket.room);
        var usersForThisRoom = [];
        console.log('disconnect');
        var buffer = connectedusers;
        for (var i = 0; i < connectedusers.length; i++) {
            if (connectedusers[i].id == socket.handshake.user[0]._id) {
                buffer.splice(i, 1);
            }
            if (connectedusers[i] != undefined && connectedusers[i].room == socket.room) {
                usersForThisRoom.push(connectedusers[i]);
            }
        }
        connectedusers = buffer;
        console.log(socket.handshake.user[0].username);
        socket.broadcast.to(socket.room).emit('updateusers', usersForThisRoom);
    });
});
