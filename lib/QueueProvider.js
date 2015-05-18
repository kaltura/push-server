/**
 @constructor
 @abstract
 */
function QueueProvider(config, callback)
{
    if(config){
        if (this.constructor === QueueProvider) {
            throw new Error("Can't instantiate abstract class!");
          }
        init(config, callback);
    }
}

/**
@abstract
*/
QueueProvider.prototype.init = function(config) {
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
QueueProvider.prototype.close = function(queueKey) {
	// each provider implement its own close 
	throw new Error("Abstract method!");	
};

module.exports = QueueProvider;