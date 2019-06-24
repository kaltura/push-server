
const os = require('os');
const fs = require('fs');
const ini = require('node-ini');
const util = require('util');
const sync = require('promise-synchronizer');
const requestPromise = require('request-promise');

KalturaConfig = {
	config: null,
	configFiles: {},
	
	init: function(){
		if(process.argv.length > 2){
			this.config = JSON.parse(process.argv[2]);
		}
		else if(process.env.TCM_APP) {
			const cachePath = './config.json';
			try {
				if(fs.existsSync(cachePath)) {
					this.config = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
				}
				else {
					const tcmApp =  process.env.TCM_APP;
					const tcmUrl = process.env.TCM_URL || 'http://tcm:8080';
					const tcmAppId =  process.env.TCM_APP_ID || '5bf8cf60';
					const tcmAppSecret =  process.env.TCM_APP_SECRET || '5aaa99331c18f6bad4adeef93ab770c2';
					const tcmSection =  process.env.TCM_SECTION || 'config';
					const tcm = `${tcmUrl}/${tcmApp}/main/${tcmSection}?app_id=${tcmAppId}&app_secret=${tcmAppSecret}`;
				
					console.log(`TCM URL: ${tcm}`);
					this.config = sync(requestPromise({
						uri: tcm,
						json: true
					}));
					fs.writeFileSync(cachePath, JSON.stringify(this.config));
				}
			}   
			catch (err) {
				console.log(`Failed to load configuration from TCM: ${util.inspect(err)}`);
				process.exit(1);
			}
		}
		else{
			process.chdir(__dirname);
			var configDir = '../../config';
			var cacheDir = '../../cache';
	
			if (!fs.existsSync(cacheDir)) {
				fs.mkdirSync(cacheDir);
			}
	
			var files = fs.readdirSync(configDir);
			var This = this;
	
			var configData = '';
			var pattern = /.+\.ini$/;
			for ( var index in files) {
				if(!pattern.test(files[index]))
					continue;
				
				var filePath = configDir + '/' + files[index];
				configData += os.EOL;
				configData += fs.readFileSync(filePath, 'utf-8');
	
				fs.lstat(filePath, function(err, stats) {
					if (err) {
						KalturaLogger.error(err);
					} else {
						This.configFiles[filePath] = stats.mtime;
					}
				});
			}
	
			var cacheConfigPath = cacheDir + '/config.ini';
			fs.writeFileSync(cacheConfigPath, configData);
	
			this.config = ini.parseSync(cacheConfigPath);
		}

		if(process.env.VERSION) {
			if(!this.config.server) {
				this.config.server = {};
			}
			this.config.server.version = process.env.VERSION;
		}

		if(process.env.SOCKET_PORT) {
			if(!this.config.socketio) {
				this.config.socketio = {};
			}
			this.config.socketio.port = process.env.SOCKET_PORT;
		}

		if(process.env.DEMO_PORT && this.config.demo) {
			this.config.demo.port = process.env.DEMO_PORT;
		}

		if(process.env.LOG_PATH) {
			this.config.logger.logDir = process.env.LOG_PATH;
		}
	},

	watchFiles: function(callback) {
		setInterval(function(){
			var handled = false;
			for(var filePath in this.configFiles){
				fs.lstat(filePath, function(err, stats) {
					if(handled){
						return;
					}
					if (err) {
						KalturaLogger.error(err);
					} else {
						if(this.configFiles[filePath] < stats.mtime){
							handled = true;
							KalturaConfig.init();
							callback();
						}
					}
				});
			}
		}, 30000);
	}
};
KalturaConfig.init();

