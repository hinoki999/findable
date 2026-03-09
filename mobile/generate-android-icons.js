const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const RES_DIR = path.join(__dirname, 'android/app/src/main/res');

// Standard Android icon sizes
const ICON_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

// Adaptive icon foreground sizes (1.5x standard for safe zone)
const FOREGROUND_SIZES = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

async function generateIcons() {
  const sourceIcon = path.join(__dirname, 'assets/icon.png');
  const sourceForeground = path.join(__dirname, 'assets/adaptive-icon.png');
  
  console.log('Generating Android launcher icons...\n');
  
  // Create mipmap directories and icons
  for (const [folder, size] of Object.entries(ICON_SIZES)) {
    const dirPath = path.join(RES_DIR, folder);
    
    // Create directory
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    const foregroundSize = FOREGROUND_SIZES[folder];
    
    // Generate ic_launcher.webp (standard icon)
    const launcherPath = path.join(dirPath, 'ic_launcher.webp');
    await sharp(sourceIcon)
      .resize(size, size)
      .webp({ quality: 90 })
      .toFile(launcherPath);
    console.log(`✓ Created: ${folder}/ic_launcher.webp (${size}x${size})`);
    
    // Generate ic_launcher_round.webp (round icon)
    const roundPath = path.join(dirPath, 'ic_launcher_round.webp');
    await sharp(sourceIcon)
      .resize(size, size)
      .webp({ quality: 90 })
      .toFile(roundPath);
    console.log(`✓ Created: ${folder}/ic_launcher_round.webp (${size}x${size})`);
    
    // Generate ic_launcher_foreground.webp (adaptive icon foreground)
    const foregroundPath = path.join(dirPath, 'ic_launcher_foreground.webp');
    await sharp(sourceForeground)
      .resize(foregroundSize, foregroundSize)
      .webp({ quality: 90 })
      .toFile(foregroundPath);
    console.log(`✓ Created: ${folder}/ic_launcher_foreground.webp (${foregroundSize}x${foregroundSize})`);
  }
  
  // Create mipmap-anydpi-v26 directory with XML files
  const anydpiDir = path.join(RES_DIR, 'mipmap-anydpi-v26');
  if (!fs.existsSync(anydpiDir)) {
    fs.mkdirSync(anydpiDir, { recursive: true });
  }
  
  // ic_launcher.xml
  const launcherXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`;
  
  const launcherXmlPath = path.join(anydpiDir, 'ic_launcher.xml');
  fs.writeFileSync(launcherXmlPath, launcherXml);
  console.log(`✓ Created: mipmap-anydpi-v26/ic_launcher.xml`);
  
  // ic_launcher_round.xml
  const roundXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`;
  
  const roundXmlPath = path.join(anydpiDir, 'ic_launcher_round.xml');
  fs.writeFileSync(roundXmlPath, roundXml);
  console.log(`✓ Created: mipmap-anydpi-v26/ic_launcher_round.xml`);
  
  // Create values directory and colors.xml for the background color
  const valuesDir = path.join(RES_DIR, 'values');
  if (!fs.existsSync(valuesDir)) {
    fs.mkdirSync(valuesDir, { recursive: true });
  }
  
  // Check if colors.xml exists and update/create ic_launcher_background
  const colorsPath = path.join(valuesDir, 'colors.xml');
  let colorsXml;
  
  if (fs.existsSync(colorsPath)) {
    colorsXml = fs.readFileSync(colorsPath, 'utf8');
    if (!colorsXml.includes('ic_launcher_background')) {
      // Add the color before closing </resources>
      colorsXml = colorsXml.replace('</resources>', '    <color name="ic_launcher_background">#000000</color>\n</resources>');
      fs.writeFileSync(colorsPath, colorsXml);
      console.log(`✓ Updated: values/colors.xml (added ic_launcher_background)`);
    } else {
      console.log(`✓ Exists: values/colors.xml (ic_launcher_background already defined)`);
    }
  } else {
    colorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#000000</color>
</resources>`;
    fs.writeFileSync(colorsPath, colorsXml);
    console.log(`✓ Created: values/colors.xml`);
  }
  
  console.log('\n✓ All Android launcher icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
