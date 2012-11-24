/*jshint es5:true, laxcomma:true */
var io = require('socket.io'),
    express = require('express'),
    basicAuth = require('connect-basic-auth'),
    http = require('http'),
    https = require('https'),
    fs = require('fs'),
    url = require('url');

var ClientManager = require('./manager').ClientManager;

// How often and how many times to attempt to notify a client
var repeatNotifyDelay = 5000;
var repeatNotifyMax = 4;
var insecurePort = 8080;
var securePort = 8443;
var username = 'admin', password = '5Xeaj8UX7q2d';

// log file location
var logfile = fs.existsSync('/rewardsden')?
  '/rewardsden/nodeServer.log' : './nodeServer.log';

//Create the logger
var winston = require('winston');
var logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)(),
    new (winston.transports.File)({ filename: logfile })
  ]
});

var app = express();
app.use(basicAuth(function(credentials, req, res, next) {
  if(credentials.username !== username || credentials.password !== password) {
    return next(true);
  }
  return next(false);
}, 'Please authenticate.'));

app.use(function(req, res, next) {
  req.requireAuthorization(req, res, next);
});

app.use(express.static(__dirname + '/public'));

var wsServer;

var secure = fs.existsSync(__dirname + '/ssl/ssl.key');
if(secure) {
  // Load key and certificate for HTTPS
  var options = {
    key: fs.readFileSync(__dirname + '/ssl/ssl.key'),
    cert: fs.readFileSync(__dirname + '/ssl/notifications.crt')
  };

  // HTTPS version
  console.log('Starting secure notifications server on port ' + securePort);

  var secureServer = https.createServer(options, app).listen(securePort);
  wsServer = io.listen(secureServer);
}
else {
  console.log('Starting insecure notifications server on port ' + insecurePort);

  var server = http.createServer(app).listen(insecurePort);
  wsServer = io.listen(server);
}

wsServer.set('log level', 1);

var manager = ClientManager(wsServer);

// TODO: make only ONE socket.io connection conditional on value of `secure`
setInterval(function() {
  var numClients = manager.getNumConnections();
  console.log('Number of clients connected: ' + numClients);

  var numOpenHubs = manager.getConnectionsWithStatus('/hub-open');
  console.log('Number of clients with hub open: ' + numOpenHubs);

  manager.notifyUser('rob', 'notification', {
    type: 'simple',
    message: 'hello world',
  });

}, 5000);


//Run on every connection
var onSocketConnection = function (socket) {
  logger.log('info', 'New Hub Instance: ' + socket.id);

  //Function to store connection info to the clients array
  socket.on('register', function (data) {
    var uid = data.id;

    if(!uid) {
      console.log('Error: no uid provided in register event');
      return socket.disconnect();
    }

    manager.registerUser(socket, uid);
    logger.log('info', 'User ' + uid + ' registered on socket ' + socket.id);
  });

  //Tracking hub open and close
  socket.on('status', function (data) {
    logger.log('info', 'client status changed: ' + JSON.stringify(data.type));

    switch(data.type) {
      case 'hub-open':
      logger.log('info', 'Hub opened by user');
      return manager.addStatus(socket, 'hub-open');

      case 'hub-close':
      logger.log('info', 'Hub closed by user');
      return manager.removeStatus(socket, 'hub-open');

      default:
      logger.log('warning', 'Unknown status from client: ' + JSON.stringify(data.status));
      return;
    }
  });

}; // Close the main connection

wsServer.sockets.on('connection', onSocketConnection);

//Admin Update Sender
function adminStatUpdate(data) { 
  // Get admin connection
  if('admin' in clients) {
    var c = clients.admin;

    var message = {
      activeHubs: Object.keys(sockets).length,  // Number of loaded hubs (connections)
      loggedInHubs: numLoggedInHubs,            // Number of hubs where the user has logged in and opened  the hub
      openHubs: Object.keys(openHubs).length,   // Number of open hubs
      clients: Object.keys(clients).length,     // Number of logged-in users
      connections: Object.keys(sockets).length  // Number of socket connections
    };
    c.socket.emit('rd-adminUpdate', message);
    logger.log('info', "admin message sent");
  }
}

// for API server tech.rewardsden.com
var incomingServer = http.createServer(incomingHandler);
incomingServer.listen(8081);

function incomingHandler (req, res) {
  res.writeHead(200);

  //Trigger notification to user
  var url_parts = url.parse(req.url, true);
  var query = url_parts.query;
  var text        = query.text;
  var points      = query.points;
  var userId      = query.id;
  logger.log('info', 'Request: ' + JSON.stringify(query));
  
  repeatUntil(function() {
    if(userId in clients) {
      var c = clients[userId];
      c.socket.emit('rd-notify',{rdResponseText: text, rdPoints: points});
      logger.log('info', 'Notification went to rUser = '+userId+' Text = '+text+' points = '+points);
      return true;
    }
    logger.log('info', 'client ' + userId + ' not found, retrying in ' + repeatNotifyDelay);
    return false;
  }, repeatNotifyDelay, repeatNotifyMax);

  res.end();
}

/**
 * Calls a given function repeatedly until it returns true or at least max
 * times, with delay ms between invocations.
 */
var repeatUntil = function(callback, delay, maxTimes) {
  if(maxTimes === 0) { return; }

  try {
    if(callback() === true) {
      return;
    }
  } catch(e) {
    console.error(e);
  }

  setTimeout(function() { repeatUntil(callback, delay, maxTimes - 1); }, delay);
};
