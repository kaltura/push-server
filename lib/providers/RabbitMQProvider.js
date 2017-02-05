require('../utils/KalturaConfig');
var QueueProvider = require('../QueueProvider');
var amqp = require('amqp');
var util = require('util');
var rabbitHosts = (KalturaConfig.config.rabbit.hosts).split(',');
var retries = KalturaConfig.config.rabbit.connectionRetries;

// RabbitMQProvider c'tor
function RabbitMQProvider(config) {
    QueueProvider.apply(this, [config]);
}

//inherit from QueueProvider
RabbitMQProvider.prototype = new QueueProvider();
RabbitMQProvider.prototype.constructor = RabbitMQProvider;
RabbitMQProvider.prototype.connection = null;

var implOpts = {
    reconnect: true,
    reconnectBackoffStrategy: 'exponential',
    reconnectBackoffTime: 1000,
};

var clientProperties = {
    applicationName: 'pushServer'
    , capabilities: { consumer_cancel_notify: true
    }
};

RabbitMQProvider.prototype.init = function (config) {
    this.username = config.username;
    this.password = config.password;
    this.server = config.server;
    this.port = config.port;
    this.timeout = config.timeout;
};

RabbitMQProvider.prototype.open = function (callback) {

    this.server = rabbitHosts;
    KalturaLogger.log("Connecting to " + this.server );
    var This = this;
    this.connection = amqp.createConnection({
        host: this.server,
        login: this.username,
        password: this.password,
        port: this.port,
        clientProperties: clientProperties
    },implOpts);
    // once the connection is ready, add it to the providers list (trigger the callback)
    this.connection.on('ready', function () {
        retries = KalturaConfig.config.rabbit.connectionRetries;
        KalturaLogger.log("RabbitMQProvider has connected to " + This.server + ":" + This.port);
        callback();
    });
    this.connection.on('error', function (exception) {
        var message = String(exception.message);
        if (!message.indexOf('NOT_FOUND') === 0)
        {
            KalturaLogger.log(message);
            KalturaLogger.log("Connection error. Trying to connect to a different host...");
            This.open(callback);
        }
    });

    this.connection.on('close', function () {
        retries = retries - 1;
        if( retries == 0 )
        {
            KalturaLogger.error("Could not connect to any RabbitMQ Host. Exiting...");
            process.exit(1);
        }

        KalturaLogger.log('Connection closed. Trying to connect to a different host... retries left: ' + retries );
    });
};

//1. Listening to a queue and not deleting it when stopping to listen to it.
//2. Exiting the server in case queue does not exist - the assumption is that we create a static stable queue for the server to listen.
//3. Listening to the queue with ack:true will cause the messages to be kept in the queue if the queue is durable and not being deleted - will allow reconnecting to queue and recieving all queue
//messages with prefetchCount defined to 0
RabbitMQProvider.prototype.listen = function (queueKey, callback) {
    KalturaLogger.log('Connecting to: ' + queueKey);
    // listen to queue and subscribe to receive messages
    var callbackCalled = false;
    var This = this;
    var q = this.connection.queue(queueKey, {
        passive: true,
        autoDelete: false,
        durable: true
    }, function (queue) {
        callbackCalled = true;
        KalturaLogger.log('Queue ' + queue.name + ' is open and waiting for messages...');
        // once the msg receive, trigger callback function (given by QueueManager)
        queue.subscribe({ack: true, prefetchCount: 0}, callback);

        queue.on('close', function () {
            KalturaLogger.error("Queue " + queueKey + " Closed. Exiting...");
            process.exit(1);
        });
        queue.on('error', function () {
            KalturaLogger.error("Queue " + queueKey + " error. Exiting...");
            process(1);
        });
    });

    this.connection.on('error', function (exception) {
        var message = String(exception.message);
        if (message.indexOf('NOT_FOUND') === 0) {
            KalturaLogger.log(message);
            KalturaLogger.log('Queue does not exist. exiting... ');
            process.exit(1);
        }
    });
};

module.exports = RabbitMQProvider;