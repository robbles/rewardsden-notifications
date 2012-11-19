/*jshint es5:true, laxcomma:true */
var io = require('socket.io'),
    express = require('express'),
    http = require('http'),
    https = require('https'),
    fs = require('fs'),
    url = require('url');

// How often and how many times to attempt to notify a client
var repeatNotifyDelay = 5000;
var repeatNotifyMax = 4;
var insecurePort = 8080;
var securePort = 8443;

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
app.use(express.static(__dirname + '/public'));

var server = http.createServer(app).listen(insecurePort);

var wsServer, wsServerSecure;
wsServer = io.listen(server);

console.log('Starting insecure notifications server on port ' + insecurePort);

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
  wsServerSecure = io.listen(secureServer);
}
wsServer.set('log level', 1);
wsServerSecure.set('log level', 1);

// TODO: make only ONE socket.io connection conditional on value of `secure`
var numClients = 0;
setInterval(function() {
  var numClientsNow = wsServerSecure.sockets.manager.rooms[''].length;
  if(numClientsNow !== numClients) {
    numClients = numClientsNow;
    console.log('Number of clients connected: ' + numClients);
  }
}, 1000);

// Store all the current connections by user ID and socket ID
var clients = Object.create(null);
var sockets = Object.create(null);
var openHubs = Object.create(null);

//Store current logged in hubs
var numLoggedInHubs = 0;

//Run on every connection
var onSocketConnection = function (socket) {
  logger.log('info', 'New Hub Instance: ' + socket.id);

  var client = {socket: socket};
  var id = socket.id;
  sockets[id] = client;

  //Function to store connection info to the clients array
  socket.on('rd-storeClientInfo', function (data) {
    var uid = data.ruserId;

    //Check for existing connection from this ID JUST in case it did not get removed from the "discconnect" call  
    if(uid in clients) {
        if(clients[uid].clientId === socket.id) {
          // Same client, they just re-sent the rd-storeClientInfo message
          logger.log('info', 'Received repeated rd-storeClientInfo message from ' + socket.id);
        } else {
          // disconnect other client
          logger.log('info', 'Disconnecting old client ' + clients[uid].clientId);
          try {
            clients[uid].socket.disconnect();
            delete sockets[id];
          } catch(err) {}
        }

      delete clients[uid];
    }

    // Create new client record in the array
    client.customId         = uid;
    client.apiKey           = data.apiKey;
    client.socket        = socket;
    client.clientId         = socket.id;
      
    clients[uid] = client;
    logger.log('info', 'New Connection rUser = '+client.customId+' from API Key ='+client.apiKey);
    logger.log('info', 'numClients is now ' + Object.keys(clients).length);

    if(uid === 'admin') {
      // Send update to admin
      adminStatUpdate();
    }
  });

  //Tracking hub open and close
  socket.on('rd-hubStatusTrack', function (data) {
    logger.log('info', 'rd-hubStatusTrack: ' + data);
    var action = parseInt(data, 10);
    if(action == 1) { // Hub opened
      openHubs[socket.id] = true;
    } else { // Hub closed
      delete openHubs[socket.id];
    }
    logger.log('info', 'numOpenHubs is now ' + Object.keys(openHubs).length);

    adminStatUpdate();
  });
  
  // Run admin stats Update for every new connection
  adminStatUpdate();

  //Anytime user disconnects / refreshes the page
  socket.on('disconnect', function (data) {
    logger.log('info', "Socket disconnect:: id = " + socket.id);

    // Removes the client entry from clients if we have the uid already
    if('customId' in client) {
      delete clients[client.customId];
      logger.log('info', 'Disconnect:: rUser = '+client.customId);

      logger.log('info', 'numClients is now ' + Object.keys(clients).length);
    }
    // Remove socket entry
    delete sockets[id];

    // Remove hub entry if present
    delete openHubs[socket.id];

    // Run adminStatUpdate for every disconnect
    adminStatUpdate();

  }); // end the disconnect

}; // Close the main connection

wsServer.sockets.on('connection', onSocketConnection);
if(secure) {
  wsServerSecure.sockets.on('connection', onSocketConnection);
}

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
var phpServer = http.createServer(handler);
phpServer.listen(8081);

function handler (req, res) {
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
