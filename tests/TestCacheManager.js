const chai = require('chai');
const assert = require('chai').assert;
const util = require('util');
const CacheManager = require('../lib/CacheManager');

let eventKey1 = 'testEvent1';
let eventKey2 = 'testEvent2';
let eventMapKey1 = 'testEvent1_c1';
let eventMapKey2 = 'testEvent1_c2';
let eventKeyDummy = 'dummy';
let eventMapKeyDummy = 'dummy';

let testTime = ((new Date).getTime() / 1000);
let messageObj1 = {"data":{"code":"testCode1"},"queueName":eventKey1, "queueKey":eventMapKey1,"msgId":"1","msgTime":testTime};
let messageObj2 = {"data":{"code":"testCode2"},"queueName":eventKey1, "queueKey":eventMapKey1,"msgId":"2","msgTime":testTime};
let messageObj3 = {"data":{"code":"testCode3"},"queueName":eventKey1, "queueKey":eventMapKey2,"msgId":"3","msgTime":testTime};
let messageObj4 = {"data":{"code":"testCode4"},"queueName":eventKey2, "queueKey":eventKey2,"msgId":"4","msgTime":testTime};

describe('CacheManager Test ', function () {
    it('test - get messages from cache', function () {

        let cacheManager = new CacheManager();

        cacheManager.addMessageToCache(messageObj1.queueName, messageObj1.queueKey, messageObj1.msgId, messageObj1.msgTime, messageObj1);
        cacheManager.addMessageToCache(messageObj2.queueName, messageObj2.queueKey, messageObj2.msgId, messageObj2.msgTime, messageObj2);
        cacheManager.addMessageToCache(messageObj3.queueName, messageObj3.queueKey, messageObj3.msgId, messageObj3.msgTime, messageObj3);
        cacheManager.addMessageToCache(messageObj4.queueName, messageObj4.queueKey, messageObj4.msgId, messageObj4.msgTime, messageObj4);

        let res;
        //should return messageObj1 and messageObj2
        res = cacheManager.getMessages(eventKey1, eventMapKey1);
        assert.deepEqual(res, [messageObj1, messageObj2]);

        //should return messageObj3
        res = cacheManager.getMessages(eventKey1, eventMapKey2);
        assert.deepEqual(res, [messageObj3]);

        //should return messageObj4
        res = cacheManager.getMessages(eventKey2, eventKey2);
        assert.deepEqual(res, [messageObj4]);

        //should return []
        res = cacheManager.getMessages(eventKey2, eventMapKeyDummy);
        assert.deepEqual(res, []);

        //should return []
        res = cacheManager.getMessages(eventKeyDummy, eventMapKeyDummy);
        assert.deepEqual(res, []);

        //validate cacheManager.receivedMessagesIds
        let ids = [messageObj1.msgId, messageObj2.msgId, messageObj3.msgId, messageObj4.msgId];
        for (let i = 0 ; i < ids.length; i++){
            assert.equal(cacheManager.receivedMessagesIds.has(ids[i]), true);
        }


        //validate cacheManager.messagesTimingMap
        assert.equal(cacheManager.messagesTimingMap.length,1)
        assert.equal(cacheManager.messagesTimingMap[0].ttl,cacheManager._roundTimeByMinute(testTime));

    });

    it('test - should Handle Message', function () {

        let cacheManager = new CacheManager();

        cacheManager.addMessageToCache(messageObj1.queueName, messageObj1.queueKey, messageObj1.msgId, messageObj1.msgTime, messageObj1);

        //should find id in cache duplicate
        assert.equal(cacheManager.shouldHandleMessage(messageObj1.msgId), false);

        //should not find id in cache but in time frame
        assert.equal(cacheManager.shouldHandleMessage("12345", ((new Date).getTime() / 1000 )), true);

        //should not find id in cache but not in time frame
        assert.equal(cacheManager.shouldHandleMessage("12345", 1), false);

        //validate cacheManager.receivedMessagesIds
        assert.equal(cacheManager.receivedMessagesIds.has(messageObj1.msgId),true);

    });


    it('test - clearEventFromCache', function () {

        let cacheManager = new CacheManager();

        cacheManager.addMessageToCache(messageObj1.queueName, messageObj1.queueKey, messageObj1.msgId, messageObj1.msgTime, messageObj1);
        cacheManager.addMessageToCache(messageObj2.queueName, messageObj2.queueKey, messageObj2.msgId, messageObj2.msgTime, messageObj2);
        cacheManager.addMessageToCache(messageObj3.queueName, messageObj3.queueKey, messageObj3.msgId, messageObj3.msgTime, messageObj3);
        cacheManager.addMessageToCache(messageObj4.queueName, messageObj4.queueKey, messageObj4.msgId, messageObj4.msgTime, messageObj4);

        cacheManager.clearEventFromCache(eventKey1);

        //should return []
        let res = cacheManager.getMessages(eventKey1, eventMapKey1);
        assert.deepEqual(res, []);

        //should return []
        res = cacheManager.getMessages(eventKey1, eventMapKey2);
        assert.deepEqual(res, []);

        //should return messageObj3
        res = cacheManager.getMessages(eventKey2, eventKey2);
        assert.deepEqual(res, [messageObj4]);

        //validate cacheManager.receivedMessagesIds
        assert.equal(cacheManager.receivedMessagesIds.has(messageObj1.msgId), false);
        assert.equal(cacheManager.receivedMessagesIds.has(messageObj2.msgId), false);
        assert.equal(cacheManager.receivedMessagesIds.has(messageObj3.msgId), false);
        assert.equal(cacheManager.receivedMessagesIds.has(messageObj4.msgId), true);

        //validate cacheManager.messagesTimingMap
        assert.equal(cacheManager.messagesTimingMap.length,1)
        assert.equal(cacheManager.messagesTimingMap[0].ttl,cacheManager._roundTimeByMinute(testTime));

    });

    it('test - cleanPastMessages', function () {
        let cacheManager = new CacheManager();

        let msgObj1 = {
            "data": {"code": "testCode1"},
            "queueName": eventKey1,
            "queueKey": eventMapKey1,
            "msgId": "1",
            "msgTime": 1
        };
        let msgObj2 = {
            "data": {"code": "testCode2"},
            "queueName": eventKey1,
            "queueKey": eventMapKey1,
            "msgId": "2",
            "msgTime": ((new Date).getTime() / 1000)
        };
        let msgObj3 = {
            "data": {"code": "testCode3"},
            "queueName": eventKey1,
            "queueKey": eventMapKey2,
            "msgId": "3",
            "msgTime": 3
        };
        let msgObj4 = {
            "data": {"code": "testCode4"},
            "queueName": eventKey2,
            "queueKey": eventKey2,
            "msgId": "4",
            "msgTime": ((new Date).getTime() / 1000)
        };

        cacheManager.addMessageToCache(msgObj1.queueName, msgObj1.queueKey, msgObj1.msgId, msgObj1.msgTime, msgObj1);
        cacheManager.addMessageToCache(msgObj2.queueName, msgObj2.queueKey, msgObj2.msgId, msgObj2.msgTime, msgObj2);
        cacheManager.addMessageToCache(msgObj3.queueName, msgObj3.queueKey, msgObj3.msgId, msgObj3.msgTime, msgObj3);
        cacheManager.addMessageToCache(msgObj4.queueName, msgObj4.queueKey, msgObj4.msgId, msgObj4.msgTime, msgObj4);

        //validate cacheManager.messagesTimingMap
        assert.equal(cacheManager.messagesTimingMap.length,2)
        assert.equal(cacheManager.messagesTimingMap[0].ttl,cacheManager._roundTimeByMinute(1));
        assert.equal(cacheManager.messagesTimingMap[1].ttl,cacheManager._roundTimeByMinute(testTime));

        cacheManager._cleanPastMessages();

        //should return false since it should not exist since we deleted it
        assert.equal(cacheManager.receivedMessagesIds.has(msgObj1.msgId), false);

        //all 3 should return true since their ids should not been deleted
        assert.equal(cacheManager.receivedMessagesIds.has(msgObj2.msgId), true);
        assert.equal(cacheManager.receivedMessagesIds.has(msgObj3.msgId), true);
        assert.equal(cacheManager.receivedMessagesIds.has(msgObj4.msgId), true);

        //will return false since clean window has passed
        assert.equal(cacheManager.shouldHandleMessage(msgObj1.msgId), false);

        //all 3 should return false since their ids exists
        assert.equal(cacheManager.shouldHandleMessage(msgObj2.msgId), false);
        assert.equal(cacheManager.shouldHandleMessage(msgObj3.msgId), false);
        assert.equal(cacheManager.shouldHandleMessage(msgObj4.msgId), false);

        assert.equal(cacheManager.messagesTimingMap.length,1);
        assert.equal(cacheManager.messagesTimingMap[0].ttl,cacheManager._roundTimeByMinute(testTime));
    });
});