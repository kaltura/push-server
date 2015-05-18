require('./utils/KalturaConfig');
require('./utils/KalturaLogger');
var QueueManager = require('./QueueManager');
var url = require('url');

// ConnectionManager c'tor calls to init
var ConnectionManager = function() {
	this.io = null;
	this.queueManager = null;
	this.init();
};

ConnectionManager.prototype.init = function()
{
	var This = this;
	this.queueManager = new QueueManager(function() {
		This.startServer();
	});
};

ConnectionManager.prototype.startServer = function() {
	var port = KalturaConfig.config.socketio.port;
	// establish socketio (on the port set in configuration)
	this.io = require('socket.io').listen(parseInt(port, 10));
	
	var This = this;
	this.io.on('connection', function(socket) {
		This.onClientConnects(socket);
		
		socket.on('listen', function(queueKey) {
			This.onClientListens(socket, queueKey);
		});

		socket.on('disconnect', function() {
			KalturaLogger.log('User with socket id [' + socket.id + '] has disconnected.');
			// for each of the queues
			for (var i = 0, len = socket.queueKeys.length; i < len; i++) {
				var queueKey = socket.queueKeys[i];
				// if no one is connected to that room, stop listening to the queue
				if (!This.io.nsps['/'].adapter.rooms[queueKey]) {
					This.queueManager.removeMessageListener(queueKey);
				}
			}
		});
	});
};

ConnectionManager.prototype.onClientConnects = function(socket) {
	//query is JSON object, verify it contains needed params 
	var query = socket.handshake.query;
	if (!query.p || !query.e || !query.x) {
		KalturaLogger.log("Incorrect query details were given!");
		socket.disconnect();
	}
	else {
		if (!this.validateClient(query.p, query.e, query.x)) {
			socket.disconnect();
		}
		else {
			socket.emit('message', 'Client is connected!');
			KalturaLogger.log("New socket with id ["+ socket.id +"] created for a user connected from: " + socket.request.connection.remoteAddress);
			// prepare the rooms to be registered
			socket.queueKeys = [];
		}
	}
};

ConnectionManager.prototype.onClientListens = function(socket, queueKey){
	// if room wasn't already created, add listener
	var This = this;
	if (!this.io.nsps['/'].adapter.rooms[queueKey]) {
		This.queueManager.addMessageListener(queueKey, function(message){
			return This.onMessage(socket, queueKey, message);
			} );
	}
	socket.join(queueKey);
	socket.queueKeys.push(queueKey);
	this.io.sockets.in(queueKey).emit('message', 'client is now connected to ' + queueKey);
	KalturaLogger.log('User from '+ socket.request.connection.remoteAddress + ' is now listening to ' + queueKey);
};

ConnectionManager.prototype.onMessage = function(socket, queueKey, message) {
	//console.log(" [*] Received: %s from [%s]", message.data.toString('utf-8'), queueKey);
	this.io.sockets.in(queueKey).emit('message', '[' + queueKey + ']: ' + message.data.toString('utf-8'));
};


ConnectionManager.prototype.validateClient = function(partnerId, templateId, token)
{
	//require needed module
	var crypto = require('crypto');

	//key and iv should be same as in local.ini file
	//TODO: consult changing iv to a random string instead
	var decipher = crypto.createDecipheriv('aes-256-cbc', KalturaConfig.config.tokens.key, KalturaConfig.config.tokens.iv);
	//padding was added while encrypting, then set autopadding of node js to false
	decipher.setAutoPadding(false);
	
	// decode the base64 string
	var b64string = new Buffer(token, 'base64'); 
	var params = b64string.toString('utf8').split(":");
	// expecting the string to be <pid>:<encoded data> 
	var pId = params[0];
	if (partnerId !== pId){
		KalturaLogger.log('A connection with incorrect partnerId was attempted!');
		return false;
	}
	
	var cipherHexText256 = params[1];
	var dec = decipher.update(cipherHexText256,'hex','utf8');
	//decrypted data is stored in dec
	dec += decipher.final('utf8');

	// check key and timestamps correctness
	var tokens = dec.split(":");
	if (tokens[0] !== KalturaConfig.config.tokens.key) {
		KalturaLogger.log('A connection with incorrect key was attempted! (given key was: ' + tokens[0] + ')');
		return false;
	}
	
	var now =  Math.floor(new Date() / 1000) ;
	// check abstract difference in the range of a minute
	var diff = Math.abs(now-parseInt(tokens[1] , 10));
	if  (diff >= 60 || isNaN(diff)) {
		KalturaLogger.log('A connection with incorrect time range was attempted (diff is: ' + diff + 'ms)');
		return false;
	}
	return true;
};

module.exports = ConnectionManager;
