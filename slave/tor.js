const net = require('net');
const { debounce } = require('./utils');
const { SocksProxyAgent } = require('socks-proxy-agent');

class TorController {
    constructor(host, port = 9051, password = 'pmquy') {
        this.host = host;
        this.port = port;
        this.password = password;
        this.socket = null;
        this.buffer = '';
        this.commandQueue = [];
        this.isReady = false;
        this.rotateIP = debounce(this.sendCommand.bind(this, 'SIGNAL NEWNYM'), 10000)
        this.agent = new SocksProxyAgent(`socks5h://${host}:9050`);
    }

    connect() {

        return new Promise((resolve, reject) => {
            this.socket = new net.Socket();

            this.socket.connect(this.port, this.host, () => {
                this.socket.write(`AUTHENTICATE "${this.password}"\r\n`);
            });

            this.socket.on('data', (data) => {
                this.buffer += data.toString();

                if (this.buffer.includes('250 OK')) {
                    if (!this.isReady) {
                        this.isReady = true;
                        this.buffer = '';
                        resolve();
                    } else {
                        this._nextCommand();
                    }
                } else if (this.buffer.includes('515')) {
                    reject(new Error('Authentication failed or command error:\n' + this.buffer));
                    this.socket.end();
                }
            });

            this.socket.on('error', (err) => {
                reject(err);
            });

            this.socket.on('close', () => {
                console.log('Tor control connection closed.');
                this.isReady = false;
            });
        });
    }

    sendCommand(command) {
        return new Promise((resolve, reject) => {
            if (!this.socket || !this.isReady) {
                return reject(new Error('Socket not connected or not authenticated.'));
            }

            this.commandQueue.push({ command, resolve, reject });
            if (this.commandQueue.length === 1) {
                this._sendNextCommand();
            }
        });
    }

    _sendNextCommand() {
        const { command } = this.commandQueue[0];
        this.buffer = '';
        this.socket.write(`${command}\r\n`);
    }

    _nextCommand() {
        const current = this.commandQueue.shift();
        if (current) {
            current.resolve(this.buffer);
        }

        if (this.commandQueue.length > 0) {
            this._sendNextCommand();
        }
    }


    close() {
        if (this.socket) {
            this.socket.end();
            this.socket = null;
        }
    }
}

module.exports = TorController;
