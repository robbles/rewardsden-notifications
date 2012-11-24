/*jshint es5:true, laxcomma:true */

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

    notifyUser: function(user, eventName, message) {
      // TODO check first for existence and retry
      server.sockets.in('users/' + user).emit(eventName, message);
    },

    userIsRegistered: function(userId) {
      return (('/users/' + userId) in server.sockets.manager.rooms);
    }
  };

  return self;
};
