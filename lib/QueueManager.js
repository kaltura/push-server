require('./utils/KalturaConfig');
require('./utils/KalturaLogger');

// QueueManager c'tor calls to init
var QueueManager = function(readyCallback) {
	this.init(readyCallback);
};

// attributes: providers list , listeners list
QueueManager.providers = [];
QueueManager.listeners = {};

// static getProviders
QueueManager.getProviders = function() {
	return this.providers;
};

QueueManager.prototype = {
	init : function(readyCallback) {
		var queues = KalturaConfig.config.queue.providers;
		var queuesArray = queues.split(",");
		KalturaLogger.log("Found " + queuesArray.length + " queue provider(s) to handle.");

		for (var queueIndex = 0; queueIndex < queuesArray.length; queueIndex++) {
			var queueName = queuesArray[queueIndex];
			var queueConfig = KalturaConfig.config[queueName];
			var queueProvider = queueConfig.providerType;

			// instantiate queue object
			var queue = require('./' + queueProvider);
			var createdObject = new queue(queueConfig, function() {
						QueueManager.providers.push(createdObject);
						KalturaLogger.log('Provider [' + queueProvider + '] was successfully created and added to list.');
						// check if QueueManager is ready
						if (QueueManager.providers.length === queuesArray.length) {
							readyCallback();
						}
					});
		}
	},

	// callback is onMessage function given by ConnectionManager
	addMessageListener : function(queueKey, callback) {
		var This = this;
		QueueManager.listeners[queueKey] = callback;
		for (var i in QueueManager.providers)
		{
			QueueManager.providers[i].listen(queueKey, function(msg){
				This.onMessage(queueKey, msg);
			});
		}
	},
	
	removeMessageListener : function(queueKey) {
		QueueManager.listeners[queueKey] = null;
		for (var i in QueueManager.providers) {
			QueueManager.providers[i].close(queueKey);
		}
	},	
	
	onMessage : function(queueKey, message) {
		QueueManager.listeners[queueKey](message);
	}
};

module.exports = QueueManager;
