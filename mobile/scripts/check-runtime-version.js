// Fails if app.json's runtimeVersion and the committed Android string disagree.
// Installed builds only accept OTA updates whose runtime version matches theirs.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8').replace(/^﻿/, ''));
const expected = appJson.expo.runtimeVersion;

const xml = fs.readFileSync(path.join(root, 'android/app/src/main/res/values/strings.xml'), 'utf8');
const match = xml.match(/<string name="expo_runtime_version">([^<]*)<\/string>/);

if (typeof expected !== 'string' || !match) {
  console.error('check-runtime-version: could not read runtimeVersion from app.json or strings.xml');
  process.exit(1);
}
if (match[1] !== expected) {
  console.error(`check-runtime-version: app.json has ${expected}, strings.xml has ${match[1]}. Update both.`);
  process.exit(1);
}
console.log(`runtimeVersion ${expected} matches in app.json and strings.xml`);
