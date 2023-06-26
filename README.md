# nat-mapmp

A NAT-PMP implementation with natmap.

## Usage

1. Install nodeJS.

   ```bash
   opkg update && opkg install nodejs
   ```

2. Download [nat-mapmp](../../releases).

3. Allow inbound connections to natmap binding ports. Default ports are `9000-9999`. You can change it by setting `--bind` option.

   Navigate to `Network > Firewall > Traffic Rules` in LuCI, add a new rule. Set `Protocol` to `TCP+UDP`, `Source zone` to `wan`, `Destination port` to `9000-9999`, `Action` to `ACCEPT`.

4. Install [natmap](https://github.com/heiher/natmap). Make sure `natmap` is in your `$PATH`, or you can set the `natmap` executable path via `--exec` option.

5. Run `nat-mapmp` with `nodejs`.

   ```bash
   chmod +x ./nat-mapmp.mjs
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
