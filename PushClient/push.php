<?php
$serviceUrl = 'localhost:8081';
//$notificationSystemName = 'Push_New_Cue_Point_Created';
$partnerId = $_GET['partnerId'];
$entryId = $_GET['entryId']; 
$secret = $_GET['secret'];
$metadataProfileId = $_GET['metadataProfileId'];

//$sessionUrl = "$serviceUrl/api_v3/service/session/action/startWidgetSession/format/1/widgetId/_{$partnerId}";
//$json = json_decode(file_get_contents($sessionUrl));
//$widgetKS = $json->ks;

//$sessionUrl = "$serviceUrl/api_v3/service/session/action/start/format/1/secret/$secret/partnerId/$partnerId";
$userKS = 'fsadfasdfasf';

//$registerUrl = "$serviceUrl/api_v3/service/eventNotification_eventNotificationTemplate/action/register/format/1/ks/$widgetKS/notificationTemplateSystemName/$notificationSystemName?userParamsArray:0:objectType=KalturaEventNotificationParameter&userParamsArray:0:key=entryId&userParamsArray:0:value:objectType=KalturaStringValue&userParamsArray:0:value:value=$entryId";
$registerUrl = 'f';

?>
<html>
<head>
	<script src="http://chat.socket.io/socket.io/socket.io.js" type="text/javascript"></script>
	<script src="http://code.jquery.com/jquery-1.11.1.js"></script>
	<script>

	var ks = "<?php echo $userKS; ?>";
	var entryId = "<?php echo $entryId; ?>";
	//var partnerId = <?php echo $partnerId; ?>;
	var serviceUrl = "<?php echo $serviceUrl; ?>";
	var metadataProfileId = <?php echo $metadataProfileId; ?>;
	
	var kdp;
	
	function addMessage(message){
		var dt = new Date();
		var time = dt.getHours() + ":" + dt.getMinutes() + ":" + dt.getSeconds();
		$('#messages').append($('<li>').text(time + " " + message));
	}

	function connect(url, key){
		addMessage("Connecting...");
		
		var socket = io.connect(url);
		socket.on('validated', function(){
			addMessage("Connected to socket.");
			socket.emit('listen', key);
		});

		socket.on('connected', function(queueKey){
			addMessage("Listening to queue.");
		});
	  
		socket.on('message', function(queueKey, msg){
			addMessage("[" + queueKey + "]: " +  String.fromCharCode.apply(null, new Uint8Array(msg.data)));
		});
	  
		socket.on('errorMsg', function(reason){
			addMessage('Error: ' + reason);
		});
	}
	
	function register(url){
		addMessage("Registering...");
		$.ajax({
			url: url,
			data: {},
			dataType: "json",
			timeout: 120000,
			success: function(data){
				if(data.code && data.message){
					alert(data.message);
				}
				else {
					connect(data.url, data.key);
				}
			},
			error: function(jqXHR, textStatus, errorThrown){
				alert(errorThrown.message);
			}
		});
	}
	
	function getPlayerOffset(){
		return kdp.evaluate('{video.player.currentTime}') * 1000;
	}
	
	function addAnnotation(text, offset, choice, freeText){
		var addCuePoint = {
			service: 'cuepoint_cuepoint',
			action: 'add',
			cuePoint: {
				objectType: 'KalturaAnnotation',
				entryId: entryId,
				isPublic: true,
				text: text,
				startTime: offset
			}
		};
		var addMetadata = {
			service: 'metadata_metadata',
			action: 'add',
			metadataProfileId: metadataProfileId,
			objectType: 'annotationMetadata.Annotation',
			objectId: '{0:result:id}',
			xmlData: '<metadata><Choice>' + choice + '</Choice><FreeText>' + freeText + '</FreeText></metadata>'
		};
		var multiRequest = {
			ks: ks,
			format: 1,
			0: addCuePoint,
			1: addMetadata,
		};
		
		$.ajax({
			url: serviceUrl + '/api_v3/service/multirequest',
			timeout: 120000,
			dataType: "json",
			method : "post",
			contentType: "application/json",
			data: JSON.stringify(multiRequest),
			success: function(data){
				if(data.code && data.message){
					alert(data.message);
				}
				else {
					addMessage("Annotation created [" + data.id + "] using API.");
				}
			},
			error: function(jqXHR, textStatus, errorThrown){
				alert(errorThrown);
			}
		});
	}

	$(document).ready(function() {

		register('<?php echo $registerUrl; ?>');
		
		$('#addAnnotation').click(function(){
			addAnnotation(
				$('#annotation').val(), 
				$('#offset').val(), 
				$('#choice').val(), 
				$('#freeText').val());
		});
		
	//	kWidget.addReadyCallback(function(playerId){
		//	kdp = document.getElementById(playerId);
	//	});
		
	});
	
	</script>
</head>
<body>
	<table>
		<tr>
			<td>Annotation:</td>
			<td><input id="annotation" /></td>
		</tr>
		<tr>
			<td>Offset:</td>
			<td><input id="offset" value="3000" /></td>
		</tr>
		<tr>
			<td>Metadata Choice:</td>
			<td>
				<select id="choice">
					<option value="on">on</option>
					<option value="off">off</option>
				</select>
			</td>
		</tr>
		<tr>
			<td>Metadata Free Text:</td>
			<td><input id="freeText" value="free text 1234" /></td>
		</tr>
		<tr>
			<td colspan="2"><input type="button" id="addAnnotation" value="Add" /></td>
		</tr>
	</table>
    <ul id="messages"></ul>	
</body>