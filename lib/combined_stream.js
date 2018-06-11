const Stream = require('./stream');
const Beautifier = require('./beautifier');


class CombinedStream extends Stream {
    /**
     * Binance WebSocket Combined Stream
     * @param {String[]|String} paths - value other than `String[]` and `String` will be ignored
     * @param {boolean} beautify - should beautify responses or not
     * @param {string} url - custom url, if not set default will be used
     * @param {number} ping_interval - in milliseconds
     * @param {Beautifier} beautifier - Custom beautifier, if not set default will be used
     */
    constructor(
        paths = [], 
        beautify = true, 
        url = false, 
        ping_interval = 30000,
        beautifier = false
    ){
        paths = typeof paths === 'string' ? [paths] : 
                    (paths instanceof Array ? paths : []); //elseif 
        super(
            paths,
            beautify,
            url,
            ping_interval,
            beautifier
        );
    }
    get paths(){ return this._path; }
    addPath(path){
        this.paths.push(path);
    }
    add_depth(symbol){ return this.addPath( this.types.depth(symbol) ); }
    add_depthLevel(symbol, level){ return this.addPath( this.types.depthLevel(symbol, level) ); }
    add_kline(symbol, interval){ return this.addPath( this.types.kline(symbol, interval) ); }
    add_aggTrade(symbol){ return this.addPath( this.types.aggTrade(symbol) ); }
    add_trade(symbol){ return this.addPath( this.types.trade(symbol) ); }
    add_ticker(symbol){ return this.addPath( this.types.ticker(symbol) ); }
    add_allTickers(){ return this.addPath( this.types.allTickers() ); }
}

// set "const" prototype values
CombinedStream.prototype.url = 'wss://stream.binance.com:9443/stream?streams=';

CombinedStream.prototype.beautify = true;

module.exports = CombinedStream;

