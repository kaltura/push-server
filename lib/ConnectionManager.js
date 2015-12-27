require('./utils/KalturaConfig');
require('./utils/KalturaLogger');
var QueueManager = require('./QueueManager');

// ConnectionManager c'tor calls to init
var ConnectionManager = function() {
	this.socketIoServer = null;
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
	this.socketIoServer = require('socket.io').listen(parseInt(port, 10));
	
	var This = this;
	this.socketIoServer.on('connection', function(socket) {
		This.onClientConnects(socket);
		
		socket.on('listen', function(queueKey) {
			This.onClientListens(socket, queueKey);
		});
		
		socket.on('publish', function(data) {
			This.onClientPublish(socket, data);
		});

		socket.on('disconnect', function() {
			This.onClientDisconnects(socket);
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
			KalturaLogger.log("New socket with id ["+ socket.id +"] created for a user connected from: " + this.getClientIp(socket.request));
			// notify user that validation has succeeded
			socket.emit('validated');
			// prepare the rooms to be registered
			socket.queueKeys = [];
		}
	}
};

ConnectionManager.prototype.onClientDisconnects = function(socket) {
	KalturaLogger.log('User with socket id [' + socket.id + '] has disconnected.');
	// for each of the queues
	for (var i = 0, len = socket.queueKeys.length; i < len; i++) {
		var queueKey = socket.queueKeys[i];
		// if no one is connected to that room, stop listening to the queue
		if (!this.socketIoServer.nsps['/'].adapter.rooms[queueKey]) {
			this.queueManager.removeMessageListener(queueKey);
		}
	}
};

ConnectionManager.prototype.connectionError = function(type, expected, given){
	KalturaLogger.error('A connection with incorrect ' + type + ' was attempted! (expected: ['+ expected +'], given: ['+ given +'])');
};

ConnectionManager.prototype.validateClient = function(partnerId, token, clientIp)
{
	// decode the base64 token string
	var params = token.split(":");
	// expecting the string to be <pid>:<encoded data> 
	var pId = params[0];
	if (partnerId !== pId){
		this.connectionError('partnerId', partnerId, pId);
		return false;
	}
	// check key and ip correctness
	if (params[1] !== KalturaConfig.config.tokens.key) {
		this.connectionError('key', KalturaConfig.config.tokens.key, params[1]);
		return false;
	}
	var ip = params[2];
	if (ip !== clientIp){
		this.connectionError('client IP', ip, clientIp);
		return false;
	}
	this.hash = params[3];
	return true;

};


ConnectionManager.prototype.onClientListens = function(socket, queueKeyStr) {
	var queueKey = null;
	try {
		queueKey = queueKeyStr;
		// if room wasn't already created, add listener
		var This = this;
		if (!this.socketIoServer.nsps['/'].adapter.rooms[queueKey]) {
			This.queueManager.addMessageListener(queueKey, function(message){
				return This.onMessage(socket, queueKey, message);
				} );
		}
		socket.join(queueKey);
		socket.queueKeys.push(queueKey);
		// notify client that connection to the queue has succeeded
		this.socketIoServer.to(socket.id).emit('connected', queueKey);
		KalturaLogger.log('User from '+ this.getClientIp(socket.request) + ' is now listening to ' + queueKey);		
	} catch (err) {
		this.onError(socket, 'Invalid key', false);
	}
};

ConnectionManager.prototype.onClientPublish = function(socket, data) {
	var queueKey = null;
	try {
		var dataArr = data.split(":");
		
		this.queueManager.sendMessage(dataArr[0], dataArr[1]);
		// notify client that connection to the queue has succeeded
		this.socketIoServer.to(socket.id).emit('published', dataArr[0]);
		KalturaLogger.log('User from '+ this.getClientIp(socket.request) + ' is now publishing to ' + dataArr[0]);	
				
	} catch (err) {
		this.onError(socket, 'Invalid key', false);
	}
};

ConnectionManager.prototype.onMessage = function(socket, queueKey, message) {
	// emit the message as is (ArrayBuffer object) to client(s)
	this.socketIoServer.sockets.in(queueKey).emit('message', queueKey , message );
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

ConnectionManager.prototype.parseKey = function(token) {
	var tokens;
	try {
		tokens = this.decrypt(token);
		// check hash correctness
		if (tokens[1] !== this.hash) {
			this.connectionError('hash', this.hash, tokens[1]);
			throw new Error("Couldn't parse key");
		}
		return tokens[0];		
	}
	catch (err) {
		var errorMsg = "Couldn't decrypt given token! ";
		KalturaLogger.error(errorMsg + err.stack);
		throw new Error(errorMsg);
	}
};

module.exports = ConnectionManager;
