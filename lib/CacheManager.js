require('./utils/KalturaConfig');
require('./utils/KalturaLogger');
const util = require('util');
const cron = require('cron');

class CacheManager {

    constructor () {
        let This = this;
        this.receivedMessagesIds = new Set();
        this.eventsCache = {};
        this.messagesTimingMap = []; // map from TTL (in milliseconds rounded by minute) to eventMap key that contains relevant message.

        //Initialize timer job every minute to handle cache cleaning.
        const cacheCleaner1Min = cron.job("0 * * * * *", function () {
            This._cleanPastMessages();
        });
        cacheCleaner1Min.start();
    }

    getMessages(eventKey, clientKey) {
        let res = [];
        let eventMap = this.eventsCache[eventKey];
        if (eventMap) {
            let messages = eventMap[clientKey];
            if (messages)
                res = messages;
        }
        return res;
    }

    _isDuplicate(messageId){
        return this.receivedMessagesIds.has(messageId);
    }

    _roundTimeByMinute(time) {
        const p = 60; // seconds in an minute
        return Math.round(time / p) * p;
    }

    _isInCacheTimeFrameWindow(messageTiming){
        if (this._getCacheTimeFrameWindow() <= this._roundTimeByMinute(messageTiming))
            return true;
        return false;
    }

    shouldHandleMessage(messageId, messageTiming)
    {
        if (this._isDuplicate(messageId)){
            KalturaLogger.debug("Duplicate Message detected - already in cache. ");
            return false;
        }
        if (!this._isInCacheTimeFrameWindow(messageTiming)){
            KalturaLogger.debug("Message passed cache time frame window. ");
            return false;
        }
        return true;
    }

    addMessageToCache(eventKey, eventMessageKey, messageId,  messageTiming, messageObj ){

        KalturaLogger.log("Adding Message To cache: [msgId- " + messageId + ", event key- " + eventKey + ", event message key-" + eventMessageKey + ", message timing- " + messageTiming +"]");

        messageTiming = this._roundTimeByMinute(messageTiming);
        let timingItem = {"eventKey": eventKey, "eventMessageKey": eventMessageKey};
        this._insertToTimingMap(messageTiming, timingItem);

        let eventMap = this.eventsCache[eventKey];
        if (!eventMap) {
            eventMap = {};
            this.eventsCache[eventKey] = eventMap;
        }

        let messages = eventMap[eventMessageKey];
        if (!messages) {
            messages = [];
            eventMap[eventMessageKey] = messages;
        }

        messages.push(messageObj);
        this.receivedMessagesIds.add(messageId);
    }

    _insertToTimingMap(ttl, element) {
        let length = this.messagesTimingMap.length;

        if (length == 0 || this.messagesTimingMap[length - 1].ttl < ttl) {
            //insert element (will insert either to first location or push after last location
            let elements = [];
            elements.push(element);
            let item = {"ttl": ttl, "items": elements};
            this.messagesTimingMap.push(item);
        }

        else //array is not empty and arrived ttl equals or less than the last ttl item\
        {
            //insert at last location if key doesn't already exists in items.
            if (!this._containsInTimingLocation(element, this.messagesTimingMap[length - 1].items))
                this.messagesTimingMap[length - 1].items.push(element);
        }
    }

    _containsInTimingLocation(element, array) {

        for (let i = 0; i < array.length; i++) {
            for (let key in element)
                if (array[i].hasOwnProperty(key) && array[i].key === element.key)
                    return true;
        }
        return false;
    }

    /***
     * Removes all messages for a specific event from recieved messages cache
     * and clear all items for a specific event from cache cache
     */
    clearEventFromCache(eventKey) {
        KalturaLogger.log("Clearing Cache for event key: " + eventKey);
        if (!eventKey || !this.eventsCache || !this.eventsCache[eventKey])
        {
            KalturaLogger.log("Clearing Cache didn't occur. Nothing to Clear...");
            return;
        }

        try {
            let eventKeyMap = this.eventsCache[eventKey];
            for (let eventKeyMapItem in eventKeyMap) {
                let messages = eventKeyMap[eventKeyMapItem];
                for (let i = 0; i < messages.length; i++)
                    this.receivedMessagesIds.delete(messages[i].msgId);
            }

            delete this.eventsCache[eventKey];
            KalturaLogger.log("Clearing Cache finished for event key: " +eventKey);
        }
        catch (err) {
            KalturaLogger.error("Error while clearing eventsCache " + util.inspect(err));
        }
    }

    /***
     * Cleaning the cache according to a ttl map that indicate for every minute in timeframe window
     * which specific event key maps have messages to remove.
     * How:
     * iterate acsending on ttl map (sorted by minute so if we pass the timeframe window we stop iterating):
     * if ttl key (indicated by the minute) has passed the timeframe window - go to relevant event
     * messages and clean messages that passed the timeframe window (messages are sorted by recieving order
     * so we stop when ttl is in timeframe window)
     * in addition:
     * 1. clean entire event route if no messages have left for event key
     * 2. clean entire event if no event keys are left for event
     * 3. remove deleted messages ids from received messagesIds array
     * @private
     */
    _cleanPastMessages() {
        KalturaLogger.debug("Starting Cache Cleaning Job.");
        try {

            let removedMessagesCount = 0;
            let ttlIndexesToRemove = 0;
            let cleanWindow = this._getCacheTimeFrameWindow();

            for (let ttlMapIndex = 0, ttlMapLength = this.messagesTimingMap.length; ttlMapIndex < ttlMapLength; ttlMapIndex++) {
                let ttl = this.messagesTimingMap[ttlMapIndex].ttl;

                if (cleanWindow < ttl) {
                    KalturaLogger.debug("No messages left out of timeframe window.");
                    break;
                }
                let eventKeysToClean = this.messagesTimingMap[ttlMapIndex].items;
                ttlIndexesToRemove++;
                KalturaLogger.debug("Cleaning ttl [" + ttl + "] with keys: " + util.inspect(eventKeysToClean));

                // for every event key in a specific ttl index - get messages from eventKey and clean messages that passed the timeframe
                for (let eventKeysIndex = 0; eventKeysIndex < eventKeysToClean.length; eventKeysIndex++) {
                    let eventKeyMap = this.eventsCache[eventKeysToClean[eventKeysIndex].eventKey];
                    if (!eventKeyMap)
                        break;

                    let messages = eventKeyMap[eventKeysToClean[eventKeysIndex].eventMessageKey];
                    if (!messages)
                        break;
                    KalturaLogger.debug("Removing messages : " + util.inspect(messages));
                    removedMessagesCount += this._removePassedMassges(messages, cleanWindow);

                    //if messages map is empty after deleting a message we can delete the map itself
                    if (messages.length == 0) {
                        delete eventKeyMap[eventKeysToClean[eventKeysIndex].eventMessageKey];
                    }
                    //if event messages map is empty after deleting we can remove the event.
                    if (Object.keys(eventKeyMap).length == 0) {
                        delete this.eventsCache[eventKeysToClean[eventKeysIndex].eventKey];
                    }
                }
            }
            // remove handled ttl frames from timing map
            this.messagesTimingMap.splice(0, ttlIndexesToRemove);
            KalturaLogger.debug("Finished cache cleaning job. Number of Items cleaned: " + removedMessagesCount);
        }
        catch(err)
        {
            KalturaLogger.error("Error cleaning cache. " + util.inspect(err));
        }
    }

    _getCacheTimeFrameWindow(){
        let cacheTTL = KalturaConfig.config.cache.cacheTTL;
        if (!cacheTTL)
        {
            throw new Error("cacheTTL is not configured in cache. please configure...");
        }
        return this._roundTimeByMinute((new Date).getTime() / 1000) - cacheTTL;
    }

    _removePassedMassges(messages, cleanWindow) {
        //find message indexes to remove from specific message list
        let messagesToRemove = [];
        let count = 0;
        for (let messageIndex = 0, Messageslength = messages.length; messageIndex < Messageslength; messageIndex++) {
            KalturaLogger.debug("msgTime " + this._roundTimeByMinute(messages[messageIndex].msgTime + " cleanWindow " + cleanWindow));
            if (this._roundTimeByMinute(messages[messageIndex].msgTime) > cleanWindow)
                break;
            messagesToRemove.push(messages[messageIndex]);
        }

        for (let index = 0, length = messagesToRemove.length; index < length; index++) {
            let actualIndex = messages.indexOf(messagesToRemove[index]);
            messages.splice(actualIndex, 1);
            this.receivedMessagesIds.delete(messagesToRemove[index].msgId);
            count++;
        }

        return count;
    }
}

module.exports = CacheManager;