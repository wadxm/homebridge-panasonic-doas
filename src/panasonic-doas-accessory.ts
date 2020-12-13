import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging, PlatformConfig,
  Service, StaticPlatformPlugin
} from "homebridge";
import {Rs485Connnector} from "./rs485-connnector";

const PLATFORM_NAME = "panasonic-doas";

/*
 * IMPORTANT NOTICE
 *
 * One thing you need to take care of is, that you never ever ever import anything directly from the "homebridge" module (or the "hap-nodejs" module).
 * The above import block may seem like, that we do exactly that, but actually those imports are only used for types and interfaces
 * and will disappear once the code is compiled to Javascript.
 * In fact you can check that by running `npm run build` and opening the compiled Javascript file in the `dist` folder.
 * You will notice that the file does not contain a `... = require("homebridge");` statement anywhere in the code.
 *
 * The contents of the above import statement MUST ONLY be used for type annotation or accessing things like CONST ENUMS,
 * which is a special case as they get replaced by the actual value and do not remain as a reference in the compiled code.
 * Meaning normal enums are bad, const enums can be used.
 *
 * You MUST NOT import anything else which remains as a reference in the code, as this will result in
 * a `... = require("homebridge");` to be compiled into the final Javascript code.
 * This typically leads to unexpected behavior at runtime, as in many cases it won't be able to find the module
 * or will import another instance of homebridge causing collisions.
 *
 * To mitigate this the {@link API | Homebridge API} exposes the whole suite of HAP-NodeJS inside the `hap` property
 * of the api object, which can be acquired for example in the initializer function. This reference can be stored
 * like this for example and used to access all exported variables and classes from HAP-NodeJS.
 */
let hap: HAP;

/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API) => {
  hap = api.hap;
  api.registerPlatform(PLATFORM_NAME, PanasonicPlatform);
};

class PanasonicPlatform implements StaticPlatformPlugin {

  private readonly log: Logging;
  private readonly config: PlatformConfig;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.config = config;
    // probably parse config or something here

    log.info("Panasonic platform finished initializing!");
  }

  /*
   * This method is called to retrieve all accessories exposed by the platform.
   * The Platform can delay the response my invoking the callback at a later time,
   * it will delay the bridge startup though, so keep it to a minimum.
   * The set of exposed accessories CANNOT change over the lifetime of the plugin!
   */
  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void {
    const doas = new PanasonicDoas(this.log, this.config.host, this.config.port, this.config.machine_id);
    callback([doas]);
  }

}

class PanasonicDoas implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly name: string;

  private readonly airPurifierService: Service;
  private readonly informationService: Service;

  private readonly connector: Rs485Connnector;

  constructor(log: Logging, host: string, port: number, machine_id: number) {
    this.log = log;
    this.name = 'DOAS';

    this.connector = new Rs485Connnector(host, port, machine_id, log);

    this.airPurifierService = new hap.Service.Fan(this.name);
    this.airPurifierService.getCharacteristic(hap.Characteristic.On)
        .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
          log.info("Requesting get On of the air purifier...");
          this.connector.readPos(0x01, data => {
            log.info("Current On of the air purifier was returned: " + !!data);
            callback(undefined, !!data);
          });
        })
        .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
          log.info("Requesting set On of the air purifier...");
          this.connector.writePos(0x01, value ? 0x01 : 0x00, () => {
            log.info("Current On of the air purifier was set: " + value);
            callback();
          });
        });

    this.airPurifierService.getCharacteristic(hap.Characteristic.RotationDirection)
        .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
          log.info("Requesting get direction of the air purifier...");
          this.connector.readPos(0x02, data => {
            const mode = this.panasonicStateToHomeKitState(data);
            log.info("Current direction of the air purifier was returned: " + mode);
            callback(undefined, mode);
          });
        })
        .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
          log.info("Requesting set direction of the air purifier...");
          this.connector.writePos(0x02, this.homeKitStateToPanasonicState(value as number), () => {
            log.info("Current direction of the air purifier was set: " + value);
            callback();
          });
        });

    this.airPurifierService.getCharacteristic(hap.Characteristic.RotationSpeed)
        .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
          log.info("Requesting get speed of the air purifier...");
          this.connector.readPos(0x03, data => {
            const mode = this.panasonicSpeedToHomeKitSpeed(data);
            log.info("Current speed of the air purifier was returned: " + mode);
            callback(undefined, mode);
          });
        })
        .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
          log.info("Requesting set speed of the air purifier...");
          this.connector.writePos(0x03, this.homeKitSpeedToPanasonicSpeed(value as number), () => {
            log.info("Current speed of the air purifier was set: " + value);
            callback();
          });
        })

    this.informationService = new hap.Service.AccessoryInformation()
        .setCharacteristic(hap.Characteristic.Manufacturer, "Panasonic")
        .setCharacteristic(hap.Characteristic.Model, "FY-RS15ZDP2C");

    log.info("DOAS finished initializing!");
  }

  homeKitStateToPanasonicState = (d: number) => {
    switch (d) {
      case 0:
        return 0;
      case 1:
        return 2;
    }
    return 0;
  };

  panasonicStateToHomeKitState = (d: number) => {
    switch (d) {
      case 0:
        return 0;
      case 2:
        return 1;
      case 5:
        return 0;
    }
    return 0;
  };

  homeKitSpeedToPanasonicSpeed = (d: number) => {
    if (d <= 30) {
      return 1;
    } else if (d < 70) {
      return 2;
    } else {
      return 3;
    }
  };

  panasonicSpeedToHomeKitSpeed = (d: number) => {
    switch (d) {
      case 1:
        return 5;
      case 2:
        return 50;
      case 3:
        return 100;
    }
    return 0;
  };

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log("Identify!");
  }

  /*
   * This method is called directly after creation of this instance.
   * It should return all services which should be added to the accessory.
   */
  getServices(): Service[] {
    return [
      this.informationService,
      this.airPurifierService,
    ];
  }

}
