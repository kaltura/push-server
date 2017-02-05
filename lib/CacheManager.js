require('./utils/KalturaConfig');
require('./utils/KalturaLogger');
const util = require('util');

class CacheManager {

    constructor () {
        this.receivedMessagesIds = new Set();
        this.eventsCache = {};
        this.messagesTimingMap = []; // map from TTL (in milliseconds rounded by minute) to eventMap key that contains relevant message.
    }

    getMessages(clientKey, eventKey) {
        let res = [];
        let eventMap = this.eventsCache[eventKey];
        if (eventMap) {
            let messages = eventMap[clientKey];
            if (messages)
                return messages;
        }
        return res;
    }

    isDuplicate(messageId){
        if (this.receivedMessagesIds.has(messageId)) {
            return true;
        }
        return false;
    }

    roundTimeByMinute(time) {
        var p = 60 * 1000; // milliseconds in an minute
        return Math.round(time / p) * p;
    }

    addMessageToCache(eventKey, eventMessageKey, messageId,  messageTiming, messageObj ){

        KalturaLogger.log("Adding Message: " + messageId + " To cache for event key: " + eventMessageKey);

        messageTiming = this.roundTimeByMinute(messageTiming);
        var timingItem = {"eventKey": eventKey, "eventMessageKey": eventMessageKey};
        this.insertToArray(messageTiming, timingItem, this.messagesTimingMap);

        var eventMap = this.eventsCache[eventKey];
        if (!eventMap) {
            eventMap = {};
            this.eventsCache[eventKey] = eventMap;
        }

        var messages = eventMap[eventMessageKey];
        if (!messages) {
            messages = [];
            eventMap[eventMessageKey] = messages;
        }

        messages.push(messageObj);
        this.receivedMessagesIds.add(messageId);
    }

    insertToArray(ttl, element, array) {
        // !erray.empty  && ttl <= array[last].ttl
        // insrtIfnotExist at array[last]
        // else push_back new entry into array

        var location;
        if (array.length === 0) {
            location = -1;
        }
        else {
            if (array[array.length - 1].ttl <= ttl)
                location = array.length - 1;
            else
                location = this.locationOfItem(ttl, array);
        }
        if (location != -1 && array[location].ttl == ttl) {
            if (!this.containsInArray(element, array[location].items))
                array[location].items.push(element);
        }
        else {
            var elements = [];
            elements.push(element);
            var item = {"ttl": ttl, "items": elements}
            array.splice(location + 1, 0, item);
        }
    }

    containsInArray(element, array) {

        for (var i = 0; i < array.length; i++) {
            for (var key in element)
                if (array[i].hasOwnProperty(key) && array[i].key === element.key)
                    return true;
        }
        return false;
    }

    locationOfItem(element, array, start, end) {
        if (array.length === 0)
            return -1;

        start = start || 0;
        end = end || array.length;
        var pivot = parseInt(start + (end - start) / 2, 10);
        if (array[pivot].ttl === element)
            return pivot;
        if (end - start <= 1) {
            if (array[pivot].ttl > element)
                return pivot - 1;
            else return pivot;
        }
        if (array[pivot].ttl < element) {
            return this.locationOfItem(element, array, pivot, end);
        } else {
            return this.locationOfItem(element, array, start, pivot);
        }
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
            var idsToRemove = [];
            var eventKeyMap = this.eventsCache[eventKey];
            for (var eventKeyMapItem in eventKeyMap) {
                let messages = eventKeyMap[eventKeyMapItem];
                for (let i = 0; i < messages.length; i++)
                    idsToRemove.push(messages[i].messageId);
            }
            for (let i = 0; i < idsToRemove.length; i++)
                this.receivedMessagesIds.delete(idsToRemove[i]);

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

        let cacheTTL = KalturaConfig.config.cache.cacheTTL;
        let removedMessagesCount = 0;
        if (!cacheTTL)
        {
            KalturaLogger.warn("cacheTTL is not configured in cache. please configure...");
            return;
        }

        try {
            let cleanWindow = this.roundTimeByMinute((new Date).getTime()) - cacheTTL;
            let objectsToRemove = [];

            for (let ttlMapIndex = 0, ttlMapLength = messagesTimingMap.length; ttlMapIndex < ttlMapLength; ttlMapIndex++) {
                let ttl = this.messagesTimingMap[ttlMapIndex].ttl;

                if (cleanWindow < ttl) {
                    KalturaLogger.debug("No messages left out of timeframe window.");
                    break;
                }

                let eventKeysToClean = this.messagesTimingMap[ttlMapIndex].items;
                objectsToRemove.push(this.messagesTimingMap[ttlMapIndex]);

                // for every event key in a specific ttl index - get messages from eventKey and clean messages that passed the timeframe
                for (let eventKeysIndex = 0; eventKeysIndex < eventKeysToClean.length; eventKeysIndex++) {
                    let eventKeyMap = this.eventsCache[eventKeysToClean[eventKeysIndex].eventKey];
                    if (!eventKeyMap)
                        break;

                    let messages = eventKeyMap[eventKeysToClean[eventKeysIndex].eventMessageKey];
                    if (!messages)
                        break;

                    removedMessagesCount += this.removePassedMassges(messages, cleanWindow);

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
            let numOfObjectToRemove = objectsToRemove.length;
            for (let index = 0; index < numOfObjectToRemove; index++) {
                var objectsToRemoveIndex = messagesTimingMap.indexOf(objectsToRemove[index]);
                this.messagesTimingMap.splice(objectsToRemoveIndex, 1);
            }
            KalturaLogger.debug("Finished cache cleaning job. Number of Items cleaned: " + removedMessagesCount);
        }
        catch(err)
        {
            KalturaLogger.error("Error cleaning cache. " + util.inspect(err));
        }
    }

    removePassedMassges(messages, cleanWindow) {
        //find message indexes to remove from specific message list
        let messagesToRemove = [];
        let count = 0;
        for (let messageIndex = 0, Messageslength = messages.length; messageIndex < Messageslength; messageIndex++) {
            if (this.roundTimeByMinute(messages[messageIndex].messageTiming) > cleanWindow)
                break;
            messagesToRemove.push(messages[messageIndex]);
        }

        for (let index = 0, length = messagesToRemove.length; index < length; index++) {
            let actualIndex = messages.indexOf(messagesToRemove[index]);
            messages.splice(actualIndex, 1);
            this.receivedMessagesIds.delete(messagesToRemove[index].messageId);
            count++;
        }

        return count;
    }
}

module.exports = CacheManager;