## Push-Server Configuration

### Source types
Configuration could be applied using few different methods:
- By providing JSON file as argument to the server command line.
- By providing one or more ini files under config folder.
- By providing TCM_APP environment variable, which is what done by Dockerfile.

### Sections

#### logger
- debugEnabled - boolean, indicating if debug messages should be looged.
- logName - log file name, if not defined, logs will be printed to standard output **which is the recommended approach for docker**.
- accessLogName - http access log file name.
- errorLogName - http error log file name.
- logDir - log directory, overwritten by **LOG_PATH** environment variable in docker.

#### queue
- providers - Comma sperated list of queue managers.

#### rabbit
Section per queue manager that defined in the queue.providers list.
- providerType - value is the exact class name, currently only **RabbitMQProvider** is supported.
- username - Rabbit MQ username.
- password - Rabbit MQ password.
- server - Rabbit MQ hostname.
- port:  - Rabbit MQ port, usually 5672.
- timeout - Rabbit MQ timeout.
- exchange - Rabbit MQ exchange name.

#### tokens
- key - key to decrypt tokens, should be the same as **PushServerKey** in Phoenix TCM configuration.
- iv - initialization vector to decrypt tokens, should be the same as **PushServerIV** in Phoenix TCM configuration.

#### validation
- validateIP - boolean, indicates that IP should be validated as part of new connection handshake.
