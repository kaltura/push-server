require('./utils/KalturaConfig');
require('./utils/KalturaLogger');
const util = require('util');
const cron = require('cron');
const QueueManager = require('./QueueManager');
const CacheManager = require('./CacheManager');
const clearEventCommand = 'clearEvent';

class ConnectionManager {

    constructor() {
        //moshe todo rename to cacheManager
        this.CacheManager = new CacheManager();
        this.socketIoServer = null;
        this.queueManager = null;
        //moshe todo what if there is no value , do you have a default? should throw exception
        this.queueName = KalturaConfig.config.rabbit.queueName;
        this._init();
    }

    _init() {
        var This = this;
        //Connect and listen to queue before making server available for connections.

        this.queueManager = new QueueManager(function () {
            //moshe todo checking of room already exist should move into a function and not implemented in this line
            // its business logic most likely to increase
            if (!This.socketIoServer.nsps['/'].adapter.rooms[This.queueName]) {
                This.queueManager.addMessageListener(This.queueName, function (message) {
                    return This.onMessage(message);
                });
            }
        });

        //moshe todo cache cleaning cron job should not be implemented in the init of the connection manager
        // the entire section should be part of the  cache manager as part of its init.
        // since this is a logic of inMemoryCacheManager and not connection manager

        //Initialize timer job every minute to handle cache cleaning.
        const cacheCleaner1Min = cron.job("0 * * * * *", function () {
            this.CacheManager._cleanPastMessages();
        });
        cacheCleaner1Min.start();

        this.startServer();

    }

    startServer() {
        //Moshe todo - all the parameters that are taken from the configurtion need to move to a a new class
        // PushServerConfig that once constructed gets all the values from cache,
        //  and it knows what to do if value is missing, put a default or break the application.
        // Also the value here must be const
        let port = KalturaConfig.config.socketio.port;
        this.socketIoServer = require('socket.io').listen(parseInt(port, 10));

        let This = this;

        this.socketIoServer.on('connection', function (socket) {
            KalturaLogger.log("New socket with id [" + socket.id + "] connected");
            This.onClientConnects(socket);
            socket.on('listen', function (eventName, queueKey) {
                This.onClientListens(socket, eventName, queueKey);
            });

            socket.on('disconnect', function () {
                This.onClientDisconnects(socket);
            });
        });
    };

    //Moshe todo - all private function starts with underscore
    onError(socket, msg, disconnect) {
        socket.emit('errorMsg', msg);
        KalturaLogger.error(msg);
        if (disconnect) {
            socket.disconnect();
        }
    };

    onClientConnects(socket) {
        let query = socket.handshake.query;
        KalturaLogger.log("New connection [" + socket.id + "] query: " + util.inspect(query));
        if (!query.b && (!query.p || !query.x)) {
            //Moshe todo - all error messages that goes to the user must be added under a class of
            // static errors , and put define here
            // PushServerErrors::USER_VERIFICATION_ERROR
            this.onError(socket, "Incorrect query details were given!", true);
        }
        else {
            if (query.b) {
                if (query.b == KalturaConfig.config.tokens.key) {
                    KalturaLogger.log("New socket with id [" + socket.id + "] created for a user connected from demo");
                    //Moshe todo - this name is really bad, what is it doing? what is it made for? give it a valid name.
                    socket.backdoor = true;
                    socket.emit('validated');
                }
                else {
                    //Moshe todo - all error messages that goes to the user must be added under a class of
                    // static errors , and put define here
                    // PushServerErrors::USER_VERIFICATION_ERROR
                    this.onError(socket, "User is not verified!", true);
                }
            }
            else if (this.validateClient(query.p, query.x, socket)) {
                KalturaLogger.log("New socket with id [" + socket.id + "] created.");
                socket.emit('validated');

            }
            else {
                //Moshe todo - all error messages that goes to the user must be added under a class of
                // PushServerErrors::USER_VERIFICATION_ERROR
                this.onError(socket, "User is not verified!", true);
            }
        }
    }

    onClientDisconnects(socket) {
        KalturaLogger.log('User with socket id [' + socket.id + '] has disconnected.');
    }

    connectionError(type, expected, given) {
        KalturaLogger.error('A connection with incorrect ' + type + ' was attempted! (expected: [' + expected + '], given: [' + given + '])');
    }

    validateClient(partnerId, token, socket) {
        //Moshe todo - getting partner ID from token shoudl go into another private function
        var b64string = new Buffer(token, 'base64');
        var params = b64string.toString('utf8').split(":");
        var pId = params[0];
        if (partnerId !== pId) {
            this.connectionError('partnerId', partnerId, pId);
            return false;
        }

        //Moshe todo - Token is not relevant in this scope only within the try
        let tokens;
        try {
            tokens = this.decrypt(params[1]);
            //Moshe todo - take value from PusServerConfig class
            if (tokens[0] !== KalturaConfig.config.tokens.key) {
                this.connectionError('key', KalturaConfig.config.tokens.key, tokens[0]);
                return false;
            }
            socket.myHash = tokens[1];
            return true;
        }
        catch (err) {
            KalturaLogger.error("Couldn't decrypt given token! " + err.stack + ' ' + err.message);
            return false;
        }
    };

    onClientListens(socket, eventNameStr, queueKeyStr) {
        //Moshe todo - vars are not relevant in this scope only within the try
        let queueKey = null;
        let eventName = null;
        try {
            if (socket.backdoor) {
                eventName = eventNameStr;
                queueKey = queueKeyStr;
            } else {
                eventName = this.parseKey(eventNameStr, socket);
                queueKey = this.parseKey(queueKeyStr, socket);
            }

            socket.join(queueKey);

            this.socketIoServer.to(socket.id).emit('connected', queueKey, eventName);
            KalturaLogger.log('User is now listening to ' + queueKey);
            this.sendAvailableMessages(queueKey, eventName);

        } catch (err) {
            //We log an error and send it back to socket but we do not close connection since socket might listen to more keys.
            this.onError(socket, err, false);
        }
    };

    sendAvailableMessages(clientKey, eventKey) {
        KalturaLogger.log("Sending Available Messages to client: " + clientKey + " for event: " + eventKey);
        try {
            // TODO - handle pagination if we have very large messages.
            let res = this.CacheManager.getMessages(clientKey, eventKey);
            if (res.length > 0)
                this.socketIoServer.sockets.in(clientKey).emit('message', eventKey, res);
        }
        catch (err) {
            KalturaLogger.error("Error Sending available messages to client: " + util.inspect(err));
        }
    }

    onMessage(message) {
        try {
            var messageAsString = String.fromCharCode.apply(null, new Uint8Array(message.data));
            KalturaLogger.log("Message received: " + messageAsString);
            var messageObj = JSON.parse(messageAsString);

            this.handleMessage( messageObj);
        }
        catch (err) {
            KalturaLogger.error("Could not handle received message: " + messageAsString + " " + util.inspect(err));
        }
    }
    handleMessage(messageObj) {
        var eventKey = messageObj.eventName;
        var messageId = messageObj.msgId;
        var messageTiming = messageObj.msgTime;
        var eventMessageKey = messageObj.queueKey;

        //Moshe todo - JSON.parse can throw exception , need to catch it here
        var messageData = JSON.parse(messageObj.data);

        if (messageObj.command &&  messageObj.command == clearEventCommand && eventKey ) {
            KalturaLogger.log("Received Clear event command for event [" + eventKey + "]");
            this.CacheManager.clearEventFromCache(eventKey);
            return;
        }

        if (this.CacheManager.isDuplicate(messageId)) {
            KalturaLogger.log("Duplicate Message detected - already in cache. ");
            return;
        }

        KalturaLogger.log("Message received for key: " + eventMessageKey);
        this.socketIoServer.sockets.in(eventMessageKey).emit('message', eventMessageKey, [messageData]);

        this.CacheManager.addMessageToCache(eventKey, eventMessageKey, messageId, messageTiming, messageObj );
    }

    decrypt(data) {
        var crypto = require('crypto');

        var decipher = crypto.createDecipheriv('aes-128-cbc', KalturaConfig.config.tokens.key, KalturaConfig.config.tokens.iv);
        var chunks = [];
        chunks.push(decipher.update(data.toString(), 'hex', 'binary'));
        chunks.push(decipher.final('binary'));
        var dec = chunks.join('');

        return dec.split(":");
    };

    parseKey(token, socket) {
        var tokens;
        try {
            tokens = this.decrypt(token);
            //Moshe todo - use const values for accessing array -
            // MY_HASH_LOCATION
            if (tokens[1] !== socket.myHash) {
                this.connectionError('hash', this.hash, tokens[1]);
                throw new Error("Couldn't parse key");
            }
            return tokens[0];
        }
        catch (err) {
            //Moshe todo - same here , errors go to Push server error file
            var errorMsg = "Couldn't decrypt given token! ";
            KalturaLogger.error(errorMsg + " error message: " + err.message + " stack: " + err.stack);
            throw new Error(errorMsg);
        }
    };
}

module.exports = ConnectionManager;