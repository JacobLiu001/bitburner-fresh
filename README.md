# bitburner-fresh
This is my scripts for the game BitBurner. This is a fresh start, using Typescript.

These scripts are heavily inspired by & uses bits from [Insight's Scripts](https://github.com/alainbryden/bitburner-scripts). Many thanks to Insight for the contributions to the community.

This repo is created with [Shy's external editor template](https://github.com/shyguy1412/bb-external-editor), with a [custom patched version](https://github.com/JacobLiu001/esbuild-bitburner-plugin) of [Shy's original plugin](https://github.com/shyguy1412/esbuild-bitburner-plugin).

To use the scripts in the repo, you should copy the scripts directly from `mirror/home` folder into your BitBurner home server. (I may add a script to fetch these scripts from GitHub directly.)

## Setup
If you would like to setup your own development environment using an external editor, go read [the README in Shy's external editor template](https://github.com/shyguy1412/bb-external-editor#readme).

For mirroring, there is one addition to `config.mjs`: you can now add an `ignorePaths` array to ignore certain paths from being mirrored. This is particularly useful if your scripts read and write files to communicate. See [`config.mjs`](https://github.com/JacobLiu001/bitburner-fresh/blob/main/config.mjs) for an example.