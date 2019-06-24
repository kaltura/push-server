## Push-Server

Kaltura 'push-server' manages all clients' web sockets in order to receive pushed data. Basically, it's a part of a larger message-oriented middleware system, maintained by Kaltura's server (the Push Event Notification Plugin). Client can register to event (using the push plugin), and once the event occurs, it will be pushed into a queue. The push-server provides listener to this queue, so that the client will receive the object directly through the web socket (socket io implementation) into their application.

### Connecting
Make sure Phoenix TCM is configured correctly with the following properties:
- PushDomainName (that may include port as well)
- PushServerKey - should be identical to push-server tokens.key configuration property.
- PushServerIV - should be identical to push-server tokens.iv configuration property.

To get socket.io connect URL call Phoenix API for notification.register (e.g. /api_v3/service/notification/action/register).

### Deployment
Please refer to [deployment document](push_server_deployment.md)

### Docker
Please refer to [docker document](docker.md)

### Configuration
Please refer to [config document](config.md)

### Copyright & License

All code in this project is released under the [AGPLv3 license](http://www.gnu.org/licenses/agpl-3.0.html) unless a different license for a particular library is specified in the applicable library path. 

Copyright © Kaltura Inc. All rights reserved.