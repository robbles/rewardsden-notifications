var util = require("util"),
    io = require('socket.io').listen(8080),
    fs = require('fs'),
    os = require('os'),
    url = require('url');

//Store all the current connections
var clients =[];

//Store current OPEN hubs
var openHub = 0;

//Stores current active Hubs
var activeHub =[];

//Stores current loggged in users with active hubs
var loggedInActiveHub =[];

//Create the logger
var winston = require('winston');
var logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)(),
      new (winston.transports.File)({ filename: '/rewardsden/nodeServer.log' })
    ]
  });

//Run on every connection
io.sockets.on('connection', function (socket) {
  logger.log('info', '*** New Hub Instance');
  console.log("*** New Hub Instance");  
  activeHub.push(socket); // store new instance of active hub
  //Function to store connection info to the clients array
  socket.on('rd-storeClientInfo', function (data) {
    //Check for existing connection from this ID JUST in case it did not get removed from the "discconnect" call  
    for( var i=0, len=clients.length; i<len; ++i ){
                  var c = clients[i];
                if(c.customId == data.ruserId){
                    //Remove the client from the connected clients array
                    clients.splice(i,1);
                      break;
                }
          }
    // Creat new client record in the array
    var clientInfo = new Object();
    clientInfo.customId         = data.ruserId;
    clientInfo.apiKey           = data.apiKey;
    clientInfo.allSocket        = socket;
    clientInfo.clientId         = socket.id;
      
    clients.push(clientInfo);
    console.log("*** New Connection rUser= "+clientInfo.customId);
    console.log("User"+clientInfo.customId+ " came from API Key = "+clientInfo.apiKey);
    logger.log('info', '*** New Connection rUser = '+clientInfo.customId+' Came from API Key ='+clientInfo.apiKey);
      
    loggedInActiveHub.push(clientInfo); // stores new instance of logged in hub use
  });
   //Tracking hub open and close
        socket.on('rd-hubStatusTrack', function (data) {
                openHub = parseInt(openHub) + parseInt(data);
                adminStatUpdate();
        });
  
  //Run admin stats Update on any page load
        adminStatUpdate();
  //Anytime user disconnects / refreshes the page
  socket.on('disconnect', function (data) {
  //Removes the entry from the client array
  for( var i=0, len=clients.length; i<len; ++i ){
          var c = clients[i];
            if(c.clientId == socket.id){
    //Remove the client from the connected clients array
              clients.splice(i,1);
                console.log("*** Disconect:: userId = "+c.customId);
                logger.log('info', '*** Disconect:: rUser = '+c.customId);
    break;
            }
        }
  //Removes the entrey fro active hub array
  for( var i=0, len=activeHub.length; i<len; ++i ){
                var AH = activeHub[i];
            if(AH.id == socket.id){
                //Remove the client from the connected clients array
                activeHub.splice(i,1);
                break;
            }
        }
  //Removes the entrey from loggegin array
        for( var i=0, len=loggedInActiveHub.length; i<len; ++i ){
                var LH = loggedInActiveHub[i];
            if(LH.clientId == socket.id ){
                //Remove the client from the connected loggedin  array
                loggedInActiveHub.splice(i,1);
                break;
            }
        }
  adminStatUpdate();
  //Clear the scoket becuase it closed the connection
  console.log("Closing Hub Instance");
  logger.log('info', 'Closing Hub Instance');
  }); // end the disconnect

}); // Close the main connection


//Admin Update Sender
function adminStatUpdate(data) { 
  //loop through existing connections looking for the userId connection socket
                for( var i=0, len=clients.length; i<len; ++i ){
                        var c = clients[i];
                                if(c.customId == 'admin'){
        
          var num_activeHubClients = activeHub.length;
          var num_loggedInHubs   = loggedInActiveHub.length;  
          var num_openHub    = openHub;
          var num_clients    = clients.length
          
          var message = { activeHubs: num_activeHubClients, loggedInHubs: num_loggedInHubs, openHubs: num_openHub, clients: num_clients}
          console.log("admin message sent");
          c.allSocket.emit('rd-adminUpdate', message);
        }
    }
}




// for API server tech.rewardsden.com
var phpServer = require('http').createServer(handler)
  , me = require('socket.io').listen(phpServer)
  , him = require('fs')
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
  console.log(query);
  
  function noteificationSender() {
      var x = 0;
      var delay = 1000;
      var repetitions = 30;
      var loopCount =0;
  var intervalID = setInterval(function () {
        //loop through existing connections looking for the userId connection socket
        for( var i=0, len=clients.length; i<len; ++i ){
            var c = clients[i];
        if(c.customId == userId){
          //Found user and socket info
          //Send notification
          c.allSocket.emit('rd-notify',{rdResponseText: text, rdPoints: points});
          console.log("*** Notifcation went to uId "+userId+" Text = "+text+" Points = "+points);
          logger.log('info', '*** Notification went to rUser = '+userId+' Text = '+text+' points = '+points);
          
          //stop timer
          clearInterval(intervalID);
          break;
          } 
        }//close the loop looking through connections
           if (++x === repetitions) { //stops the timer IF x=repetitions
               clearInterval(intervalID);
           }
  loopCount ++;
  console.log("Notification Sender.. "+loopCount+ " loop happend for uid "+userId);
  logger.log('info', 'Notification Sender..'+loopCount+' loop happend for rUser ='+userId);
      }, delay);
  }
  noteificationSender();
  res.end();
}
