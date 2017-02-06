class KalturaPushServerValidator {

	static validateConfigurations(config)
	{
		if(!config)
			throw new Error("No configuration is defined");

		//socketio
		if (! config.socketio )
			throw new Error("No socketio configuration section is defined in configuration file");
		if (! config.socketio.port)
			throw new Error("No socketio [port] configuration parameter is defined in configuration file");

		//tokens
		if (! KalturaConfig.config.tokens)
			throw new Error("No tokens configuration section is defined in configuration file");
		if (! KalturaConfig.config.tokens.key)
			throw new Error("No tokens [key] configuration parameter is defined in configuration file");
		if (!KalturaConfig.config.tokens.iv)
			throw new Error("No tokens [iv] configuration parameter is defined in configuration file");

		//queue
		if (! KalturaConfig.config.queue)
			throw new Error("No queue configuration section is defined in configuration file");
		if (! KalturaConfig.config.queue.queueName)
			throw new Error("No queue [queueName] configuration parameter is defined in configuration file");
		if (! KalturaConfig.config.queue.providers)
			throw new Error("No queue [providers] configuration parameter is defined in configuration file");

		//cache
		if (! KalturaConfig.config.cache)
			throw new Error("No cache configuration section is defined in configuration file");
		if (! KalturaConfig.config.cache.cacheTTL)
			throw new Error("No cache [cacheTTL] configuration parameter is defined in configuration file");
	}
}

module.exports = KalturaPushServerValidator;