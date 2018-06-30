const Stream = require('./stream');
const Rest = require('./rest');

class UserDataStream extends Stream{

    /**
     * 
     * @param {Rest} binanceRest 
     * @param {boolean} beautify - should beautify responses or not
     * @param {number} keepAlive_interval
     * @param {string} url - custom url, if not set default will be used
     * @param {number} ping_interval - in milliseconds
     * @param {Beautifier} beautifier - Custom beautifier, if not set default will be used
     */
    constructor(
        binanceRest, 
        beautify = true, 
        keepAlive_interval = 60000 * 30,
        url = false, 
        ping_interval = 30000,
        beautifier = false
    ) {
        super("", beautify, url, ping_interval, beautifier);
        this._rest = binanceRest;
        this.keepAlive_interval = keepAlive_interval;
    }
    get listenKey() { return this._path; }
    set listenKey(val) {  this._path = val; }

    restart(ping_interval){
        if(this.isClosed){
            this._rest.startUserDataStream().then((listenKey) => {
                this.listenKey = listenKey;
                let userDataInterval = setInterval(() => {
                    this._rest.keepAliveUserDataStream({listenKey: this.listenKey})
                        .catch((err) => {
                            console.error("Error sending keep alive for user data stream.", err)
                        });
                }, this.keepAlive_interval);
                
                this.once('close', () => clearInterval(userDataInterval));
                super.restart(ping_interval);
            });
        }
        else
            super.restart(ping_interval);
    }
}

module.exports = UserDataStream;