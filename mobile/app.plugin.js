const { withAppBuildGradle, withProjectBuildGradle, withAndroidManifest } = require('@expo/config-plugins');
const withGoogleServices = (config) => {
  // Add google-services classpath to project-level build.gradle
  config = withProjectBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('com.google.gms:google-services')) {
      config.modResults.contents = config.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n        classpath('com.google.gms:google-services:4.4.2')`
      );
    }
    return config;
  });

  // Add apply plugin to app-level build.gradle
  config = withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('com.google.gms.google-services')) {
      config.modResults.contents = config.modResults.contents.replace(
        /apply plugin: "com\.facebook\.react"/,
        `apply plugin: "com.facebook.react"\napply plugin: "com.google.gms.google-services"`
      );
    }
    return config;
  });

  return config;
};

const withBluetoothPermissionFlags = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const permissions = manifest['uses-permission'] || [];

    permissions.forEach((perm) => {
      const name = perm.$['android:name'];

      if (name === 'android.permission.BLUETOOTH_SCAN') {
        perm.$['android:usesPermissionFlags'] = 'neverForLocation';
      }

      if (name === 'android.permission.ACCESS_FINE_LOCATION') {
        perm.$['android:maxSdkVersion'] = '30';
      }
    });

    return config;
  });
};

module.exports = (config) => {
  config = withGoogleServices(config);
  config = withBluetoothPermissionFlags(config);
  return config;
};

