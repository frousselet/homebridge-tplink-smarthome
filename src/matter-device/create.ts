import type TplinkSmarthomePlatform from '../platform';
import type { MatterAccessory, MatterAPI } from '../matter-types';
import type { TplinkDevice } from '../utils';

import MatterDevice from '.';
import MatterDeviceBulb from './bulb';
import MatterDevicePlug from './plug';

/**
 * Factory method to create a MatterDeviceBulb or MatterDevicePlug.
 */
export default function createMatterDevice(
  platform: TplinkSmarthomePlatform,
  matter: MatterAPI,
  cachedAccessory: MatterAccessory | undefined,
  tplinkDevice: TplinkDevice
): MatterDevice {
  if (tplinkDevice.deviceType === 'bulb') {
    return new MatterDeviceBulb(
      platform,
      matter,
      tplinkDevice,
      cachedAccessory
    );
  }
  return new MatterDevicePlug(platform, matter, tplinkDevice, cachedAccessory);
}
