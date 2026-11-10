import type { Bulb, LightState } from 'tplink-smarthome-api';
import type { BulbSysinfoLightState } from 'tplink-smarthome-api/lib/bulb';

import MatterDevice from '.';
import type TplinkSmarthomePlatform from '../platform';
import type {
  MatterAccessory,
  MatterAPI,
  MatterClusters,
  MatterDeviceTypeName,
  MatterHandlers,
} from '../matter-types';
import { deferAndCombine, delay, kelvinToMired, miredToKelvin } from '../utils';
import {
  enhancedHueToDegrees,
  hueSaturationToXy,
  hueToMatter,
  MATTER_MAX_LEVEL,
  MATTER_MIN_LEVEL,
  matterHueToDegrees,
  matterLevelToPercent,
  matterSaturationToPercent,
  matterToXy,
  percentToMatterLevel,
  saturationToMatter,
  xyToHueSaturation,
  xyToMatter,
  emeterToClusters,
} from './convert';

// Matter ColorControl ColorMode values
const COLOR_MODE_HUE_SATURATION = 0;
const COLOR_MODE_COLOR_TEMPERATURE = 2;

type KnownLightState = Pick<
  LightState,
  'on_off' | 'brightness' | 'color_temp' | 'hue' | 'saturation'
>;

export default class MatterDeviceBulb extends MatterDevice {
  private desiredLightState: LightState = {};

  /** Last known (or last requested) light state, used to skip no-op commands */
  private knownLightState: KnownLightState = {};

  /**
   * Aggregates setLightState requests, a Matter controller often sends
   * OnOff, LevelControl and ColorControl commands at the same time.
   */
  private setLightState: (value: LightState) => Promise<true>;

  constructor(
    platform: TplinkSmarthomePlatform,
    matter: MatterAPI,
    readonly tplinkDevice: Bulb,
    cachedAccessory: MatterAccessory | undefined
  ) {
    super(platform, matter, tplinkDevice, cachedAccessory);

    this.updateKnownLightState(tplinkDevice.sysInfo.light_state);

    this.setLightState = deferAndCombine(
      (requestCount) => {
        this.log.debug(
          `executing deferred setLightState count: ${requestCount}`
        );
        if (Object.keys(this.desiredLightState).length === 0) {
          return Promise.resolve(true);
        }
        const ret = this.tplinkDevice.lighting.setLightState(
          this.desiredLightState
        );
        this.desiredLightState = {};
        return ret;
      },
      platform.config.waitTimeUpdate,
      (value: LightState) => {
        this.desiredLightState = Object.assign(this.desiredLightState, value);
      }
    );
  }

  get deviceTypeName(): MatterDeviceTypeName {
    if (this.tplinkDevice.supportsColor) return 'ExtendedColorLight';
    if (this.tplinkDevice.supportsColorTemperature)
      return 'ColorTemperatureLight';
    if (this.tplinkDevice.supportsBrightness) return 'DimmableLight';
    return 'OnOffLight';
  }

  private get hasLevel(): boolean {
    return this.deviceTypeName !== 'OnOffLight';
  }

  private get hasColorTemperature(): boolean {
    return (
      this.tplinkDevice.supportsColorTemperature &&
      this.tplinkDevice.colorTemperatureRange != null
    );
  }

  private get hasColor(): boolean {
    return this.tplinkDevice.supportsColor;
  }

  private get hasEmeter(): boolean {
    return (
      this.tplinkDevice.supportsEmeter && this.supportsElectricalMeasurement
    );
  }

  /** Physical mireds range, K and Mired are reversed */
  private get miredsRange(): { min: number; max: number } {
    const range = this.tplinkDevice.colorTemperatureRange ?? {
      min: 2500,
      max: 9000,
    };
    return {
      min: Math.ceil(kelvinToMired(range.max)),
      max: Math.floor(kelvinToMired(range.min)),
    };
  }

  private kelvinToMatterMireds(kelvin: number): number {
    const { min, max } = this.miredsRange;
    return Math.min(max, Math.max(min, Math.round(kelvinToMired(kelvin))));
  }

  private matterMiredsToKelvin(mireds: number): number {
    const { min, max } = this.miredsRange;
    return Math.round(miredToKelvin(Math.min(max, Math.max(min, mireds))));
  }

  private updateKnownLightState(
    lightState: LightState | BulbSysinfoLightState
  ): void {
    const { dft_on_state: dftOnState, ...ls } =
      lightState as BulbSysinfoLightState;
    // when off, the light state only contains on_off and dft_on_state
    const merged = { ...(dftOnState ?? {}), ...ls } as KnownLightState;
    (
      ['on_off', 'brightness', 'color_temp', 'hue', 'saturation'] as const
    ).forEach((key) => {
      if (merged[key] != null) {
        Object.assign(this.knownLightState, { [key]: merged[key] });
      }
    });
  }

  /**
   * Converts a TP-Link light state into Matter cluster attributes.
   */
  private lightStateToClusters(
    lightState: LightState | BulbSysinfoLightState
  ): MatterClusters {
    const { dft_on_state: dftOnState, ...ls } =
      lightState as BulbSysinfoLightState;
    const merged = { ...(dftOnState ?? {}), ...ls } as KnownLightState;
    const clusters: MatterClusters = {};

    if (ls.on_off != null) {
      clusters.onOff = { onOff: ls.on_off === 1 };
    }

    if (this.hasLevel && merged.brightness != null) {
      clusters.levelControl = {
        currentLevel: percentToMatterLevel(merged.brightness),
      };
    }

    if (
      this.hasColorTemperature &&
      merged.color_temp != null &&
      merged.color_temp > 0
    ) {
      clusters.colorControl = {
        colorTemperatureMireds: this.kelvinToMatterMireds(merged.color_temp),
        colorMode: COLOR_MODE_COLOR_TEMPERATURE,
        enhancedColorMode: COLOR_MODE_COLOR_TEMPERATURE,
      };
    } else if (
      this.hasColor &&
      (merged.hue != null || merged.saturation != null)
    ) {
      const hue = merged.hue ?? this.knownLightState.hue ?? 0;
      const saturation =
        merged.saturation ?? this.knownLightState.saturation ?? 0;
      const { x, y } = hueSaturationToXy(hue, saturation);
      clusters.colorControl = {
        currentHue: hueToMatter(hue),
        currentSaturation: saturationToMatter(saturation),
        currentX: xyToMatter(x),
        currentY: xyToMatter(y),
        colorMode: COLOR_MODE_HUE_SATURATION,
        enhancedColorMode: COLOR_MODE_HUE_SATURATION,
      };
    }

    return clusters;
  }

  protected getClusters(): MatterClusters {
    const ls = this.tplinkDevice.sysInfo.light_state;
    const state = this.lightStateToClusters(ls);

    const clusters: MatterClusters = {
      onOff: { onOff: ls.on_off === 1, ...state.onOff },
    };

    if (this.hasLevel) {
      clusters.levelControl = {
        currentLevel: MATTER_MAX_LEVEL,
        minLevel: MATTER_MIN_LEVEL,
        maxLevel: MATTER_MAX_LEVEL,
        ...state.levelControl,
      };
    }

    if (this.hasColorTemperature || this.hasColor) {
      const { min, max } = this.miredsRange;
      const colorControl: Record<string, unknown> = {};
      if (this.hasColorTemperature) {
        Object.assign(colorControl, {
          colorTemperatureMireds: max,
          colorTempPhysicalMinMireds: min,
          colorTempPhysicalMaxMireds: max,
          colorMode: COLOR_MODE_COLOR_TEMPERATURE,
          enhancedColorMode: COLOR_MODE_COLOR_TEMPERATURE,
        });
      }
      if (this.hasColor) {
        const { x, y } = hueSaturationToXy(0, 0);
        Object.assign(colorControl, {
          currentHue: 0,
          currentSaturation: 0,
          currentX: xyToMatter(x),
          currentY: xyToMatter(y),
        });
        if (!this.hasColorTemperature) {
          Object.assign(colorControl, {
            colorMode: COLOR_MODE_HUE_SATURATION,
            enhancedColorMode: COLOR_MODE_HUE_SATURATION,
          });
        }
      }
      clusters.colorControl = { ...colorControl, ...state.colorControl };
    }

    if (this.hasEmeter) {
      Object.assign(
        clusters,
        emeterToClusters(this.tplinkDevice.emeter.realtime)
      );
    }

    return clusters;
  }

  /**
   * Sends the parts of `lightState` that differ from the known state.
   * matter.js calls some ColorControl methods from others (e.g. hue and
   * saturation are also set individually after moveToHueAndSaturation), this
   * avoids sending the same command to the device several times.
   */
  private async setChangedLightState(lightState: LightState): Promise<void> {
    const changed: LightState = {};
    (Object.keys(lightState) as Array<keyof KnownLightState>).forEach((key) => {
      if (this.knownLightState[key] !== lightState[key]) {
        Object.assign(changed, { [key]: lightState[key] });
      }
    });
    if (Object.keys(changed).length === 0) return;

    this.log.info(`Setting light state to: %j`, changed);
    Object.assign(this.knownLightState, changed);
    try {
      await this.setLightState(changed);
    } catch (err) {
      // unknown state, don't skip the next command
      this.knownLightState = {};
      throw err;
    }
  }

  private setColor(hue: number, saturation: number): Promise<void> {
    return this.setChangedLightState({ hue, saturation, color_temp: 0 });
  }

  protected getHandlers(): MatterHandlers {
    const handlers: MatterHandlers = {
      onOff: {
        on: () => this.setChangedLightState({ on_off: 1 }),
        off: () => this.setChangedLightState({ on_off: 0 }),
        toggle: () =>
          this.setChangedLightState({
            on_off: this.knownLightState.on_off === 1 ? 0 : 1,
          }),
      },
    };

    if (this.hasLevel) {
      handlers.levelControl = {
        moveToLevel: ({ level }: { level: number }) =>
          this.setChangedLightState({
            brightness: matterLevelToPercent(level),
          }),
        moveToLevelWithOnOff: ({ level }: { level: number }) =>
          level <= MATTER_MIN_LEVEL
            ? this.setChangedLightState({ on_off: 0 })
            : this.setChangedLightState({
                on_off: 1,
                brightness: matterLevelToPercent(level),
              }),
        stop: () => {},
      };
    }

    if (this.hasColorTemperature || this.hasColor) {
      handlers.colorControl = {
        stopAllColorMovement: () => {},
      };
    }

    if (this.hasColorTemperature) {
      Object.assign(handlers.colorControl, {
        moveToColorTemperatureLogic: ({
          colorTemperatureMireds,
        }: {
          colorTemperatureMireds: number;
        }) =>
          this.setChangedLightState({
            color_temp: this.matterMiredsToKelvin(colorTemperatureMireds),
          }),
      });
    }

    if (this.hasColor) {
      Object.assign(handlers.colorControl, {
        moveToHueAndSaturationLogic: ({
          hue,
          saturation,
        }: {
          hue: number;
          saturation: number;
        }) =>
          this.setColor(
            matterHueToDegrees(hue),
            matterSaturationToPercent(saturation)
          ),
        moveToHueLogic: ({
          targetHue,
          isEnhancedHue,
        }: {
          targetHue: number;
          isEnhancedHue: boolean;
        }) =>
          this.setColor(
            isEnhancedHue
              ? enhancedHueToDegrees(targetHue)
              : matterHueToDegrees(targetHue),
            this.knownLightState.saturation ?? 100
          ),
        moveToSaturationLogic: ({
          targetSaturation,
        }: {
          targetSaturation: number;
        }) =>
          this.setColor(
            this.knownLightState.hue ?? 0,
            matterSaturationToPercent(targetSaturation)
          ),
        moveToColorLogic: ({
          targetX,
          targetY,
        }: {
          targetX: number;
          targetY: number;
        }) => {
          const { hue, saturation } = xyToHueSaturation(
            matterToXy(targetX),
            matterToXy(targetY)
          );
          return this.setColor(hue, saturation);
        },
      });
    }

    return handlers;
  }

  protected addEventListeners(): void {
    const lightStateListener = (
      lightState: LightState | BulbSysinfoLightState
    ) => {
      this.updateKnownLightState(lightState);
      const clusters = this.lightStateToClusters(lightState);
      Object.entries(clusters).forEach(([cluster, attributes]) => {
        this.updateState(cluster, attributes);
      });
    };
    this.tplinkDevice.on('lightstate-update', lightStateListener);
    this.tplinkDevice.on('lightstate-sysinfo-update', lightStateListener);

    if (this.hasEmeter) {
      this.tplinkDevice.on('emeter-realtime-update', (realtime) => {
        this.updateEmeterState(realtime);
      });
    }
  }

  identify(): void {
    this.log.debug(`identify`);
    (async () => {
      try {
        const { lighting } = this.tplinkDevice;
        const origLs = await lighting.getLightState();
        for (let i = 0; i < 3; i += 1) {
          /* eslint-disable no-await-in-loop */
          await lighting.setLightState({ on_off: 1, brightness: 100 });
          await delay(500);
          await lighting.setLightState({ on_off: 1, brightness: 10 });
          await delay(500);
          /* eslint-enable no-await-in-loop */
        }
        const { dft_on_state: dftOnState, ...restore } =
          origLs as BulbSysinfoLightState;
        await lighting.setLightState({ ...(dftOnState ?? {}), ...restore });
      } catch (err) {
        this.log.error(`identify error`);
        this.log.error(String(err));
      }
    })();
  }
}
