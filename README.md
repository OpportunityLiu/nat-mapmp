# nat-mapmp

A NAT-PMP implementation with [natmap](https://github.com/heiher/natmap).

## Usage

1. Download [nat-mapmp](../../releases). Add execute permission to it.

   ```bash
   # Download nat-mapmp
   curl -Lo nat-mapmp.mjs $(
      curl -s https://api.github.com/repos/opportunityliu/nat-mapmp/releases/latest \
         | grep "browser_download_url.*mjs\"" \
         | cut -d : -f 2,3 \
         | tr -d \" )

   # Add execute permission
   chmod +x ./nat-mapmp.mjs
   ```

2. Install nodeJS. Make sure node version is >= 16.0.0.

   ```bash
   # Install nodejs on OpenWrt
   opkg update && opkg install node

   # Check node version
   node --version
   ```

3. Allow inbound connections to natmap binding ports. Default ports are `9000-9999`. You can change it by setting `--bind` option.

   Navigate to `Network > Firewall > Traffic Rules` in LuCI, add a new rule. Set `Protocol` to `TCP+UDP`, `Source zone` to `wan`, `Destination port` to `9000-9999`, `Action` to `ACCEPT`.

4. Install [natmap](https://github.com/heiher/natmap). Make sure `natmap` is in your `$PATH`, or you can set the `natmap` executable path via `--exec` option.

5. Run `nat-mapmp` with `nodejs`.

   ```bash
   ./nat-mapmp.mjs
   ```

   You can also use `nohup` to run it in background.

   ```bash
   nohup ./nat-mapmp.mjs &
   ```

6. For more options, run `./nat-mapmp.mjs --help`.

## References

- [NAT-PMP](http://tools.ietf.org/html/rfc6886)
- [PCP](http://tools.ietf.org/html/rfc6887)
