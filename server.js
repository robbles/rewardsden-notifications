/*jshint es5:true, laxcomma:true */
var io = require('socket.io'),
    express = require('express'),
    basicAuth = require('connect-basic-auth'),
    winston = require('winston'),
    http = require('http'),
    https = require('https'),
    fs = require('fs'),
    os = require('os'),
    url = require('url');

var ClientManager = require('./manager').ClientManager;

// How often and how many times to attempt to notify a client
var repeatNotifyDelay = 5000;
var repeatNotifyMax = 2;

var insecurePort = 8080;
var securePort = 8443;
var username = 'admin',
    password = '49fTKQQ4HN5mHSqTuQGClE2Ea4OaNXPc1qFrQWC0HumQwOCtqKoCxxtuhM3fTd1Q';

// log file location
var logfile = __dirname + '/notifications.log';

var DEBUG_MODE = ('DEBUG_MODE' in process.env);
var logTransports = [
  new (winston.transports.File)({ filename: logfile, level: 'info' })
];
if(DEBUG_MODE) {
  // Log debug statements to stderr
  logTransports.push(new (winston.transports.Console)({level: 'debug'}));
}

// Create the logger as a global object
logger = new (winston.Logger)({
  levels: (winston.config.syslog.levels),
  transports: logTransports
});
// Only displayed if logging in debug mode
logger.debug('Environment variable DEBUG_MODE detected, logging in DEBUG mode');

// Keep track of number of connections from each platform (by API key)
var platformConnections = {};

var app = express();
app.use(express.bodyParser());
app.use(basicAuth(function(credentials, req, res, next) {
  if(credentials.username !== username || credentials.password !== password) {
    return next(true);
  }
  return next(false);
}, 'Please authenticate.'));

app.get('*', function(req, res, next) {
  req.requireAuthorization(req, res, next);
});

app.use(express.static(__dirname + '/public'));

var wsServer;

logger.info('Starting insecure notifications server on port ' + insecurePort);
var insecureServer = http.createServer(app).listen(insecurePort);

var secure = fs.existsSync(__dirname + '/ssl/ssl.key');
if(secure) {
  // Load key and certificate for HTTPS
  var options = {
    key: fs.readFileSync(__dirname + '/ssl/ssl.key'),
    cert: fs.readFileSync(__dirname + '/ssl/notifications.crt')
  };

  // HTTPS version
  logger.info('Starting secure notifications server on port ' + securePort);

  var secureServer = https.createServer(options, app).listen(securePort);
  wsServer = io.listen(secureServer);
}
else {
  wsServer = io.listen(insecureServer);
}

wsServer.set('log level', 1);

logger.info('Server started');

var manager = ClientManager(wsServer);

setInterval(function() {
  if(manager.userIsRegistered('admin')) {
    adminStatUpdate(manager);
  }
}, 5000);


//Run on every connection
var onSocketConnection = function (socket) {
  logger.debug('New Hub Instance: ' + socket.id);

  //Function to store connection info to the clients array
  socket.on('rd-storeClientInfo', function (data) {
    var uid = data.ruserId;
    var apiKey = data.apiKey;

    try {
      if(apiKey) {
        if(apiKey in platformConnections) {
          platformConnections[apiKey] += 1;
        } else {
          platformConnections[apiKey] = 1;
        }
      }
    } catch(e) {}

    if(!uid) {
      console.log('Error: no uid provided in register event');
      return socket.disconnect();
    }

    manager.registerUser(socket, uid);
    logger.info('User ' + uid + ' registered on socket ' + socket.id);
  });

  //Tracking hub open and close
  socket.on('status', function (data) {
    logger.info('client status changed: ' + JSON.stringify(data.type));

    switch(data.type) {
      case 'hub-open':
      return manager.addStatus(socket, 'hub-open');

      case 'hub-close':
      return manager.removeStatus(socket, 'hub-open');

      default:
      logger.warning('Unknown status from client: ' + JSON.stringify(data.status));
      return;
    }
  });

}; // Close the main connection

wsServer.sockets.on('connection', onSocketConnection);

//Admin Update Sender
function adminStatUpdate(manager) {
  var numClients = manager.getNumConnections();
  var numOpenHubs = manager.getConnectionsWithStatus('/hub-open');
  var numLoggedInUsers = manager.getLoggedInUsers();
  var freeMem = os.freemem();
  var totalMem = os.totalmem();

  var message = {
    activeHubs: numClients,// Number of loaded hubs (connections)
    openHubs: numOpenHubs, // Number of open hubs
    clients: numLoggedInUsers,
    freeMemory: freeMem / 1024 / 1024,
    totalMemory: totalMem / 1024 / 1024,
    responseTimeAvg: responseTimeAvg,
    platformConnections: platformConnections,
    uptime: process.uptime()
  };
  manager.sendMessageToUser('admin', 'rd-adminUpdate', message);
}

// Keep track of HTTP response time
var responseTimeAvg = null;
var responseTimeLock = false;

app.post('/notify/', function(req, res) {
  var responseTimeStart;
  if(!responseTimeLock) {
    responseTimeLock = true;
    responseTimeStart = process.hrtime();
  }

  var data = req.body;

  // Check for required params
  if(!('text' in data && 'points' in data && 'id' in data && 'key' in data)) {
    res.writeHead(400);
    return res.end();
  }

  // Required params
  var text        = data.text;
  var points      = data.points;
  var userId      = data.id;
  var apiKey = data.key;

  // Optional `bonus` key is passed along to client
  var bonus = (typeof data.bonus === 'undefined')? false : data.bonus;

  if(apiKey !== password) {
    logger.warning('Unauthorized request: ' + JSON.stringify(data));
    res.writeHead(401);
    return res.end('Unauthorized');
  }

  res.writeHead(200);
  logger.debug('Request: ' + JSON.stringify(data));

  manager.notifyUser(userId, {
    rdResponseText: text,
    rdPoints: points,
    bonus: bonus
  }, repeatNotifyMax, repeatNotifyDelay);

  res.end();

  // Record total time processing request
  if(responseTimeLock) {
    responseTimeLock = false;
    var responseTimeDiff = process.hrtime(responseTimeStart);
    var ms = responseTimeDiff[1] / 1000000 + responseTimeDiff[0] * 1000;
    responseTimeAvg = (responseTimeAvg * 0.8) + (ms * 0.2);
  }

  // Void request/response references to make sure we avoid memory leaks
  req = null;
  res = null;
});

