const { withAppBuildGradle, withProjectBuildGradle } = require('@expo/config-plugins');

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

module.exports = withGoogleServices;

