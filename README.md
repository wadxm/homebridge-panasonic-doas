# homebridge-panasonic-doas
Homebridge panasonic DOAS plugin

## Introduction
If you have a Panasonic DOAS(Dedicated Outdoor Air System), this plugin can turn it into a HomeKit fan. So you can turn it on / off, adjust its strength (by setting the fan speed), and switch between extrinsic cycle / inner loop (by setting the fan rotation direction) in HomeKit.

## Preparation
Panasonic DOAS itself does not support remote control, but it supports two kinds of external modules:
1. Panasonic DOAS Wi-Fi Module (FY-WF15ZDP1C)
2. Panasonic DOAS RS485 Module (FY-RS15ZDP2C)

The Wi-Fi Module connects to the Panasonic official App, but it's not programmable so we cannot use it for HomeKit,
so you need a Panasonic DOAS RS485 Module (FY-RS15ZDP2C) to make your DOAS machine controllable through RS485 communication.

But most users (like me) installed the DOAS inside the ceiling, but put the homebridge server somewhere else, so we also need a RS485 to Wi-Fi converter to turn the RS485 input / output into TCP Socket read / write.

## Installation
When you finished preparation, you should get the RS485 TCP Server host and port, and the machine id (configs on the RS485 module physically, default is 0x01)
Insert the config into your homebridge config.json:
```
{
    "name": "DOAS",
    "platform": "panasonic-doas",
    "host": "192.168.1.104", // replace with your host
    "port": 8899, // replace with your port
    "machine_id": 1 // replace with your machine_id
}
```
