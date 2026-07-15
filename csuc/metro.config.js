const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The AWS SDK's React Native entry point only exists in its ES-module build,
// so Metro must prefer "module" over the Node-only "main" (dist-cjs) build —
// but only for AWS packages. Applying this globally breaks other packages
// (e.g. punycode) whose ES builds aren't drop-in replacements.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@aws-sdk/') || moduleName.startsWith('@smithy/')) {
    return context.resolveRequest(
      { ...context, mainFields: ['react-native', 'browser', 'module', 'main'] },
      moduleName,
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
