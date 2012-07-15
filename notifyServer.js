var util = require("util"),
    io = require('socket.io').listen(8080),
    fs = require('fs'),
    os = require('os'),
    url = require('url');

// Configure socket.io
io.set('log level', 2);

// How often and how many times to attempt to notify a client
var repeatNotifyDelay = 1000;
var repeatNotifyMax = 30;

//Create the logger
var winston = require('winston');
var logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)(),
      new (winston.transports.File)({ filename: '/rewardsden/nodeServer.log' })
    ]
  });
var repeatNotifyDelay = 1000;
var repeatNotifyMax = 30;

// Store all the current connections by user ID and socket ID
var clients = Object.create(null);
var sockets = Object.create(null);

// Store open client connections that have authenticated
var numClients = 0;

//Store current OPEN hubs
var numOpenHubs = 0;
var numActiveHubs = 0;

//Store current logged in hubs
var numLoggedInHubs = 0;

//Run on every connection
io.sockets.on('connection', function (socket) {
  logger.log('info', '*** New Hub Instance: ' + socket.id);
  console.log("*** New Hub Instance: " + socket.id);  

  var client = {socket: socket};
  sockets[socket.id] = client;

  //Function to store connection info to the clients array
  socket.on('rd-storeClientInfo', function (data) {
    console.log('Client ' + socket.id + ' has sent their data - uid = ' + data.ruserId);

    var uid = data.ruserId;

    //Check for existing connection from this ID JUST in case it did not get removed from the "discconnect" call  
    if(uid in clients) {
      delete clients[uid];
    }

    // Create new client record in the array
    client.customId         = uid;
    client.apiKey           = data.apiKey;
    client.allSocket        = socket;
    client.clientId         = socket.id;
      
    clients[uid] = client;
    numClients = numClients + 1;
    console.log('numClients is now ' + numClients);

    console.log("*** New Connection rUser= "+client.customId);
    console.log(client);
    logger.log('info', '*** New Connection rUser = '+client.customId+' Came from API Key ='+client.apiKey);
  });

  //Tracking hub open and close
  socket.on('rd-hubStatusTrack', function (data) {
    console.log('rd-hubStatusTrack: ' + data);
    numOpenHubs = numOpenHubs + parseInt(data, 10);
    console.log('numOpenHubs is now ' + numOpenHubs);

    adminStatUpdate();
  });
  
  //Run admin stats Update on any page load
  adminStatUpdate();

  //Anytime user disconnects / refreshes the page
  socket.on('disconnect', function (data) {
    console.log("*** Socket disconnect:: id = " + socket.id);

    // Removes the client entry from clients if we have the uid already
    if('customId' in client) {
      delete clients[client.customId];
      console.log("*** Disconnect:: userId = "+client.customId);
      logger.log('info', '*** Disconnect:: rUser = '+client.customId);
    }
    // Remove socket entry
    delete sockets[socket.id];
    
    adminStatUpdate();

  }); // end the disconnect

}); // Close the main connection


//Admin Update Sender
function adminStatUpdate(data) { 
  // Get admin connection
  if('admin' in clients) {
    var c = clients.admin;
    
    var message = {
      activeHubs: numActiveHubs,
      loggedInHubs: numLoggedInHubs,
      openHubs: numOpenHubs,
      clients: numClients
    };
    c.allSocket.emit('rd-adminUpdate', message);
    console.log("admin message sent");
  }
}




// for API server tech.rewardsden.com
var phpServer = require('http').createServer(handler),
  me = require('socket.io').listen(phpServer),
  him = require('fs');
phpServer.listen(8081);
var url  = require('url');

function handler (req, res) {
  res.writeHead(200);

  //Trigger notification to user
  var url_parts = url.parse(req.url, true);
  var query = url_parts.query;
  var text        = query.text;
  var points      = query.points;
  var userId      = query.id;
  console.log('Request');
  console.log(query);
  console.log(userId);
  
  repeatUntil(function() {
    if(userId in clients) {
      var c = clients[userId];
      c.allSocket.emit('rd-notify',{rdResponseText: text, rdPoints: points});
      console.log("*** Notification went to uId "+userId+" Text = "+text+" Points = "+points);
      logger.log('info', '*** Notification went to rUser = '+userId+' Text = '+text+' points = '+points);
      return true;
    }
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
