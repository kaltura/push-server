/**
 @constructor
 @abstract
 */
function QueueProvider(config) {
    if(config){
        if (this.constructor === QueueProvider) {
            throw new Error("Can't instantiate abstract class!");
          }
        this.init(config);
    }
}

/**
@abstract
*/
QueueProvider.prototype.init = function(config) {
	// each provider implement its own init
   throw new Error("Abstract method!");
};

/**
@abstract
*/
QueueProvider.prototype.open = function(callback) {
	// each provider implement its own open
   throw new Error("Abstract method!");
};

/**
@abstract
*/
QueueProvider.prototype.listen = function(queueKey) {
	// each provider implement its own listen 
	throw new Error("Abstract method!");	
};

/**
@abstract
*/
QueueProvider.prototype.unlisten = function(queueKey) {
	// each provider implement its own unlisten 
	throw new Error("Abstract method!");	
};

module.exports = QueueProvider;