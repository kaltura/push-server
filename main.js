var ConnectionManager = require('./lib/ConnectionManager');
var DemoManager = require('./lib/DemoManager');

require('./lib/utils/KalturaConfig');
require('./lib/utils/KalturaLogger');

function KalturaMainProcess(){
	this.start();
};

KalturaMainProcess.prototype.start = function() {
	var version = KalturaConfig.config.server.version;
	KalturaLogger.log('\n\n_____________________________________________________________________________________________');
	KalturaLogger.log('Push-Server ' + version + ' started');
	
	if(KalturaConfig.config.demo) {
		var demo = new DemoManager();
	}
	var conn = new ConnectionManager();
};

module.exports.KalturaMainProcess = KalturaMainProcess;

var KalturaProcess = new KalturaMainProcess();
