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
        this.status = Stream.CLOSED;
        this._path = path;
        this._ping_interval = ping_interval;

        if(url) this.url = url;
        if(!beautify) this.beautify = false;
        if(beautifier) this.beautifier = beautifier;
    }
    get isPending() { return (this.status === Stream.PENDING); }
    get isOpen() { return(this.status === Stream.OPEN); }
    get isClosed() { return (this.status === Stream.CLOSED); }
    get full_path(){ return this.url + this.path; }
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
        let ws = new WebSocket(this.full_path);
        ws.on('message', (message) => {
            let parsed = this._parseMessage(message);
            this.emit('all', parsed);
            this.emit(parsed.eventType || parsed.e, parsed); 
        });
        ws.on('error', (err) => {});
        ws.on('open', () => this._open());
        ws.on('close', () => this._close(ws));

        return ws;
    }
    /**
     * 
     * @param {number} ping_interval 
     * @description Till the stream is closed, same pinger will be used
     */
    _setupPinger(ping_interval){
        let lastAlive = true;
        
        this._pinger = setInterval(() => {
            if(!lastAlive)
                return this._close();
            
            lastAlive = false;
            this.ws.ping();
        }, ping_interval);

        this.once('close', () => clearInterval(this._pinger));
        this.ws.on('pong', () => lastAlive = true);
    }
    /** 
     * Stream.restart alias
     * @param {number} ping_interval - any falsy value will be ignored. 
     * default is assigned in the constructor 
     * */
    start(ping_interval = false){
        return this.restart(ping_interval);
    }
    /**
     * start or restart streams
     * @param {number} ping_interval - assigning it won't change ping interval during a restart.
     * Instead close and start with new ping_interval.
     * @description Starts stream or renews streams without losing any data in a process.
     */
    restart(ping_interval = false){
        if(this.isPending)
            return;
        this.status = Stream.PENDING;
        if(!this.ws){
            this.ws = this._setupWebSocket();
            if(ping_interval) this._ping_interval = ping_interval;
            this._setupPinger(this._ping_interval);
            return;
        }
        let new_ws = new WebSocket(this.full_path);

        new_ws.once('open', () => {
            if(this.isPending){
                for(let eventName of this.ws.eventNames())
                for(let func of this.ws.listeners(eventName))
                    new_ws.addListener(eventName, func);
                let oldws = this.ws;
                this.ws = new_ws;

                this._close(oldws);
                this._restart();
            }
        });
    }
    _open(){
        this.status = Stream.OPEN;
        this.emit('open');
    }
    _restart(){
        this.status = Stream.OPEN;
        this.emit('restart');
    }
    _close(ws = this.ws){
        ws.removeAllListeners('close'); // so that this close function won't be called again
        ws.terminate();
        if(this.ws === ws){
            this.ws = undefined;
            this.emit('close');
            this.status = Stream.CLOSED;
        }
    }
    close(){
        if(this.isPending){
            // if it was closing then do nothing,
            // if it was opening, wait till it opens and close the stream
            let f1 = null, f2 = null;
            f1 = () => { 
                this.removeListener('open', f2)
                this._close(); 
            };
            f2 = () => this.removeListener('close', f1);

            this.once('open', f1);
            this.once('close', f2);
        }
        else if(!this.isClosed)
            this._close();
    }
}

// statuses
Stream.CLOSED = 0;
Stream.OPEN = 1;
Stream.PENDING = 2;

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