const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// The package lives one folder up; Metro watches it and resolves its imports
// (react, react-native) from this app, so there is one copy of each.
const root = path.resolve(__dirname, '..');

module.exports = mergeConfig(getDefaultConfig(__dirname), {
  watchFolders: [root],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    blockList: [new RegExp(`${root.replace(/[/\\]/g, '[/\\\\]')}[/\\\\]node_modules[/\\\\]react(-native)?[/\\\\].*`)],
  },
});
