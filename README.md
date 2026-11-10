<!-- markdownlint-disable MD033 -->

# homebridge-tplink-smarthome

[![NPM Version](https://img.shields.io/npm/v/homebridge-tplink-smarthome.svg)](https://www.npmjs.com/package/homebridge-tplink-smarthome)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

TPLink Smart Home Plugin for [Homebridge](https://github.com/nfarina/homebridge). (formerly `homebridge-hs100`)

## Looking for Maintainer

I haven't actively used Homebridge or TP-Link devices in several years and lack the time and resources to test or maintain this project properly.

I'm open to transferring repository ownership to an individual or organization with a strong track record in open-source contributions. Alternatively, anyone is welcome to fork the project under the MIT license. If you maintain an active fork, feel free to reach out so I can add a link here for others to find it.

Please see [this discussion](https://github.com/plasticrake/homebridge-tplink-smarthome/discussions/380).

## Models Supported

- **Plugs:** EP25, EP40, HS100, HS103, HS105, HS107, HS110, HS300, KP105, KP115, KP303, KP400
- **Switches:** ES20M, HS200, HS210, HS220, HS230
- **Bulbs:** KL50, KL120, KL125, LB100, LB110, LB120, LB130, LB200, LB230
- **Lightstrips:** KL400, KL430

More models may be supported than listed. If you have another model working please let me know so I can add here.

**Tapo devices are not supported and are out of scope with this plugin.**

## HomeKit

| Model                                           | Service   | Characteristics                                                                                                                                                                                    |
| ----------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HS100, HS103, HS105, HS107, KP105, KP303, KP400 | Outlet    | On<br/>OutletInUse (based on On state)                                                                                                                                                             |
| HS110, HS300, KP115                             | Outlet    | On<br/>OutletInUse (based on energy monitoring)<br/>Volts (Custom)<br/>Amperes (Custom)<br/>Watts (Custom)<br/>VoltAmperes (Custom)<br/>KilowattHours (Custom)<br/>KilowattVoltAmpereHour (Custom) |
| EP25, EP40                                      | Outlet    | On<br/>OutletInUse (based on On state)                                                                                                                                                             |
| HS200, HS210                                    | Switch    | On                                                                                                                                                                                                 |
| HS220, HS230                                    | Lightbulb | On<br/>Brightness                                                                                                                                                                                  |
| KL50, LB100, LB110, LB200                       | Lightbulb | On<br/>Brightness<br/>Watts (Custom)                                                                                                                                                               |
| LB120, KL120                                    | Lightbulb | On<br/>Brightness<br/>ColorTemperature<br/>Watts (Custom)                                                                                                                                          |
| KL125, KL400, KL430, LB130, LB230               | Lightbulb | On<br/>Brightness<br/>ColorTemperature<br/>Hue<br/>Saturation<br/>Watts (Custom)                                                                                                                   |
| ES20M                                           | Lightbulb | On<br/>Brightness                                                                                                                                                                                  |

## Matter

With Homebridge v2.0.0 or later, devices are also exposed over [Matter](https://csa-iot.org/all-solutions/matter/) (Apple Home, Google Home, Amazon Alexa, SmartThings...) when Matter is enabled for the bridge the plugin runs on: add a `matter` block to `bridge` (main bridge) or to the platform's `_bridge` (child bridge). See the [Homebridge Matter documentation](https://github.com/homebridge-plugins/homebridge-matter/wiki).

HAP (HomeKit) accessories are still published unless HAP is disabled for the bridge (`hap.enabled: false`). If both HAP and Matter are paired to the same Apple Home, devices will show up twice: run the plugin on a child bridge with only one of them enabled.

| Model                                                       | Matter Device Type      | Clusters                                                                |
| ----------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| HS100, HS103, HS105, HS107, KP105, KP303, KP400, EP25, EP40 | On/Off Plug-in Unit     | OnOff                                                                   |
| HS110, HS300, KP115                                         | On/Off Plug-in Unit     | OnOff<br/>ElectricalPowerMeasurement¹<br/>ElectricalEnergyMeasurement¹  |
| Models in `switchModels` (HS200, HS210 by default)          | On/Off Light            | OnOff                                                                   |
| HS220, HS230, ES20M                                         | Dimmable Light          | OnOff<br/>LevelControl                                                  |
| KL50, LB100, LB110, LB200                                   | Dimmable Light          | OnOff<br/>LevelControl<br/>ElectricalPowerMeasurement¹                  |
| LB120, KL120                                                | Color Temperature Light | OnOff<br/>LevelControl<br/>ColorControl<br/>ElectricalPowerMeasurement¹ |
| KL125, KL400, KL430, LB130, LB230                           | Extended Color Light    | OnOff<br/>LevelControl<br/>ColorControl<br/>ElectricalPowerMeasurement¹ |

¹ Requires Homebridge v2.2.0 or later.

## Installation

### Manual Installation

1. **Node v18 or greater is required.** Check by running: `node --version`
2. Install Homebridge: ([instructions](https://github.com/homebridge/homebridge#installation))
3. **Homebridge v1.6.0 or greater is required.** Check by running `homebridge --version`
4. Install this plugin using: `npm install -g homebridge-tplink-smarthome`
5. Update your configuration file. See the sample below.

### Homebridge Config UI X Installation

Check out [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) for easier setup. This plugin can be installed from the **Plugins** tab by searching.

### Installation from GitHub

Matter support is not published on npm yet. To install this version directly from the [GitHub repository](https://github.com/frousselet/homebridge-tplink-smarthome) (the plugin is built automatically during the install):

- Homebridge installed with `hb-service` (Homebridge apt package / Raspberry Pi image, Homebridge UI...): plugins live in the Homebridge storage directory (usually `/var/lib/homebridge`). Open the **Terminal** in the Homebridge UI and run:

  ```sh
  cd /var/lib/homebridge
  npm install github:frousselet/homebridge-tplink-smarthome
  ```

  From an SSH shell, run it as the `homebridge` user so the files keep the right owner:

  ```sh
  cd /var/lib/homebridge
  sudo -u homebridge PATH=/opt/homebridge/bin:$PATH npm install github:frousselet/homebridge-tplink-smarthome
  ```

- Homebridge installed globally with npm: **do not** use `npm install -g github:...`, npm doesn't install the build tools of git dependencies for global installs (`tsc: not found`). Build a package first and install it:

  ```sh
  git clone https://github.com/frousselet/homebridge-tplink-smarthome.git
  cd homebridge-tplink-smarthome
  npm install
  npm pack
  npm install -g ./homebridge-tplink-smarthome-*.tgz
  ```

With `npm install github:...`, a specific branch, tag or commit can be installed by appending `#<ref>`, e.g. `github:frousselet/homebridge-tplink-smarthome#main`.

Restart Homebridge afterwards. To expose devices over Matter, Homebridge v2.0.0 or later is required and Matter must be enabled for the bridge, see [Matter](#matter).

## Updating

- `npm update -g homebridge-tplink-smarthome`
- When installed from GitHub, run the same install commands again (`git pull` first for a cloned repository) to get the latest version.

## Configuration

### Sample Configuration

#### Minimal

Most setups do not require any other configuration to get up and runing.

```json
"platforms": [{
  "platform": "TplinkSmarthome",
  "name": "TplinkSmarthome"
}]
```

#### All options with defaults

See [config.ts](src/config.ts) for documention on these options. It is recommended to use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) to setup the configuration if you don't want to manually edit JSON files.

```json
"platforms": [{
  "platform": "TplinkSmarthome",
  "name": "TplinkSmarthome",

  "addCustomCharacteristics": true,
  "inUseThreshold": 0,
  "switchModels": ["HS200", "HS210"],

  "discoveryPort": 0,
  "broadcast": "255.255.255.255",
  "pollingInterval": 10,
  "deviceTypes": ["bulb", "plug"],
  "macAddresses": [],
  "excludeMacAddresses": [],
  "devices": [],

  "timeout": 15,
  "transport": "tcp",
  "waitTimeUpdate": 100
}]
```

##### MAC Addresses

MAC Addresses are normalized, special characters are removed and made uppercase for comparison. So any format should work: `AA:BB:CC:00:11:22` or `aaBbcc001122` are valid. Glob-style pattern matching is supported: `?` will match a single character and `*` matches zero or more. To specify all MAC addresses that start with `AA` you could use `AA*`

<img src="https://user-images.githubusercontent.com/1383980/30236344-5ca0e866-94cc-11e7-9cf7-bb5632291082.png" align="right" alt="Eve Screenshot - Custom Characteristics" width=250>

### Custom Characteristics in Eve

Devices that support energy monitoring (HS110, etc) will have extra characteristics that are viewable in the Eve app (such as Watts). Turn this off by setting `addCustomCharacteristics` false.

### Discovery and Broadcast

This plugin uses UDP broadcast to find devices on your network. This is also how the Kasa app finds devices. Try setting the `broadcast` configuration if you're having discovery issues. Some users have reported that rebooting their router or changing some router settings have fixed discovery issues.

### Manually Specifying Devices

If you have a network setup where UDP broadcast is not working, you can manually specify the devices you'd like this plugin to use. This will send the discovery message directly to these devices in addition to the UDP broadcast. **Note that your device must have a static IP to work.**

```js
"platforms": [{
  "platform": "TplinkSmarthome",
  "name": "TplinkSmarthome",

  "devices": [
    { "host": "192.168.0.100" },
    { "host": "192.168.0.101" },
    { "host": "192.168.0.102", "port": "9999" } // port defaults to "9999" but can be overriden
  ]
}]
```

### Accessory Names

Note the name in Homebridge/HomeKit may be out of sync from the Kasa app. This is a [Homebridge/HomeKit limitation](https://github.com/nfarina/homebridge#limitations). You can rename your accessory through the Home app.

## Troubleshooting

### UUID Errors

`Error: Cannot add a bridged Accessory with the same UUID as another bridged Accessory`
If you get an error about duplicate UUIDs you'll have to either remove your cached configuration files or manually edit them to remove the offending entry. By default they are stored in `~/.homebridge/accessories`. In some cases you may also need to remove `~/.homebridge/persist` and re-pair homebridge to your home.

You can remove them by running:

- `rm -rf ~/.homebridge/accessories`
- `rm -rf ~/.homebridge/persist`

## Credits

Thanks to George Georgovassilis and Thomas Baust for [reverse engineering the HS1XX protocol](https://blog.georgovassilis.com/2016/05/07/controlling-the-tp-link-hs100-wi-fi-smart-plug/).
