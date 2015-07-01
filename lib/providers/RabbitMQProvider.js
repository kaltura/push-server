var QueueProvider = require('../QueueProvider');
var amqp = require('amqp');

// RabbitMQProvider c'tor
function RabbitMQProvider(config) { 
	QueueProvider.apply(this, config);
	this.init(config);
}

RabbitMQProvider.queues = {};

// inherit from QueueProvider
RabbitMQProvider.prototype = new QueueProvider();
RabbitMQProvider.prototype.constructor = RabbitMQProvider;
RabbitMQProvider.prototype.connection = null;

RabbitMQProvider.prototype.init = function(config) {
	this.username = config.username;
	this.password = config.password;
	this.server = config.server;
	this.port = config.port;
	this.timeout = config.timeout;
};

RabbitMQProvider.prototype.open = function(callback) {
	this.connection = amqp.createConnection({host: this.server,
		login: this.username,
		password: this.password,
		port: this.port});
	KalturaLogger.log("RabbitMQProvider has connected to " + this.server + ":" + this.port);
	// once the connection is ready, add it to the providers list (trigger the callback)
	this.connection.on('ready', function(){
		callback();
	});
	
};

RabbitMQProvider.prototype.listen = function(queueKey, callback)
{
	KalturaLogger.log('Connecting to: '+ queueKey);
	// open queue and subscribe to receive messages
	var q = this.connection.queue(queueKey, {
		autoDelete : false,
		durable : true,
		arguments : { "x-expires" : parseInt(this.timeout, 10) }
	}, function(queue) {
		var ctag;
		KalturaLogger.log('Queue ' + queue.name + ' is open and waiting for messages...');
		// once the msg receive, trigger callback function (given by QueueManager)
		queue.subscribe(callback)

		RabbitMQProvider.queues[queueKey] = queue;
	});
};

RabbitMQProvider.prototype.unlisten = function(queueKey) {
	KalturaLogger.log('Closing queue: ' + queueKey); 
	// unsubsribe from queue with ctag
	var ctag = Object.getOwnPropertyNames(RabbitMQProvider.queues[queueKey].consumerTagListeners)[0];
	RabbitMQProvider.queues[queueKey].unsubscribe(ctag);
};

module.exports = RabbitMQProvider;