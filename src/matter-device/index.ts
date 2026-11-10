import type { Logger } from 'homebridge';

import chalk from 'chalk';

import type TplinkSmarthomePlatform from '../platform';
import type {
  MatterAccessory,
  MatterAPI,
  MatterClusters,
  MatterDeviceTypeName,
  MatterHandlers,
} from '../matter-types';
import { PLATFORM_NAME, PLUGIN_NAME } from '../settings';
import type { TplinkDevice } from '../utils';
import { prefixLogger } from '../utils';
import { emeterToClusters, truncate32 } from './convert';

/**
 * Exposes a TP-Link device as a Matter accessory (Homebridge >= 2.0).
 *
 * Unlike HAP, handlers can't be cached by Homebridge, so the accessory is
 * (re-)registered every time the device is discovered.
 */
export default abstract class MatterDevice {
  readonly log: Logger;

  readonly uuid: string;

  private registration: Promise<void> | undefined;

  constructor(
    readonly platform: TplinkSmarthomePlatform,
    readonly matter: MatterAPI,
    readonly tplinkDevice: TplinkDevice,
    private readonly cachedAccessory: MatterAccessory | undefined
  ) {
    this.log = prefixLogger(
      platform.log,
      () => `${chalk.blue(`[${this.name}]`)} ${chalk.cyan('[Matter]')}`
    );
    this.uuid = platform.api.hap.uuid.generate(this.id);
  }

  get id(): string {
    return this.tplinkDevice.id;
  }

  get name(): string {
    return this.tplinkDevice.alias;
  }

  // eslint-disable-next-line class-methods-use-this
  get manufacturer(): string {
    return 'TP-Link';
  }

  get model(): string {
    return this.tplinkDevice.model;
  }

  /**
   * Matter limits the serial number to 32 characters, the HAP serial
   * (mac + deviceId) is too long, use the mac and the child index if any.
   */
  get serialNumber(): string {
    const { childId } = this.tplinkDevice;
    const mac = this.tplinkDevice.macNormalized || this.tplinkDevice.mac;
    return childId ? `${mac}-${childId.slice(-2)}` : mac;
  }

  get firmwareRevision(): string {
    return this.tplinkDevice.softwareVersion;
  }

  get hardwareRevision(): string {
    return this.tplinkDevice.hardwareVersion;
  }

  /** Key of `api.matter.deviceTypes` this device is exposed as */
  abstract get deviceTypeName(): MatterDeviceTypeName;

  /** Initial cluster state, built from the last known device state */
  protected abstract getClusters(): MatterClusters;

  /** Handlers for commands sent by Matter controllers */
  protected abstract getHandlers(): MatterHandlers;

  /** Listen for device events and forward them to Matter */
  protected abstract addEventListeners(): void;

  abstract identify(): void;

  /**
   * Whether electrical measurement clusters can be used. Their auto-detection
   * was added in Homebridge 2.2.0.
   */
  protected get supportsElectricalMeasurement(): boolean {
    return this.platform.api.versionGreaterOrEqual('2.2.0');
  }

  /**
   * Registers (or re-registers) the accessory with the Homebridge Matter bridge.
   */
  register(): Promise<void> {
    if (this.registration === undefined) {
      this.registration = this.doRegister();
      this.registration.catch((err) => {
        this.log.error('Failed to register Matter accessory');
        this.log.error(String(err));
      });
    }
    return this.registration;
  }

  private async doRegister(): Promise<void> {
    const { deviceTypeName } = this;
    const deviceType = this.matter.deviceTypes[deviceTypeName];
    if (deviceType == null) {
      throw new Error(`Matter device type ${deviceTypeName} is not available`);
    }

    if (
      this.cachedAccessory != null &&
      this.cachedAccessory.context?.deviceTypeName !== deviceTypeName
    ) {
      // Device types (and their clusters) can't be changed on a restored
      // endpoint, start fresh.
      this.log.warn(
        `Matter device type changed from ${
          this.cachedAccessory.context?.deviceTypeName ?? 'unknown'
        } to ${deviceTypeName}, re-creating accessory`
      );
      await this.matter.unregisterPlatformAccessories(
        PLUGIN_NAME,
        PLATFORM_NAME,
        [{ UUID: this.uuid }]
      );
    }

    const clusters = this.getClusters();
    const accessory: MatterAccessory = {
      UUID: this.uuid,
      displayName: truncate32(this.name),
      deviceType,
      serialNumber: truncate32(this.serialNumber),
      manufacturer: this.manufacturer,
      model: truncate32(this.model),
      firmwareRevision: this.firmwareRevision,
      hardwareRevision: this.hardwareRevision,
      context: { deviceId: this.id, deviceTypeName },
      clusters,
      handlers: {
        ...this.getHandlers(),
        identify: {
          identify: () => {
            this.identify();
          },
        },
      },
    };

    this.log.debug(
      `Registering Matter accessory [${this.uuid}] as ${deviceTypeName}`
    );
    await this.matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
      accessory,
    ]);

    // A restored accessory keeps its cached state, push the current one.
    await Promise.all(
      Object.entries(clusters).map(([cluster, attributes]) =>
        this.matter.updateAccessoryState(this.uuid, cluster, attributes)
      )
    );

    this.addEventListeners();
  }

  /**
   * Pushes a state change coming from the device (not from a Matter command)
   * to the Matter controllers.
   */
  protected updateState(
    cluster: string,
    attributes: Record<string, unknown>
  ): void {
    if (Object.keys(attributes).length === 0) return;
    this.log.debug(`Updating ${chalk.yellow(cluster)} %j`, attributes);
    this.matter
      .updateAccessoryState(this.uuid, cluster, attributes)
      .catch((err) => {
        this.log.error(`Failed to update Matter state ${cluster}`);
        this.log.error(String(err));
      });
  }

  private lastEnergyUpdate = 0;

  /**
   * Forwards emeter readings. Energy events are pushed to every controller
   * without throttling, so cumulative energy is updated at most every 30s.
   */
  protected updateEmeterState(realtime: {
    power?: number;
    voltage?: number;
    current?: number;
    total?: number;
  }): void {
    const clusters = emeterToClusters(realtime);
    this.updateState(
      'electricalPowerMeasurement',
      clusters.electricalPowerMeasurement
    );

    const now = Date.now();
    if (
      clusters.electricalEnergyMeasurement !== undefined &&
      now - this.lastEnergyUpdate >= 30_000
    ) {
      this.lastEnergyUpdate = now;
      this.updateState(
        'electricalEnergyMeasurement',
        clusters.electricalEnergyMeasurement
      );
    }
  }
}
