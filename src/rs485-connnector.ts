import {Logging} from 'homebridge';
import {Socket} from "net";
import {crc16_modbus} from "./crc16";
import Timeout = NodeJS.Timeout;

export class Rs485Connnector {

    machine: number;
    host: string;
    port: number;

    private readonly log: Logging;
    private client: Socket | undefined;

    private callbacks: {[key: string]: {
        command: number,
        callback: (res: Buffer) => void,
        createTime: number
    }} = {};

    private heartbeatTimer: Timeout | undefined;

    constructor(host: string, port: number, machine: number, log: Logging) {
        this.host = host;
        this.port = port;
        this.machine = machine;
        this.log = log;

        this.init();
    }

    init = async () => {
        this.log('RS485 sock initializing');

        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }

        const net = require('net');
        this.client = new net.Socket();

        this.client!.connect(this.port,this.host);

        this.client!.setEncoding('utf8');
        this.client!.on('connect', () => {
            this.log('RS485 sock connected');

            this.heartbeatTimer = setInterval(() => {
                this.heartbeat();
            }, 60000);
        });
        this.client!.on('data',(chunk)=>{
            const buffer = Buffer.from(chunk);
            this.onSockData(buffer);
        })
        this.client!.on('error',(e)=>{
            this.onSockError(e);
        })
        this.client!.on('close',(closedForError: boolean)=>{
            this.onSockClosed(closedForError);
        })
    }

    onSockData(buffer: Buffer) {
        this.log('RS485 sock received: ', buffer);
        // remove dirty bytes
        let i = 0;
        while (i < buffer.length && buffer[i] > 0x0F) {
            i++;
        }
        buffer = buffer.slice(i);

        if (i > 0) {
            this.log('Message corrected: ', buffer);
        }

        if (buffer.length < 2) {
            return;
        }
        const key = this.numToHex(buffer[0]);
        if (this.callbacks[key]) {
            if (this.callbacks[key].command === buffer[1]) {
                this.callbacks[key].callback(buffer);
                setTimeout(() => {
                    delete this.callbacks[key];
                }, 200);
            }
        }
    }

    onSockError(e: Error) {
        this.log('error: ' + e.message);
        this.retrySocketConnection();
    }

    onSockClosed(closedForError: boolean) {
        this.log('closed: ' + closedForError);
        if (!closedForError) {
            this.retrySocketConnection();
        }
    }

    retrySocketConnection() {
        if (!this.client) {
            // already pending reconnect
            return;
        }
        if (this.client && !this.client.destroyed) {
            try {
                this.client.destroy();
            } catch (e) {

            }
        }
        this.client = undefined;
        this.callbacks = {};
        this.log('retry connect after 3 seconds...');
        setTimeout(() => {
            this.init();
        }, 3000);
    }

    private numToHex(number: number) {
        let res = number.toString(16).toUpperCase();
        while (res.length < 2) {
            res = `0${res}`;
        }
        return res;
    }

    sendRaw(machine: number, command: number, data: number[], callback: (data: Buffer) => void) {
        if (!this.client || this.client.destroyed || this.client.connecting) {
            // socket not ready
            this.log('ignore request because socket is not ready')
            return;
        }
        if (this.callbacks[this.numToHex(machine)]) {
            if (new Date().getTime() - this.callbacks[this.numToHex(machine)].createTime > 3000) {
                // 3 seconds not responding
                delete this.callbacks[this.numToHex(machine)];
            } else {
                // last command still waiting for response, retry some time later
                setTimeout(() => this.sendRaw(machine, command, data, callback), 500);
                return;
            }
        }

        this.callbacks[this.numToHex(machine)] = {
            command,
            callback,
            createTime: new Date().getTime()
        };

        const content = [machine, command, ...data];
        const checkCode = crc16_modbus(content);
        content.push(checkCode >> 8, checkCode & 0xFF);
        const buffer = Buffer.from(content);
        this.log('RS485 sock sent: ', buffer);
        this.client!.write(buffer);
    }

    readPos(position: number, callback: (data: number) => void) {
        this.sendRaw(this.machine, 0x03, [0x00, position, 0x00, 0x01], data => {
            callback(data[4]);
        });
    }

    writePos(position: number, value: number, callback: () => void) {
        this.sendRaw(this.machine, 0x10, [0x00, position, 0x00, 0x01, 0x02, 0x00, value], data => {
            callback();
        });
    }

    heartbeat() {
        this.readPos(0x01, data => {});
    }
}