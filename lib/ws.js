const WebSocket = require('ws');
const Beautifier = require('./beautifier.js');
const _ = require('underscore');
const assert = require('assert');

class BinanceWS {

    constructor({ disableBeautification, reconnect, logger }) {
        this._baseUrl = 'wss://stream.binance.com:9443/ws/';
        this._combinedBaseUrl = 'wss://stream.binance.com:9443/stream?streams=';
        this._sockets = {};
        this._beautifier = new Beautifier();
        this._logger = logger;

        this.disableBeautification = disableBeautification;
        this.reconnect = reconnect;
        this.streams = {
            depth: (symbol) => `${symbol.toLowerCase()}@depth`,
            depthLevel: (symbol, level) => `${symbol.toLowerCase()}@depth${level}`,
            kline: (symbol, interval) => `${symbol.toLowerCase()}@kline_${interval}`,
            aggTrade: (symbol) => `${symbol.toLowerCase()}@aggTrade`,
            trade: (symbol) => `${symbol.toLowerCase()}@trade`,
            ticker: (symbol) => `${symbol.toLowerCase()}@ticker`,
            allTickers: () => '!ticker@arr'
        };
    }

    _setupWebSocket(eventHandler, path, isCombined) {
        if (this._sockets[path]) {
            return this._sockets[path];
        }
        path = (isCombined ? this._combinedBaseUrl : this._baseUrl) + path;
        const ws = new WebSocket(path);

        ws.on('message', (message) => {
            let event;
            try {
                event = JSON.parse(message);
            } catch (e) {
                event = message;
            }
            if (this._beautify) {
                if (event.stream) {
                    event.data = this._beautifyResponse(event.data);
                } else {
                    event = this._beautifyResponse(event);
                }
            }

            eventHandler(event);
        });

        ws.on('error', () => {
            // node.js EventEmitters will throw and then exit if no error listener is registered
        });

        return ws;
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

    _closeWebSocket(path) {
        const ws = this._sockets[path];
        ws.terminate();
    }

    onDepthUpdate(symbol, eventHandler) {
        return this._setupWebSocket(eventHandler, this.streams.depth(symbol));
    }

    offDepthUpdate(symbol) {
        this._closeWebSocket(this.streams.depth(symbol));
    }

    onDepthLevelUpdate(symbol, level, eventHandler) {
        return this._setupWebSocket(eventHandler, this.streams.depthLevel(symbol, level));
    }

    offDepthLevelUpdate(symbol, level) {
        this._closeWebSocket(this.streams.depthLevel(symbol, level));
    }

    onKline(symbol, interval, eventHandler) {
        return this._setupWebSocket(eventHandler, this.streams.kline(symbol, interval));
    }

    offKline(symbol, interval) {
        this._closeWebSocket(this.streams.kline(symbol, interval));
    }

    onAggTrade(symbol, eventHandler) {
        return this._setupWebSocket(eventHandler, this.streams.aggTrade(symbol));
    }

    offAggTrade(symbol) {
        this._closeWebSocket(this.streams.aggTrade(symbol));
    }

    onTrade(symbol, eventHandler) {
        return this._setupWebSocket(eventHandler, this.streams.trade(symbol));
    }

    offTrade(symbol) {
        this._closeWebSocket(this.streams.trade(symbol));
    }

    onTicker(symbol, eventHandler) {
        return this._setupWebSocket(eventHandler, this.streams.ticker(symbol));
    }

    offTicker(symbol) {
        this._closeWebSocket(this.streams.ticker(symbol));
    }

    onAllTickers(eventHandler) {
        return this._setupWebSocket(eventHandler, this.streams.allTickers());
    }

    offAllTickers() {
        this._closeWebSocket(this.streams.allTickers());
    }

    onUserData(binanceRest, eventHandler, interval = 60000) {
        this._binanceRest = binanceRest;
        return binanceRest.startUserDataStream()
            .then((response) => {
                this._userDataListenKey = response.listenKey;
                this._userDataInterval = setInterval(() => {

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
                return this._setupWebSocket(eventHandler, response.listenKey);
            });
    }

    offUserData() {
        if (this._userDataInterval === -1) {
            throw new Error('No user data stream exists');
        }

        clearInterval(this._userDataInterval);
        this._userDataInterval = -1;
        return this._binanceRest.closeUserDataStream({ listenKey: this._userDataListenKey });
    }

    onCombinedStream(streams, eventHandler) {
        assert(_.isArray(streams) || _.isString(streams), 'streams must be an array or a string');

        if (_.isArray(streams)) {
            return this._setupWebSocket(eventHandler, streams.join('/'), true);
        }
        return this._setupWebSocket(streams);
    }

    offCombinedStream(streams) {
        assert(_.isArray(streams) || _.isString(streams), 'streams must be an array or a string');

        if (_.isArray(streams)) {
            this._closeWebSocket(streams.join('/'));
        } else {
            this._closeWebSocket(streams);
        }
    }

}

module.exports = BinanceWS;
