/*jshint es5:true, laxcomma:true */
var utils = require('./utils');

exports.ClientManager = function(server) {
  var self = {
    // Room joined by default by all socket.io clients
    CATCHALL_ROOM: '',

    globalPing: function() {
      server.sockets.emit('ping');
    },

    getNumConnections: function() {
      if(self.CATCHALL_ROOM in server.sockets.manager.rooms) {
        return server.sockets.manager.rooms[self.CATCHALL_ROOM].length;
      }
      return 0;
    },

    getConnectionsWithStatus: function(status) {
      var room = '/status/' + status;
      if(room in server.sockets.manager.rooms) {
        return server.sockets.manager.rooms[room].length;
      }
      return 0;
    },

    // For recording hub open, etc.
    addStatus: function(socket, status) {
      var room = 'status/' + status;
      socket.join(room);
    },

    removeStatus: function(socket, status) {
      var room = 'status/' + status;
      socket.leave(room);
    },

    registerUser: function(socket, userId) {
      socket.join('users/' + userId);
    },

    userIsRegistered: function(userId) {
      return (('/users/' + userId) in server.sockets.manager.rooms);
    },

    getLoggedInUsers: function() {
      var roomCount = Object.keys(server.sockets.manager.rooms).length;

      // Account for default room
      roomCount -= 1;

      // Account for hub-open status
      if('/status/hub-open' in server.sockets.manager.rooms) {
        roomCount -= 1;
      }

      return roomCount;
    },

    sendMessageToUser: function(user, eventName, message) {
      server.sockets.in('users/' + user).emit(eventName, message);
    },

    notifyUser: function(user, message, repeatRetries, repeatDelay) {
      // Decouple from calling function to speed up response
      process.nextTick(function() {

        // Keep trying to send the message up to repeatRetries times, with delay of repeatDelay ms
        utils.repeatUntil(function(attempts) {
          try {
            if(self.userIsRegistered(user)) {

              self.sendMessageToUser(user, 'rd-notify', message);

              logger.info('Notification went to user = '+user+': ' + JSON.stringify(message));
              return true;
            }

            if(attempts !== repeatRetries) {
              logger.debug('Attempt ' + attempts + ' client ' + user + ' not found, retrying in ' + repeatDelay);
            } else {
              logger.warning('Failed to send message to ' + user + ' after ' + attempts + ' attempts');
            }
          } catch(err) {
            logger.error('Exception delivering message: ' + err);
          }

          return false;
        }, repeatDelay, repeatRetries);
      });
    },

  };

  return self;
};

