import type { Plug } from 'tplink-smarthome-api';

import MatterDevice from '.';
import type TplinkSmarthomePlatform from '../platform';
import type {
  MatterAccessory,
  MatterAPI,
  MatterClusters,
  MatterDeviceTypeName,
  MatterHandlers,
} from '../matter-types';
import { deferAndCombine } from '../utils';
import {
  MATTER_MAX_LEVEL,
  MATTER_MIN_LEVEL,
  matterLevelToPercent,
  percentToMatterLevel,
  emeterToClusters,
} from './convert';

export default class MatterDevicePlug extends MatterDevice {
  private desiredPowerState?: boolean;

  /** Aggregates setPowerState requests */
  private setPowerState: (value: boolean) => Promise<true>;

  constructor(
    platform: TplinkSmarthomePlatform,
    matter: MatterAPI,
    readonly tplinkDevice: Plug,
    cachedAccessory: MatterAccessory | undefined
  ) {
    super(platform, matter, tplinkDevice, cachedAccessory);

    this.setPowerState = deferAndCombine(
      async (requestCount) => {
        this.log.debug(
          `executing deferred setPowerState count: ${requestCount}`
        );
        if (this.desiredPowerState === undefined) {
          return true;
        }
        const ret = await this.tplinkDevice.setPowerState(
          this.desiredPowerState
        );
        this.desiredPowerState = undefined;
        return ret;
      },
      platform.config.waitTimeUpdate,
      (value: boolean) => {
        this.desiredPowerState = value;
      }
    );
  }

  /**
   * - Models listed in `switchModels` (wall switches) are exposed as lights,
   *   Matter has no controllable "switch" device type.
   * - Dimmers are exposed as dimmable lights (as with HAP).
   * - Everything else is exposed as an outlet.
   */
  get deviceTypeName(): MatterDeviceTypeName {
    const { switchModels } = this.platform.config;
    if (this.tplinkDevice.supportsDimmer) return 'DimmableLight';
    if (
      switchModels &&
      switchModels.findIndex((m) => this.tplinkDevice.model.includes(m)) !== -1
    ) {
      return 'OnOffLight';
    }
    return 'OnOffOutlet';
  }

  private get hasLevel(): boolean {
    return this.deviceTypeName === 'DimmableLight';
  }

  private get hasEmeter(): boolean {
    return (
      this.tplinkDevice.supportsEmeter && this.supportsElectricalMeasurement
    );
  }

  protected getClusters(): MatterClusters {
    const clusters: MatterClusters = {
      onOff: { onOff: this.tplinkDevice.relayState },
    };

    if (this.hasLevel) {
      const { brightness } = this.tplinkDevice.dimmer;
      clusters.levelControl = {
        currentLevel:
          typeof brightness === 'number'
            ? percentToMatterLevel(brightness)
            : MATTER_MAX_LEVEL,
        minLevel: MATTER_MIN_LEVEL,
        maxLevel: MATTER_MAX_LEVEL,
      };
    }

    if (this.hasEmeter) {
      Object.assign(
        clusters,
        emeterToClusters(this.tplinkDevice.emeter.realtime)
      );
    }

    return clusters;
  }

  private async setOn(value: boolean): Promise<void> {
    this.log.info(`Setting On to: ${value}`);
    await this.setPowerState(value);
  }

  private async setBrightness(level: number, withOnOff: boolean) {
    if (withOnOff && level <= MATTER_MIN_LEVEL) {
      await this.setOn(false);
      return;
    }
    const brightness = matterLevelToPercent(level);
    this.log.info(`Setting Brightness to: ${brightness}`);
    await this.tplinkDevice.dimmer.setBrightness(brightness);
    if (withOnOff && !this.tplinkDevice.relayState) {
      await this.setOn(true);
    }
  }

  protected getHandlers(): MatterHandlers {
    const handlers: MatterHandlers = {
      onOff: {
        on: () => this.setOn(true),
        off: () => this.setOn(false),
        toggle: () => this.setOn(!this.tplinkDevice.relayState),
      },
    };

    if (this.hasLevel) {
      handlers.levelControl = {
        moveToLevel: ({ level }: { level: number }) =>
          this.setBrightness(level, false),
        moveToLevelWithOnOff: ({ level }: { level: number }) =>
          this.setBrightness(level, true),
        stop: () => {},
      };
    }

    return handlers;
  }

  protected addEventListeners(): void {
    this.tplinkDevice.on('power-update', (value: boolean) => {
      this.updateState('onOff', { onOff: value });
    });

    if (this.hasLevel) {
      this.tplinkDevice.on('brightness-update', (value: number) => {
        this.updateState('levelControl', {
          currentLevel: percentToMatterLevel(value),
        });
      });
    }

    if (this.hasEmeter) {
      this.tplinkDevice.on('emeter-realtime-update', (realtime) => {
        this.updateEmeterState(realtime);
      });
    }
  }

  identify(): void {
    this.log.info(`identify`);
    this.tplinkDevice.blink(3, 500).catch((reason) => {
      this.log.error(`identify error`);
      this.log.error(String(reason));
    });
  }
}
