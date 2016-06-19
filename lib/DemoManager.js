var url = require('url');
var http = require('http');
var querystring = require('querystring');


require('./utils/KalturaConfig');
require('./utils/KalturaLogger');
var QueueManager = require('./QueueManager');

// DemoManager c'tor calls to init
var DemoManager = function() {
	this.httpServer = null;
	this.queueManager = null;
	this.init();
};

DemoManager.prototype.init = function() {
	this.queueManager = new QueueManager();
	this.startServer();
};

DemoManager.prototype.buildUrl = function(partnerId) {
	return KalturaConfig.config.demo.domain + ':' + KalturaConfig.config.socketio.port + '?b=' + KalturaConfig.config.tokens.key;
};

DemoManager.prototype.startServer = function() {
	var This = this;
	this.httpServer = http.createServer(function(request, response){
		var data = querystring.parse(url.parse(request.url).query);
		KalturaLogger.log('Request: ' + JSON.stringify(data));
		if(!data.token || data.token != KalturaConfig.config.demo.secret){
			return response.end('Invalid token');
		}
		This.queueManager.create(data.key);
			
		var ret = {
			url: This.buildUrl(data.partnerId),
			key: data.key
		};
		response.setHeader('Access-Control-Allow-Origin', '*');
		response.setHeader('Content-Type', 'application/json');
		response.end(JSON.stringify(ret));
	});
	//this.httpServer.listen(KalturaConfig.config.demo.port);
	KalturaLogger.log('Demo server started');
};
module.exports = DemoManager;
