require('./utils/KalturaConfig');
require('./utils/KalturaLogger');
var QueueManager = require('./QueueManager');

// ConnectionManager c'tor calls to init
var ConnectionManager = function() {
	this.io = null;
	this.queueManager = null;
	this.init();
};

ConnectionManager.prototype.init = function() {
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

ConnectionManager.prototype.onError = function(socket, msg, disconnect) {
	socket.emit('errorMsg', msg);
	KalturaLogger.error(msg);
	if (disconnect) {
		socket.disconnect();
	}
};

ConnectionManager.prototype.getClientIp = function(req) {
	if (req.headers['x-forwarded-for']){
		return req.headers['x-forwarded-for'].split(',')[0];
	}
	else {
		return req.connection.remoteAddress;
	}
};

ConnectionManager.prototype.onClientConnects = function(socket) {
	// verify query contains needed params 
	var query = socket.handshake.query;
	if (!query.p || !query.x) {
		this.onError(socket, "Incorrect query details were given!", true);
	}
	else {
		if (!this.validateClient(query.p, query.x, this.getClientIp(socket.request))) {
			this.onError(socket, "User is not verified!", true);
		}
		else {
			socket.emit('message', 'Client is connected!');
			KalturaLogger.log("New socket with id ["+ socket.id +"] created for a user connected from: " + socket.request.connection.remoteAddress);
			// prepare the rooms to be registered
			socket.queueKeys = [];
		}
	}
};

ConnectionManager.prototype.connectionError = function(type, expected, given){
	KalturaLogger.error('A connection with incorrect ' + type + ' was attempted! (expected: ['+ expected +'], given: ['+ given +'])');
};

ConnectionManager.prototype.validateClient = function(partnerId, token, clientIp)
{
	// decode the base64 token string
	var b64string = new Buffer(token, 'base64'); 
	var params = b64string.toString('utf8').split(":");
	// expecting the string to be <pid>:<encoded data> 
	var pId = params[0];
	if (partnerId !== pId){
		this.connectionError('partnerId', partnerId, pId);
		return false;
	}
	// check key and ip correctness
	var tokens;
	try {
		tokens = this.decrypt(params[1]);
	}
	catch (err) {
		KalturaLogger.error("Couldn't decrypt given token! " + err.stack);
		return false;
	}
	if (tokens[0] !== KalturaConfig.config.tokens.key) {
		this.connectionError('key', KalturaConfig.config.tokens.key, tokens[0]);
		return false;
	}
	var ip = tokens[1];
	if (ip !== clientIp){
		this.connectionError('client IP', ip, clientIp);
		return false;
	}
	this.hash = tokens[2];
	return true;
};


ConnectionManager.prototype.onClientListens = function(socket, queueKeyStr){
	//check given queueKey is valid
	var queueKey = this.validateKey(queueKeyStr);
	if (queueKey == null){
		this.onError(socket, 'Invalid key', false);
		return;
	}
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
	this.io.sockets.in(queueKey).emit('message', '[' + queueKey + ']: ' + message.data.toString('utf-8'));
};

ConnectionManager.prototype.decrypt = function(data){
	var crypto = require('crypto');

	//key and iv should be same as in local.ini file
	var decipher = crypto.createDecipheriv('aes-256-cbc', KalturaConfig.config.tokens.key, KalturaConfig.config.tokens.iv);
	var chunks = [];
    chunks.push(decipher.update(data.toString(),'hex','binary'));
    chunks.push(decipher.final('binary'));
    var dec = chunks.join('');
	
	return dec.split(":");
};

ConnectionManager.prototype.validateKey = function(token) {
	var tokens;
	try {
		tokens = this.decrypt(token);
	}
	catch (err) {
		KalturaLogger.error("Couldn't decrypt given token! " + err.stack);
		return null;
	}
	// check hash correctness
	if (tokens[1] !== this.hash) {
		this.connectionError('hash', this.hash, tokens[1]);
		return null;
	}
	return tokens[0];
};

module.exports = ConnectionManager;
