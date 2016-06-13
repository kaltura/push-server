<%@ Page Language="C#" AutoEventWireup="true" CodeBehind="default.aspx.cs" Inherits="PushClient._default" %>

<!DOCTYPE html>

<html>
<head>
    <title></title>
    <script src="http://chat.socket.io/socket.io/socket.io.js" type="text/javascript"></script>
    <script src="http://code.jquery.com/jquery-1.11.1.js"></script>
    <script>

        // get GET parameters
        var getUrlParameter = function getUrlParameter(sParam) {
            var sPageURL = decodeURIComponent(window.location.search.substring(1)),
                sURLVariables = sPageURL.split('&'),
                sParameterName,
                i;

            for (i = 0; i < sURLVariables.length; i++) {
                sParameterName = sURLVariables[i].split('=');

                if (sParameterName[0] === sParam) {
                    return sParameterName[1] === undefined ? true : sParameterName[1];
                }
            }
        };

        //var demoRegistrationBaseUrl = 'http://localhost:8082/?key=aabb&token=aaaa';
        //var demoRegistrationBaseUrl = 'http://localhost:8082/';
        //var prodBaseConncetUrl = 'http://localhost:8089/'

        function addMessage(message) {
            var dt = new Date();
            var time = dt.getHours() + ":" + dt.getMinutes() + ":" + dt.getSeconds();
            $('#messages').append($('<li>').text(time + " " + message));
        }

        function ConnectToProd() {

            if (jQuery('#pushProdUrl').val().trim() == "") {
                addMessage("Please enter push URL")
                return;
            }

            if (jQuery('#key').val().trim() == "") {
                addMessage("Please enter key")
                return;
            }

            var url = jQuery('#pushProdUrl').val();
            var key = jQuery('#key').val();

            connect(url, key);
        }

        function connect(url, key) {
            addMessage("Connecting...");

            var socket = io.connect(url);
            socket.on('validated', function () {
                addMessage("Connected to socket.");
                socket.emit('listen', key);
            });

            socket.on('connected', function (queueKey) {
                addMessage("Listening to queue.");
            });

            socket.on('message', function (queueKey, msg) {
                addMessage("[" + queueKey + "]: " + String.fromCharCode.apply(null, new Uint8Array(msg.data)));
            });

            socket.on('errorMsg', function (reason) {
                addMessage('Error: ' + reason);
            });
        }

        function DemoRegistration() {

            if (jQuery('#demoQueue').val().trim() == "") {
                addMessage("Please enter a queue")
                return;
            }

            if (jQuery('#demoSecret').val().trim() == "") {
                addMessage("Please enter secret")
                return;
            }

            if (jQuery('#demoProdBaseUrl').val().trim() == "") {
                addMessage("Please enter demo push base URL")
                return;
            }

            var url = 'http://' + jQuery('#demoProdBaseUrl').val() + '?key=' + jQuery('#demoQueue').val() + '&token=' + jQuery('#demoSecret').val();

            addMessage("Registering...");
            $.ajax({
                url: url,
                dataType: "json",
                crossDomain: true,
                timeout: 120000,
                success: function (data) {
                    if (data.code && data.message) {
                        alert(data.message);
                    }
                    else {
                        connect(data.url, data.key);
                    }
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    alert(errorThrown.message);
                }
            });
        }

        $(document).ready(function () {
        });

    </script>
</head>
<body>


    <form id="form2" runat="server">

        <h3>Demo</h3>
        Base URL:
        <input type="text" id="demoProdBaseUrl" name="demoProdBaseUrl" value="localhost:8082"><br>
        Secret:
        <input type="text" id="demoSecret" name="demoSecret" value="aaaa"><br>
        Queue:
        <input type="text" id="demoQueue" name="demoQueue" value="aabb"><br>
        <input type="button" value="Connect" onclick="DemoRegistration()">


        <h3>Prod</h3>
        URL:
        <textarea id="pushProdUrl" name="pushProdUrl" rows="8" cols="80"></textarea><br />
        Key:
        <textarea id="key" name="Key" rows="8" cols="80"></textarea><br />
        <input type="button" value="Connect" onclick="ConnectToProd()">
        <div>
            <ul id="messages"></ul>
        </div>
    </form>


</body>
</html>

