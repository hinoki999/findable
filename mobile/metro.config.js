// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Optimize cache settings for better Fast Refresh reliability
config.cacheStores = [
  // Use file system cache (default, but explicitly set for clarity)
];

// Reset cache on certain conditions
config.resetCache = false; // Set to true manually when needed: npx expo start -c

// Watchman settings (if using Watchman)
config.watchFolders = [__dirname];

// Transformer settings for better Fast Refresh
config.transformer = {
  ...config.transformer,
  // Enable inline requires for better performance
  inlineRequires: true,
  // Keep minifier settings but ensure source maps work
  minifierConfig: {
    ...config.transformer.minifierConfig,
    keep_classnames: true,
    keep_fnames: true,
  },
};

// Resolver settings
config.resolver = {
  ...config.resolver,
  // Ensure source extensions are properly resolved
  sourceExts: [...(config.resolver.sourceExts || []), 'tsx', 'ts', 'jsx', 'js'],
  // Asset extensions
  assetExts: config.resolver.assetExts.filter(ext => ext !== 'svg'),
};

module.exports = config;

