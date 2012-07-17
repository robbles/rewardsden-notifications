var io = require('socket.io-client');

//var url = 'http://50.57.114.51:8080';
var url = 'http://localhost:8080';
var userId = 6280;
var apiKey = '0ad5534934bba5ae822812bca9438b326f2cf5363dc17a24dc21b78b69fb1e73';

if(process.argv.length === 3) {
  userId = parseInt(process.argv[2], 10);
  console.log('userId:' + userId);
}

console.log('Starting new connection...');
var socket = io.connect(url);

socket.on('connect', function (data) {
  console.log("Connected to Node server");
  socket.emit('rd-storeClientInfo', { ruserId: userId, apiKey: apiKey });
});

socket.on("rd-notify", function(data) {
  console.log('rd-notify message received:');
  console.log(data);
});

socket.on("disconnect", function(data) {
  console.log('disconnected');
  process.exit(0);
});

