/**
 * Minimal subset of the Homebridge v2 Matter API used by this plugin.
 *
 * The plugin is still built against Homebridge 1.x typings (which know nothing
 * about Matter), so the shapes we rely on are declared here. They mirror
 * `homebridge/dist/api.d.ts` and `homebridge/dist/matter/types.d.ts` from
 * Homebridge >= 2.0.0.
 */
import type { API } from 'homebridge';

export type MatterHandlerContext = {
  uuid: string;
  partId?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MatterCommandHandler<TArgs = any> = (
  args: TArgs,
  context?: MatterHandlerContext
) => Promise<void> | void;

export type MatterClusterHandlers = Record<string, MatterCommandHandler>;

export type MatterClusters = Record<string, Record<string, unknown>>;

export type MatterHandlers = Record<string, MatterClusterHandlers>;

export type TplinkSmarthomeMatterContext = {
  deviceId?: string;
  /** Key of `api.matter.deviceTypes` used when the accessory was registered */
  deviceTypeName?: string;
};

export interface MatterAccessory<
  T extends Record<string, unknown> = TplinkSmarthomeMatterContext,
> {
  UUID: string;
  displayName: string;
  deviceType: unknown;
  serialNumber: string;
  manufacturer: string;
  model: string;
  firmwareRevision?: string;
  hardwareRevision?: string;
  softwareVersion?: string;
  context: T;
  clusters?: MatterClusters;
  handlers?: MatterHandlers;
}

export type MatterDeviceTypeName =
  | 'OnOffLight'
  | 'DimmableLight'
  | 'ColorTemperatureLight'
  | 'ExtendedColorLight'
  | 'OnOffOutlet';

export interface MatterAPI {
  readonly deviceTypes: Record<MatterDeviceTypeName, unknown> &
    Record<string, unknown>;
  registerPlatformAccessories(
    pluginIdentifier: string,
    platformName: string,
    accessories: MatterAccessory[]
  ): Promise<void>;
  unregisterPlatformAccessories(
    pluginIdentifier: string,
    platformName: string,
    accessories: Pick<MatterAccessory, 'UUID'>[]
  ): Promise<void>;
  updateAccessoryState(
    uuid: string,
    cluster: string,
    attributes: Record<string, unknown>,
    partId?: string
  ): Promise<void>;
}

/** Homebridge API including the v2 additions (all optional on v1). */
export type HomebridgeAPIWithMatter = API & {
  readonly matter?: MatterAPI;
  isMatterEnabled?: () => boolean;
  isHapEnabled?: () => boolean;
};

/**
 * Returns the Matter API when it's available *and* enabled for the bridge this
 * plugin runs on (main bridge `bridge.matter` or child bridge `_bridge.matter`).
 */
export function getMatterAPI(api: API): MatterAPI | undefined {
  const apiV2 = api as HomebridgeAPIWithMatter;
  if (
    typeof api.versionGreaterOrEqual !== 'function' ||
    !api.versionGreaterOrEqual('2.0.0') ||
    typeof apiV2.isMatterEnabled !== 'function' ||
    !apiV2.isMatterEnabled()
  ) {
    return undefined;
  }
  return apiV2.matter;
}

/**
 * Returns false only when HAP was explicitly disabled for this bridge
 * (Homebridge v2 `bridge.hap.enabled: false`).
 */
export function isHapEnabled(api: API): boolean {
  const apiV2 = api as HomebridgeAPIWithMatter;
  if (typeof apiV2.isHapEnabled !== 'function') return true;
  return apiV2.isHapEnabled();
}
