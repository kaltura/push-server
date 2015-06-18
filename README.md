## push-server

Kaltura 'push-server' manages all clients' web sockets in order to receive pushed data. Basically, it's a part of a larger message-oriented middleware system, maintained by Kaltura's server (the Push Event Notification Plugin). Client can register to event (using the push plugin), and once the event occurs, it will be pushed into a queue. The push-server provides listener to this queue, so that the client will receive the object directly through the web socket (socket io implementation) into their application.

### Deployment
Please refer to [deployment document] (https://github.com/kaltura/push-server/blob/master/push_server_deployment.md)

### Copyright & License

All code in this project is released under the [AGPLv3 license](http://www.gnu.org/licenses/agpl-3.0.html) unless a different license for a particular library is specified in the applicable library path. 

Copyright © Kaltura Inc. All rights reserved.