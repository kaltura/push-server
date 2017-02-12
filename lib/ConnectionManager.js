require('./utils/KalturaConfig');
require('./utils/KalturaLogger');
require('./utils/KalturaPushServerErrors');

const kalturaPushServerValidator = require('./utils/KalturaPushServerValidator');
const util = require('util');
const QueueManager = require('./QueueManager');
const CacheManager = require('./CacheManager');
const clearEventCommand = 'CLEAR_QUEUE';

class ConnectionManager {

    constructor() {
        try {
            this.cacheManager = new CacheManager();
            this.socketIoServer = null;
            this.queueManager = null;
            kalturaPushServerValidator.validateConfigurations(KalturaConfig.config);
            this.queueName = KalturaConfig.config.queue.queueName;
            this._init();
        }
        catch(err){
            KalturaLogger.error("EXITING: " + KalturaPushServerErrors.CONNECTION_MANAGER_INIT_ERROR + ": " + util.inspect(err));
            process.exit(1);
        }
    }

    _init() {
        let This = this;
        //Connect and listen to queue before making server available for connections.
        this.queueManager = new QueueManager(function () {
            if (!This._hasRoomInSocketServer(This.queueName)) {
                This.queueManager.addMessageListener(This.queueName, function (message) {
                    return This._onMessage(message);
                });
            }
        });

        this._startServer();
    }

    _hasRoomInSocketServer(roomName){
        return this.socketIoServer.nsps['/'].adapter.rooms[roomName];
    }

    _startServer() {
        let port = KalturaConfig.config.socketio.port;
        this.socketIoServer = require('socket.io').listen(parseInt(port, 10));

        let This = this;

        this.socketIoServer.on('connection', function (socket) {
            KalturaLogger.log("New socket with id [" + socket.id + "] connected");
            This._onClientConnects(socket);
            socket.on('listen', function (eventName, queueKey) {
                This._onClientListens(socket, eventName, queueKey);
            });

            socket.on('disconnect', function () {
                This._onClientDisconnects(socket);
            });
        });
    };

    _onError(socket, msg, disconnect) {
        socket.emit('errorMsg', msg);
        KalturaLogger.error(msg);
        if (disconnect) {
            socket.disconnect();
        }
    };

    _onClientConnects(socket) {
        let query = socket.handshake.query;
        KalturaLogger.log("New connection [" + socket.id + "] query: " + util.inspect(query));
        if (!query.b && (!query.p || !query.x)) {
            this._onError(socket, KalturaPushServerErrors.INCORRECT_QUERY_DETAILS, true);
        }
        else {
            if (query.b) {
                if (query.b == KalturaConfig.config.tokens.key) {
                    KalturaLogger.log("New socket with id [" + socket.id + "] created for a user connected from demo");
                    socket.alreadyValidated = true;
                    socket.emit('validated');

                }
                else {
                    this._onError(socket, KalturaPushServerErrors.USER_VERIFICATION_ERROR, true);
                }
            }
            else if (this._validateClient(query.p, query.x, socket)) {
                KalturaLogger.log("New socket with id [" + socket.id + "] created.");
                socket.emit('validated');

            }
            else {
                this._onError(socket, KalturaPushServerErrors.USER_VERIFICATION_ERROR, true);
            }
        }
    }

    _onClientDisconnects(socket) {
        KalturaLogger.log('User with socket id [' + socket.id + '] has disconnected.');
    }

    _connectionError(type, expected, given) {
        KalturaLogger.error('A connection with incorrect ' + type + ' was attempted! (expected: [' + expected + '], given: [' + given + '])');
    }

    _validateClient(partnerId, token, socket) {
        let b64string = new Buffer(token, 'base64');
        let params = b64string.toString('utf8').split(":");
        let pId = params[0];
        if (partnerId !== pId) {
            this._connectionError('partnerId', partnerId, pId);
            return false;
        }
        try {
            let tokens;
            tokens = this._decrypt(params[1]);
            if (tokens[0] !== KalturaConfig.config.tokens.key) {
                this._connectionError('key', KalturaConfig.config.tokens.key, tokens[0]);
                return false;
            }
            socket.myHash = tokens[1];
            return true;
        }
        catch (err) {
            KalturaLogger.error("Couldn't decrypt given token! " + util.inspect(err));
            return false;
        }
    };

    _onClientListens(socket, eventNameStr, queueKeyStr) {

        try {
            let queueKey = null;
            let eventName = null;

            if (socket.alreadyValidated) {
                eventName = eventNameStr;
                queueKey = queueKeyStr;
            } else {
                eventName = this._parseKey(eventNameStr, socket);
                queueKey = this._parseKey(queueKeyStr, socket);
            }

            socket.join(queueKey);

            this.socketIoServer.to(socket.id).emit('connected', queueKey, eventName);
            KalturaLogger.log('User is now listening to ' + queueKey);
            this._sendAvailableMessages(socket.id, eventName, queueKey);

        } catch (err) {
            //We log an error and send it back to socket but we do not close connection since socket might listen to more keys.
            this._onError(socket, err, false);
        }
    };

    _sendAvailableMessages(socketId, eventKey, clientKey) {
        KalturaLogger.log("Sending Available Messages to client: " + clientKey + " for event: " + eventKey);
        try {
            // TODO - handle pagination if we have very large messages.
            let res = this.cacheManager.getMessages(eventKey, clientKey);
            for (let i = 0; i < res.length; i++) {
                let messageData = JSON.parse(res[i].data);
                this.socketIoServer.to(socketId).emit('message', clientKey, [messageData]);
            }
        }
        catch (err) {
            KalturaLogger.error(KalturaPushServerErrors.AVAILABLE_MESSAGES_ERROR  + ", " + util.inspect(err));
        }
    }

    _onMessage(message) {
        let messageAsString;
        try {
            messageAsString = String.fromCharCode.apply(null, new Uint8Array(message.data));
            KalturaLogger.log("Message received: " + messageAsString);
            let messageObj = JSON.parse(messageAsString);

            this._handleMessage( messageObj);
        }
        catch (err) {
            KalturaLogger.error("Could not handle received message: " + messageAsString + " " + util.inspect(err));
        }
    }
    _handleMessage(messageObj) {
        let eventKey = messageObj.queueName;
        let messageId = messageObj.msgId;
        let messageTiming = messageObj.msgTime;
        let eventMessageKey = messageObj.queueKey;
        let messageData;
        try {
            messageData = JSON.parse(messageObj.data);
        }catch(err){
            throw new Error(KalturaPushServerErrors.MESSAGE_DATA_PARSING_ERROR + ": " + util.inspect(messageObj.data));
        }

        if (messageObj.command &&  messageObj.command == clearEventCommand && eventKey ) {
            KalturaLogger.log("Received Clear event command for event [" + eventKey + "]");
            this.cacheManager.clearEventFromCache(eventKey);
            return;
        }

        if (!this.cacheManager.shouldHandleMessage(messageId, messageTiming)) {
            KalturaLogger.log("No need to handle received message.");
            return;
        }

        KalturaLogger.log("Message received for key: " + eventMessageKey);
        this.socketIoServer.sockets.in(eventMessageKey).emit('message', eventMessageKey, [messageData]);

        this.cacheManager.addMessageToCache(eventKey, eventMessageKey, messageId, messageTiming, messageObj );
    }

    _decrypt(data) {
        let crypto = require('crypto');

        let decipher = crypto.createDecipheriv('aes-128-cbc', KalturaConfig.config.tokens.key, KalturaConfig.config.tokens.iv);
        let chunks = [];
        chunks.push(decipher.update(data.toString(), 'hex', 'binary'));
        chunks.push(decipher.final('binary'));
        let dec = chunks.join('');

        return dec.split(":");
    };

    _parseKey(token, socket) {
        try {
            let tokens;
            tokens = this._decrypt(token);
            if (tokens[1] !== socket.myHash) {
                this._connectionError('hash', this.hash, tokens[1]);
                throw new Error(KalturaPushServerErrors.PARSE_KEY_ERROR);
            }
            return tokens[0];
        }
        catch (err) {
            KalturaLogger.error(KalturaPushServerErrors.TOKEN_DECRYPTION_ERROR + " : " + util.inspect(err));
            throw new Error(KalturaPushServerErrors.TOKEN_DECRYPTION_ERROR);
        }
    };
}

module.exports = ConnectionManager;