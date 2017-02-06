require('./utils/KalturaConfig');
require('./utils/KalturaLogger');
const util = require('util');
const cron = require('cron');
const QueueManager = require('./QueueManager');
const CacheManager = require('./CacheManager');
const clearEventCommand = 'clearEvent';

class ConnectionManager {

    constructor() {
        this.CacheManager = new CacheManager();
        this.socketIoServer = null;
        this.queueManager = null;
        this.queueName = KalturaConfig.config.rabbit.queueName;
        this._init();
    }

    _init() {
        let This = this;
        //Connect and listen to queue before making server available for connections.
        this.queueManager = new QueueManager(function () {
            if (!This.socketIoServer.nsps['/'].adapter.rooms[This.queueName]) {
                This.queueManager.addMessageListener(This.queueName, function (message) {
                    return This.onMessage(message);
                });
            }
        });

        //Initialize timer job every minute to handle cache cleaning.
        const cacheCleaner1Min = cron.job("0 * * * * *", function () {
            This.CacheManager.cleanPastMessages();
        });
        cacheCleaner1Min.start();

        this.startServer();

    }

    startServer() {
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
            this.onError(socket, "Incorrect query details were given!", true);
        }
        else {
            if (query.b) {
                if (query.b == KalturaConfig.config.tokens.key) {
                    KalturaLogger.log("New socket with id [" + socket.id + "] created for a user connected from demo");
                    socket.backdoor = true;
                    socket.emit('validated');

                }
                else {
                    this.onError(socket, "User is not verified!", true);
                }
            }
            else if (this.validateClient(query.p, query.x, socket)) {
                KalturaLogger.log("New socket with id [" + socket.id + "] created.");
                socket.emit('validated');

            }
            else {
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
        let b64string = new Buffer(token, 'base64');
        let params = b64string.toString('utf8').split(":");
        let pId = params[0];
        if (partnerId !== pId) {
            this.connectionError('partnerId', partnerId, pId);
            return false;
        }
        let tokens;
        try {
            tokens = this.decrypt(params[1]);
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
            //if (res.length > 0)
            for (let i = 0 ; i < res.length ; i++)
                this.socketIoServer.sockets.in(clientKey).emit('message', eventKey, res[i]);
        }
        catch (err) {
            KalturaLogger.error("Error Sending available messages to client: " + util.inspect(err));
        }
    }

    onMessage(message) {
        let messageAsString;
        try {
            messageAsString = String.fromCharCode.apply(null, new Uint8Array(message.data));
            KalturaLogger.log("Message received: " + messageAsString);
            let messageObj = JSON.parse(messageAsString);

            this.handleMessage( messageObj);
        }
        catch (err) {
            KalturaLogger.error("Could not handle received message: " + messageAsString + " " + util.inspect(err));
        }
    }
    handleMessage(messageObj) {
        let eventKey = messageObj.eventName;
        let messageId = messageObj.msgId;
        let messageTiming = messageObj.msgTime;
        let eventMessageKey = messageObj.queueKey;

        let messageData = JSON.parse(messageObj.data);

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
        let crypto = require('crypto');

        let decipher = crypto.createDecipheriv('aes-128-cbc', KalturaConfig.config.tokens.key, KalturaConfig.config.tokens.iv);
        let chunks = [];
        chunks.push(decipher.update(data.toString(), 'hex', 'binary'));
        chunks.push(decipher.final('binary'));
        let dec = chunks.join('');

        return dec.split(":");
    };

    parseKey(token, socket) {
        let tokens;
        try {
            tokens = this.decrypt(token);
            if (tokens[1] !== socket.myHash) {
                this.connectionError('hash', this.hash, tokens[1]);
                throw new Error("Couldn't parse key");
            }
            return tokens[0];
        }
        catch (err) {
            let errorMsg = "Couldn't decrypt given token! ";
            KalturaLogger.error(errorMsg + " error message: " + err.message + " stack: " + err.stack);
            throw new Error(errorMsg);
        }
    };
}

module.exports = ConnectionManager;