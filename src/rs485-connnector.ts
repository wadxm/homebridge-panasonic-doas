import {Logging} from 'homebridge';
import {Socket} from "net";
import {crc16_modbus} from "./crc16";

export class Rs485Connnector {

    machine: number;
    host: string;
    port: number;

    private readonly log: Logging;
    private client: Socket | undefined;

    private readonly callbacks: {[key: string]: ((res: Buffer) => void)} = {};

    constructor(host: string, port: number, machine: number, log: Logging) {
        this.host = host;
        this.port = port;
        this.machine = machine;
        this.log = log;

        this.init();
    }

    init = async () => {
        this.log('RS485 sock initializing');

        const net = require('net');
        this.client = new net.Socket();

        this.client!.connect(this.port,this.host);

        this.client!.setEncoding('utf8');
        this.client!.on('connect', () => {
            this.log('RS485 sock connected');
        });
        this.client!.on('data',(chunk)=>{
            const buffer = Buffer.from(chunk);
            this.onSockData(buffer);
        })
        this.client!.on('error',(e)=>{
            this.onSockError(e);
        })
    }

    onSockData(buffer: Buffer) {
        this.log(`RS485 sock received: ${buffer}`);
        if (buffer.length < 2) {
            return;
        }
        const key = `${this.numToHex(buffer[0])}${this.numToHex(buffer[1])}`;
        if (this.callbacks[key]) {
            this.callbacks[key](buffer);
            delete this.callbacks[key];
        }
    }

    onSockError(e: Error) {
        this.log('error: ' + e.message);
    }

    private numToHex(number: number) {
        let res = number.toString(16).toUpperCase();
        while (res.length < 2) {
            res = `0${res}`;
        }
        return res;
    }

    sendRaw(machine: number, command: number, data: number[], callback: (data: Buffer) => void) {
        this.callbacks[`${this.numToHex(machine)}${this.numToHex(command)}`] = callback;

        const content = [machine, command, ...data];
        const checkCode = crc16_modbus(content);
        content.push(checkCode >> 8, checkCode & 0xFF);
        const buffer = Buffer.from(content);
        this.log(`RS485 sock sent: ${buffer}`);
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
}