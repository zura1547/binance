const WebSocket = require('ws');
const { EventEmitter } = require('events');

const Beautifier = require('./beautifier');

class Stream extends EventEmitter {
    /**
     * Binance WebSocket Stream
     * @param {string[]|string} path 
     * @param {boolean} beautify - should beautify responses or not
     * @param {string} url - custom url, if not set default will be used
     * @param {number} ping_interval - in milliseconds
     * @param {Beautifier} beautifier - Custom beautifier, if not set default will be used
     */
    constructor(
        path, 
        beautify = true, 
        url = false, 
        ping_interval = 30000,
        beautifier = false
    ){
        super();
        /** @type {WebSocket} */
        this.ws = undefined; 
        this._path = path;
        this._ping_interval = ping_interval;

        if(url) this.url = url;
        if(!beautify) this.beautify = false;
        if(beautifier) this.beautifier = beautifier;
    }
    /** @returns {string} */
    get path(){
        if(this._path instanceof Array) 
            return this._path.join('/');
        return this._path;
    }
    set path(val) { this._path = val; }
    _parseMessage(message){
        let event;
        try {
            event = JSON.parse(message);
        } catch (e) {
            event = message;
        }
        if (this.beautify) {
            if (event.stream) {
                event.data = this._beautifyMessage(event.data);
            } else {
                event = this._beautifyMessage(event);
            }
        }
        return event;
    }
    _beautifyMessage(data) {
        if (data instanceof Array) {
            let new_data = new Array(data.length)
            for(let i = 0; i < data.length; ++i)
                new_data[i] = event.e ? this.beautifier.beautify(event, event.e + 'Event') : event;

            return new_data;
        }
        else if (data.e)
            return this.beautifier.beautify(data, data.e + 'Event');
        return data;
    }
    _setupWebSocket(){
        let ws = new WebSocket(this.url + this.path);
        ws.on('message', (message) => {
            let parsed = this._parseMessage(message);
            this.emit('all', parsed);
            this.emit(parsed.eventType || parsed.e, parsed); 
        });
        ws.on('error', (err) => {});
        ws.on('close', () => this.close());
        return ws;
    }
    _setupPinger(ping_interval){
        let lastAlive = true;
        this.ws.on('pong', () => lastAlive = true);
        
        let pinger = setInterval(() => {
            if(this.ws){
                if(!lastAlive)
                    this.close();
                
                lastAlive = false;
                this.ws.ping();
            }
            else
                clearInterval(pinger);
            
        }, ping_interval);

    }
    /** 
     * Stream.restart alias
     * @param {number} - any falsy value will be ignored. default is value assigned in the constructor 
     * */
    start(ping_interval = false){
        return this.restart(ping_interval);
    }
    /**
     * start or restart streams
     * @param {number} ping_interval - any falsy value will be ignored. default is value assigned in the constructor 
     * @description Starts stream or renews streams without losing any data in a process.
     */
    restart(ping_interval = false){
        if(!this.ws){
            this.ws = this._setupWebSocket();
            if(ping_interval) this._ping_interval = ping_interval;
            this._setupPinger(this._ping_interval);
            return;
        }
        let new_ws = new WebSocket(this.url + this.path);
        new_ws.once('message', (msg) => {
            for(let eventName of this.ws.eventNames())
                for(let func of this.ws.listeners(eventName))
                    new_ws.addListener(eventName, func);
            this.close();

            this.ws = new_ws;
            this.ws.emit('message', msg);
        });
    }
    close(){
        if(this.ws){
            this.ws.terminate();
            this.ws = undefined;
            this.emit('close');
        }
    }
}

Stream.prototype.url = 'wss://stream.binance.com:9443/ws/';
Stream.prototype.beautify = true;
Stream.prototype.beautifier = new Beautifier();

Stream.prototype.types = {
    depth: (symbol) => `${symbol.toLowerCase()}@depth`,
    depthLevel: (symbol, level) => `${symbol.toLowerCase()}@depth${level}`,
    kline: (symbol, interval) => `${symbol.toLowerCase()}@kline_${interval}`,
    aggTrade: (symbol) => `${symbol.toLowerCase()}@aggTrade`,
    trade: (symbol) => `${symbol.toLowerCase()}@trade`,
    ticker: (symbol) => `${symbol.toLowerCase()}@ticker`,
    allTickers: () => '!ticker@arr'
};

module.exports = Stream;