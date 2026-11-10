import { EventEmitter } from 'events';
import { HomebridgeAPI } from 'homebridge/lib/api';

import TplinkSmarthomePlatform from '../src/platform';
import type { MatterAccessory, MatterAPI } from '../src/matter-types';
import {
  hueSaturationToXy,
  matterLevelToPercent,
  percentToMatterLevel,
  xyToHueSaturation,
  xyToMatter,
} from '../src/matter-device/convert';

const log = () => {};
log.prefix = '';
log.debug = () => {};
log.error = () => {};
log.info = () => {};
log.success = () => {};
log.log = () => {};
log.warn = () => {};

function createMatterAPI() {
  const registered: MatterAccessory[] = [];
  const matter = {
    deviceTypes: {
      OnOffLight: { name: 'OnOffLight' },
      DimmableLight: { name: 'DimmableLight' },
      ColorTemperatureLight: { name: 'ColorTemperatureLight' },
      ExtendedColorLight: { name: 'ExtendedColorLight' },
      OnOffOutlet: { name: 'OnOffOutlet' },
    },
    registerPlatformAccessories: jest.fn(
      async (
        _plugin: string,
        _platform: string,
        accessories: MatterAccessory[]
      ) => {
        registered.push(...accessories);
      }
    ),
    unregisterPlatformAccessories: jest.fn(async () => {}),
    updateAccessoryState: jest.fn(async () => {}),
  };
  return { matter: matter as unknown as MatterAPI & typeof matter, registered };
}

function createPlatform(
  matter: MatterAPI | undefined,
  version = '2.5.0',
  config: Record<string, unknown> = {}
) {
  const api = new HomebridgeAPI();
  Object.assign(api, {
    serverVersion: version,
    matter,
    isMatterEnabled: () => matter != null,
    isHapEnabled: () => true,
  });
  return new TplinkSmarthomePlatform(
    log,
    {
      platform: 'TplinkSmarthome',
      name: 'tplink',
      waitTimeUpdate: 0,
      ...config,
    },
    api
  );
}

function createPlug(props: Record<string, unknown> = {}) {
  const device = new EventEmitter();
  return Object.assign(device, {
    id: '800600000000000000000000000000000000PLUG',
    deviceType: 'plug',
    model: 'HS110(US)',
    alias: 'My Plug',
    mac: '50:C7:BF:00:00:01',
    macNormalized: '50C7BF000001',
    host: '127.0.0.1',
    port: 9999,
    softwareVersion: '1.0.0',
    hardwareVersion: '1.0',
    supportsDimmer: false,
    supportsEmeter: true,
    relayState: false,
    inUse: false,
    emeter: {
      realtime: { power: 12.5, voltage: 230.1, current: 0.05, total: 1.234 },
      getRealtime: jest.fn(async () => ({})),
    },
    dimmer: { brightness: 50, setBrightness: jest.fn(async () => true) },
    setPowerState: jest.fn(async () => true),
    getSysInfo: jest.fn(async () => ({})),
    blink: jest.fn(async () => true),
    ...props,
  });
}

function createBulb(props: Record<string, unknown> = {}) {
  const device = new EventEmitter();
  return Object.assign(device, {
    id: '800600000000000000000000000000000000BULB',
    deviceType: 'bulb',
    model: 'KL130(EU)',
    alias: 'My Bulb',
    mac: '50:C7:BF:00:00:02',
    macNormalized: '50C7BF000002',
    host: '127.0.0.2',
    port: 9999,
    softwareVersion: '1.0.0',
    hardwareVersion: '1.0',
    supportsBrightness: true,
    supportsColorTemperature: true,
    supportsColor: true,
    supportsEmeter: false,
    colorTemperatureRange: { min: 2500, max: 9000 },
    sysInfo: {
      light_state: {
        on_off: 1,
        brightness: 50,
        color_temp: 4000,
        hue: 0,
        saturation: 0,
      },
    },
    lighting: {
      setLightState: jest.fn(async () => true),
      getLightState: jest.fn(async () => ({})),
    },
    emeter: { realtime: {}, getRealtime: jest.fn(async () => ({})) },
    getSysInfo: jest.fn(async () => ({})),
    ...props,
  });
}

async function addDevice(
  platform: TplinkSmarthomePlatform,
  device: EventEmitter
) {
  // eslint-disable-next-line @typescript-eslint/dot-notation
  platform['foundDevice'](device as never);
  // eslint-disable-next-line @typescript-eslint/dot-notation
  const matterDevice = platform['matterDevicesById'].get(
    (device as unknown as { id: string }).id
  );
  await matterDevice?.register();
}

describe('Matter', function () {
  describe('convert', function () {
    it('maps brightness to Matter levels', function () {
      expect(percentToMatterLevel(0)).toBe(1);
      expect(percentToMatterLevel(100)).toBe(254);
      expect(matterLevelToPercent(254)).toBe(100);
      expect(matterLevelToPercent(1)).toBe(1);
      expect(matterLevelToPercent(percentToMatterLevel(42))).toBe(42);
    });

    it('converts hue/saturation to xy and back', function () {
      const red = hueSaturationToXy(0, 100);
      expect(red.x).toBeCloseTo(0.64, 2);
      expect(red.y).toBeCloseTo(0.33, 2);

      [0, 60, 120, 180, 240, 300].forEach((hue) => {
        const { x, y } = hueSaturationToXy(hue, 100);
        const hs = xyToHueSaturation(x, y);
        expect(hs.hue).toBeCloseTo(hue, -1);
        expect(hs.saturation).toBeGreaterThanOrEqual(98);
      });

      const white = hueSaturationToXy(0, 0);
      expect(xyToHueSaturation(white.x, white.y).saturation).toBeLessThan(2);
      expect(xyToMatter(1)).toBe(65279);
    });
  });

  describe('platform', function () {
    it('does not use Matter when it is not enabled', async function () {
      const platform = createPlatform(undefined);
      await addDevice(platform, createPlug());
      // eslint-disable-next-line @typescript-eslint/dot-notation
      expect(platform['matterDevicesById'].size).toBe(0);
      // eslint-disable-next-line @typescript-eslint/dot-notation
      expect(platform['homekitDevicesById'].size).toBe(1);
    });

    it('does not use Matter on homebridge 1.x', async function () {
      const { matter } = createMatterAPI();
      const platform = createPlatform(matter, '1.11.2');
      await addDevice(platform, createPlug());
      expect(matter.registerPlatformAccessories).not.toHaveBeenCalled();
    });

    it('registers both HAP and Matter accessories', async function () {
      const { matter, registered } = createMatterAPI();
      const platform = createPlatform(matter);
      await addDevice(platform, createPlug());
      // eslint-disable-next-line @typescript-eslint/dot-notation
      expect(platform['homekitDevicesById'].size).toBe(1);
      expect(registered).toHaveLength(1);
    });
  });

  describe('plug', function () {
    it('registers an outlet with energy measurement', async function () {
      const { matter, registered } = createMatterAPI();
      const platform = createPlatform(matter);
      await addDevice(platform, createPlug());

      const [acc] = registered;
      expect(acc.deviceType).toBe(matter.deviceTypes.OnOffOutlet);
      expect(acc.serialNumber).toBe('50C7BF000001');
      expect(acc.context).toEqual({
        deviceId: '800600000000000000000000000000000000PLUG',
        deviceTypeName: 'OnOffOutlet',
      });
      expect(acc.clusters).toEqual({
        onOff: { onOff: false },
        electricalPowerMeasurement: {
          activePower: 12500,
          voltage: 230100,
          activeCurrent: 50,
        },
        electricalEnergyMeasurement: {
          cumulativeEnergyImported: { energy: 1234000 },
        },
      });
    });

    it('omits energy measurement before homebridge 2.2.0', async function () {
      const { matter, registered } = createMatterAPI();
      const platform = createPlatform(matter, '2.1.0');
      await addDevice(platform, createPlug());
      expect(registered[0].clusters).toEqual({ onOff: { onOff: false } });
    });

    it('handles onOff commands and device updates', async function () {
      const { matter, registered } = createMatterAPI();
      const platform = createPlatform(matter);
      const plug = createPlug();
      await addDevice(platform, plug);

      await registered[0].handlers?.onOff.on({});
      expect(plug.setPowerState).toHaveBeenLastCalledWith(true);

      matter.updateAccessoryState.mockClear();
      plug.emit('power-update', true);
      expect(matter.updateAccessoryState).toHaveBeenCalledWith(
        registered[0].UUID,
        'onOff',
        { onOff: true }
      );
    });

    it('exposes switch models as lights and dimmers as dimmable lights', async function () {
      const { matter, registered } = createMatterAPI();
      const platform = createPlatform(matter, '2.5.0', {
        switchModels: ['HS200'],
      });
      await addDevice(
        platform,
        createPlug({ id: 'SWITCH', model: 'HS200(US)', supportsEmeter: false })
      );
      const dimmer = createPlug({
        id: 'DIMMER',
        model: 'HS220(US)',
        supportsDimmer: true,
        supportsEmeter: false,
      });
      await addDevice(platform, dimmer);

      expect(registered[0].deviceType).toBe(matter.deviceTypes.OnOffLight);
      expect(registered[1].deviceType).toBe(matter.deviceTypes.DimmableLight);
      expect(registered[1].clusters?.levelControl).toEqual({
        currentLevel: 127,
        minLevel: 1,
        maxLevel: 254,
      });

      await registered[1].handlers?.levelControl.moveToLevelWithOnOff({
        level: 254,
      });
      expect(dimmer.dimmer.setBrightness).toHaveBeenLastCalledWith(100);
      expect(dimmer.setPowerState).toHaveBeenLastCalledWith(true);
    });

    it('uses the child id in the serial number of power strip outlets', async function () {
      const { matter, registered } = createMatterAPI();
      const platform = createPlatform(matter);
      await addDevice(
        platform,
        createPlug({ id: 'STRIP01', childId: 'STRIP01' })
      );
      expect(registered[0].serialNumber).toBe('50C7BF000001-01');
    });
  });

  describe('bulb', function () {
    it('registers an extended color light', async function () {
      const { matter, registered } = createMatterAPI();
      const platform = createPlatform(matter);
      await addDevice(platform, createBulb());

      const [acc] = registered;
      expect(acc.deviceType).toBe(matter.deviceTypes.ExtendedColorLight);
      expect(acc.clusters?.onOff).toEqual({ onOff: true });
      expect(acc.clusters?.levelControl).toMatchObject({ currentLevel: 127 });
      expect(acc.clusters?.colorControl).toMatchObject({
        colorTemperatureMireds: 250,
        colorTempPhysicalMinMireds: 112,
        colorTempPhysicalMaxMireds: 400,
        colorMode: 2,
      });
    });

    it('picks the device type from the bulb capabilities', async function () {
      const { matter, registered } = createMatterAPI();
      const platform = createPlatform(matter);
      await addDevice(platform, createBulb({ id: 'CT', supportsColor: false }));
      await addDevice(
        platform,
        createBulb({
          id: 'DIM',
          supportsColor: false,
          supportsColorTemperature: false,
        })
      );
      await addDevice(
        platform,
        createBulb({
          id: 'ONOFF',
          supportsColor: false,
          supportsColorTemperature: false,
          supportsBrightness: false,
        })
      );
      expect(registered.map((a) => a.context.deviceTypeName)).toEqual([
        'ColorTemperatureLight',
        'DimmableLight',
        'OnOffLight',
      ]);
      expect(registered[2].clusters).toEqual({ onOff: { onOff: true } });
    });

    it('forwards Matter commands to the bulb', async function () {
      const { matter, registered } = createMatterAPI();
      const platform = createPlatform(matter);
      const bulb = createBulb();
      await addDevice(platform, bulb);
      const { handlers } = registered[0];

      await handlers?.levelControl.moveToLevelWithOnOff({ level: 254 });
      expect(bulb.lighting.setLightState).toHaveBeenLastCalledWith({
        brightness: 100,
      });

      await handlers?.colorControl.moveToColorTemperatureLogic({
        colorTemperatureMireds: 370,
      });
      expect(bulb.lighting.setLightState).toHaveBeenLastCalledWith({
        color_temp: 2703,
      });

      await handlers?.colorControl.moveToHueAndSaturationLogic({
        hue: 127,
        saturation: 254,
      });
      expect(bulb.lighting.setLightState).toHaveBeenLastCalledWith({
        hue: 180,
        saturation: 100,
        color_temp: 0,
      });

      // matter.js also calls moveToHueLogic / moveToSaturationLogic, they
      // must not send the same state again
      bulb.lighting.setLightState.mockClear();
      await handlers?.colorControl.moveToHueLogic({
        targetHue: 127,
        isEnhancedHue: false,
      });
      await handlers?.colorControl.moveToSaturationLogic({
        targetSaturation: 254,
      });
      expect(bulb.lighting.setLightState).not.toHaveBeenCalled();

      const { x, y } = hueSaturationToXy(240, 100);
      await handlers?.colorControl.moveToColorLogic({
        targetX: xyToMatter(x),
        targetY: xyToMatter(y),
      });
      expect(bulb.lighting.setLightState).toHaveBeenLastCalledWith({
        hue: 240,
      });

      await handlers?.onOff.off({});
      expect(bulb.lighting.setLightState).toHaveBeenLastCalledWith({
        on_off: 0,
      });
    });

    it('forwards light state updates to Matter', async function () {
      const { matter, registered } = createMatterAPI();
      const platform = createPlatform(matter);
      const bulb = createBulb();
      await addDevice(platform, bulb);
      matter.updateAccessoryState.mockClear();

      bulb.emit('lightstate-update', {
        on_off: 1,
        brightness: 100,
        color_temp: 0,
        hue: 120,
        saturation: 100,
      });

      const { UUID } = registered[0];
      expect(matter.updateAccessoryState).toHaveBeenCalledWith(UUID, 'onOff', {
        onOff: true,
      });
      expect(matter.updateAccessoryState).toHaveBeenCalledWith(
        UUID,
        'levelControl',
        { currentLevel: 254 }
      );
      expect(matter.updateAccessoryState).toHaveBeenCalledWith(
        UUID,
        'colorControl',
        expect.objectContaining({
          currentHue: 85,
          currentSaturation: 254,
          colorMode: 0,
        })
      );
    });
  });

  it('re-creates a cached accessory whose device type changed', async function () {
    const { matter } = createMatterAPI();
    const platform = createPlatform(matter);
    const plug = createPlug();
    const uuid = platform.api.hap.uuid.generate(plug.id);
    platform.configureMatterAccessory({
      UUID: uuid,
      displayName: 'My Plug',
      deviceType: undefined,
      serialNumber: '',
      manufacturer: '',
      model: '',
      context: { deviceId: plug.id, deviceTypeName: 'DimmableLight' },
    });
    await addDevice(platform, plug);
    expect(matter.unregisterPlatformAccessories).toHaveBeenCalledWith(
      'homebridge-tplink-smarthome',
      'TplinkSmarthome',
      [{ UUID: uuid }]
    );
    expect(matter.registerPlatformAccessories).toHaveBeenCalled();
  });
});
