const WebSocket = require('ws');
const Beautifier = require('./beautifier.js');
const _ = require('underscore');
const assert = require('assert');

class Stream {
    /**
     * @param {string} url - stream url
     * @param {string} path - stream path without url
     */
    constructor(url, path){
        /** @type {WebSocket} */
        this.ws = undefined;

        this.url = url;
        this.path = path;
        this.isAlive = false;
    }
    check(){
        if(!this.isAlive)
            return false;
        
        this.isAlive = false;
        this.ws.ping();
        return true;
    }
    start(){
        this.ws = new WebSocket(this.url + this.path);
        this.ws.on('ping', () => ws.pong());
        this.ws.on('pong', () => this.isAlive = true);
    }
    /**
     * Renew the stream without losing any data.
     */
    restart(){
        let new_ws = new WebSocket(this.url + this.path);
        new_ws.once('message', (msg) => {
            for(let eventName of this.ws.eventNames())
                for(let func of this.ws.listeners(eventName))
                    new_ws.addListener(eventName, func);
            
            this.close();
            this.isAlive = true;

            this.ws = new_ws;
            this.ws.emit('message', msg);
        });
    }
    
    close(){
        this.ws.terminate();
        this.isAlive = false;
    }
    delete(){
        this.close();
        this.ws.emit('delete');
    }
}
class BinanceWS {
    /**
     * 
     * @param {boolean} beautify 
     * @param {false|number} renew_streams - false = never renew strings, 
     *  number = streams renewed every (`renew_streams` * `heartbeat_interval`) ms
     *  eg: `renew_streams`=3 and `heartbeat_interval`=60000. streams will be renewed every 3 minutes
     * @param {number} heartbeat_interval 
     */
    constructor(beautify=false, heartbeat_interval=60000, renew_streams=30) {
        if(beautify)
            this.beautify = false;
        
        /**
         * @type {Map.<number, Stream>} 
         */
        this.streams = new Map();  
        /** last socket_index */
        this.lIndex = 0;   

        this.heartbeat_interval = setInterval(() => {
            for(let index of this.streams.keys()){
                if(!stream.check()){
                    stream.restart();
                }
            }
        }, heartbeat_interval);
    }
    _setupWebSocket(eventHandler, path, isCombined) {
        let index = ++this.lIndex;

        let url = (isCombined ? this._combinedBaseUrl : this._baseUrl);
        let stream = new Stream(url, path);
        stream.start();

        stream.ws.on('message', (message) => {
            let event;
            try {
                event = JSON.parse(message);
            } catch (e) {
                event = message;
            }
            if (this.beautify) {
                if (event.stream) {
                    event.data = this._beautifyResponse(event.data);
                } else {
                    event = this._beautifyResponse(event);
                }
            }

            eventHandler(event);
        });
        // self made event
        stream.ws.on('delete', () => this.streams.delete(index));
        
        stream.ws.on('error', (err) => {
            // node.js EventEmitters will throw and then exit if no error listener is registered
            console.log(err);
            stream.delete();
        });

        return stream;
    }

    _beautifyResponse(data) {
        if (_.isArray(data)) {
            return _.map(data, event => {
                if (event.e) {
                    return this._beautifier.beautify(event, event.e + 'Event');
                }
                return event;
            });
        } else if (data.e) {
            return this._beautifier.beautify(data, data.e + 'Event');
        }
        return data;
    }
    onDepthUpdate(symbol, eventHandler) {
        return this._setupWebSocket(eventHandler, this.streamTypes.depth(symbol));
    }

    onDepthLevelUpdate(symbol, level, eventHandler) {
        return this._setupWebSocket(eventHandler, this.streamTypes.depthLevel(symbol, level));
    }

    onKline(symbol, interval, eventHandler) {
        return this._setupWebSocket(eventHandler, this.streamTypes.kline(symbol, interval));
    }

    onAggTrade(symbol, eventHandler) {
        return this._setupWebSocket(eventHandler, this.streamTypes.aggTrade(symbol));
    }

    onTrade(symbol, eventHandler) {
        return this._setupWebSocket(eventHandler, this.streamTypes.trade(symbol));
    }

    onTicker(symbol, eventHandler) {
        return this._setupWebSocket(eventHandler, this.streamTypes.ticker(symbol));
    }

    onAllTickers(eventHandler) {
        return this._setupWebSocket(eventHandler, this.streamTypes.allTickers());
    }

    onUserData(binanceRest, eventHandler, interval = 60000) {
        this._binanceRest = binanceRest;
        return binanceRest.startUserDataStream()
            .then((response) => {
                userDataInterval = setInterval(() => {
                    /*
                     * Response is just an object with a single property of listenKey so we can
                     * just use it as the query object
                     */
                    binanceRest.keepAliveUserDataStream(response)
                        .catch((err) => {
                            if (this._options.verbose) {
                                console.error('Error sending keep alive for user data stream', err);
                            }
                        });

                }, interval);
                let ws = this._setupWebSocket(eventHandler, response.listenKey)
                ws.on('close', () => {
                    clearInterval(userDataInterval);
                    this._binanceRest.closeUserDataStream(response);
                });
            });
    }

    onCombinedStream(streams, eventHandler) {
        assert(_.isArray(streams) || _.isString(streams), 'streams must be an array or a string');

        if (_.isArray(streams)) {
            return this._setupWebSocket(eventHandler, streams.join('/'), true);
        }
        return this._setupWebSocket(streams);
    }
    destroy(){
        for(let stream of this.streams.values())
            stream.close();
        clearInterval(this.heartbeat_interval);
    }
}
/** if not set manually, every `BinanceWs` instance will share it */
BinanceWS.prototype._baseUrl = 'wss://stream.binance.com:9443/ws/';
BinanceWS.prototype._combinedBaseUrl = 'wss://stream.binance.com:9443/stream?streams=';

BinanceWS.prototype.streamTypes = {
    depth: (symbol) => `${symbol.toLowerCase()}@depth`,
    depthLevel: (symbol, level) => `${symbol.toLowerCase()}@depth${level}`,
    kline: (symbol, interval) => `${symbol.toLowerCase()}@kline_${interval}`,
    aggTrade: (symbol) => `${symbol.toLowerCase()}@aggTrade`,
    trade: (symbol) => `${symbol.toLowerCase()}@trade`,
    ticker: (symbol) => `${symbol.toLowerCase()}@ticker`,
    allTickers: () => '!ticker@arr'
};

BinanceWS.prototype._beautifier = new Beautifier();
BinanceWS.prototype.beautify = true;
module.exports = BinanceWS;
