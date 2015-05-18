var ConnectionManager = require('./lib/ConnectionManager');

require('./lib/utils/KalturaConfig');
require('./lib/utils/KalturaLogger');

function KalturaMainProcess(){
	this.start();
};

KalturaMainProcess.prototype.start = function() {
	var version = KalturaConfig.config.server.version;
	KalturaLogger.log('\n\n_____________________________________________________________________________________________');
	KalturaLogger.log('Push-Server ' + version + ' started');
	
	var conn = new ConnectionManager();
};

module.exports.KalturaMainProcess = KalturaMainProcess;

var KalturaProcess = new KalturaMainProcess();