require('./utils/KalturaConfig');
require('./utils/KalturaLogger');

class QueueManager {

    constructor(readyCallback) {
        this._init(readyCallback);
    }

    _init(readyCallback) {
        //providers list
        let This = this;
        This.providers = [];
        let queues = KalturaConfig.config.queue.providers;
        let queuesArray = queues.split(",");
        KalturaLogger.log("Found " + queuesArray.length + " queue provider(s) to handle.");

        for (let queueIndex = 0; queueIndex < queuesArray.length; queueIndex++) {
            let queueName = queuesArray[queueIndex];
            let queueConfig = KalturaConfig.config[queueName];
            let queueProvider = queueConfig.providerType;

            // instantiate queue object
            let queue = require('./providers/' + queueProvider);
            let createdObject = new queue(queueConfig);
            this.providers.push(createdObject);
            KalturaLogger.log('Provider [' + queueProvider + '] was successfully created and added to list.');
            // trigger open function on each
            createdObject.open(function () {
                // check if QueueManager is ready
                if (This.providers.length === queuesArray.length) {
                    readyCallback();
                }
            });
        }
    }

    //// callback is onMessage function given by ConnectionManager
    addMessageListener(queueKey, callback) {
        for (var i in this.providers) {
            this.providers[i].listen(queueKey, function (msg) {
                callback(msg);
            });
        }
    }
}

module.exports = QueueManager;