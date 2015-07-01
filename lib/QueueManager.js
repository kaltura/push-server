require('./utils/KalturaConfig');
require('./utils/KalturaLogger');

// QueueManager c'tor calls to init
var QueueManager = function(readyCallback) {
	this.init(readyCallback);
};

// attributes: providers list 
QueueManager.providers = [];

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
			var queue = require('./providers/' + queueProvider);
			var createdObject = new queue(queueConfig);
			QueueManager.providers.push(createdObject);
			KalturaLogger.log('Provider [' + queueProvider + '] was successfully created and added to list.');
			// trigger open function on each
			createdObject.open( function() {
				// check if QueueManager is ready
				if (QueueManager.providers.length === queuesArray.length) {
					readyCallback();
				}
			});
		}
	},

	// callback is onMessage function given by ConnectionManager
	addMessageListener : function(queueKey, callback) {
		for (var i in QueueManager.providers) {
			var onMessage = callback;
			QueueManager.providers[i].listen(queueKey, function(msg){
				onMessage(msg);
			});
		}
	},
	
	removeMessageListener : function(queueKey) {
		for (var i in QueueManager.providers) {
			QueueManager.providers[i].unlisten(queueKey);
		}
	}
};

module.exports = QueueManager;
