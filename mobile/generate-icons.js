const { createCanvas } = require('canvas');
const opentype = require('opentype.js');
const fs = require('fs');
const path = require('path');

const SIZE = 1024;
const PADDING_RATIO = 0.15;

// Icon colors (swapped for visual design)
const BG_COLOR = '#000000';        // darkColors.bg (theme.ts line 15)
const DROP_COLOR = '#007AFF';      // blue for raindrop fill
const LINK_COLOR = '#FF6B4A';      // orange for link glyph

// Font and glyph configuration
const TTF_PATH = path.join(__dirname, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf');
const LINK_VARIANT_CODEPOINT = 983865; // From glyphmaps/MaterialCommunityIcons.json line 4306

// UI measurements from HomeScreen.tsx
const UI_RAINDROP_SIZE = 30;
const UI_LINK_SIZE = 14;
const UI_LINK_TOP = -2;
const UI_LINK_RIGHT = -6;

// Load font using opentype.js
console.log('Loading font from:', TTF_PATH);
if (!fs.existsSync(TTF_PATH)) {
  console.error('ERROR: TTF file not found at', TTF_PATH);
  process.exit(1);
}
const font = opentype.loadSync(TTF_PATH);
console.log('Font loaded:', font.names.fontFamily.en);

function drawWaterDropFilled(ctx, centerX, centerY, height, fillColor) {
  // Proper teardrop: perfect semicircle bottom, pointed top
  const radius = height * 0.32;  // Bottom semicircle radius
  const width = radius * 2;
  
  ctx.beginPath();
  
  const topY = centerY - height / 2;
  const bottomY = centerY + height / 2;
  const circleCenterY = bottomY - radius;  // Y center of the bottom semicircle
  
  // Start at the sharp point at top
  ctx.moveTo(centerX, topY);
  
  // Right side: smooth curve from point down to right edge of semicircle
  // The curve should meet the circle tangentially (vertically) at the join point
  ctx.bezierCurveTo(
    centerX + radius * 0.12, topY + height * 0.12,   // Control 1: slight outward near top
    centerX + radius, circleCenterY - radius * 0.8,  // Control 2: vertical tangent approach
    centerX + radius, circleCenterY                   // End at right edge of semicircle
  );
  
  // Bottom: perfect semicircle using arc (from 0 to PI, clockwise in canvas coords)
  // Arc goes from right (0) around bottom to left (PI)
  ctx.arc(centerX, circleCenterY, radius, 0, Math.PI, false);
  
  // Left side: smooth curve from left edge of semicircle back up to point
  // Starts at (centerX - radius, circleCenterY) after the arc
  ctx.bezierCurveTo(
    centerX - radius, circleCenterY - radius * 0.8,  // Control 1: vertical tangent departure
    centerX - radius * 0.12, topY + height * 0.12,   // Control 2: slight outward near top
    centerX, topY                                     // Back to sharp point
  );
  
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  
  // Return bounds for link positioning
  return {
    top: topY,
    right: centerX + radius,
    centerX: centerX,
    width: width,
    height: height
  };
}

function drawLinkVariantGlyph(ctx, centerX, centerY, size, color) {
  // Get the glyph for link-variant codepoint
  const glyph = font.charToGlyph(String.fromCodePoint(LINK_VARIANT_CODEPOINT));
  
  if (!glyph || glyph.index === 0) {
    console.error('ERROR: Could not find glyph for codepoint', LINK_VARIANT_CODEPOINT);
    return;
  }
  
  // Calculate font size to match desired pixel size
  const unitsPerEm = font.unitsPerEm;
  const fontSize = size;
  const scale = fontSize / unitsPerEm;
  
  // Get glyph path and calculate bounds
  const glyphPath = glyph.getPath(0, 0, fontSize);
  const bbox = glyphPath.getBoundingBox();
  
  // Calculate offset to center the glyph
  const glyphWidth = bbox.x2 - bbox.x1;
  const glyphHeight = bbox.y2 - bbox.y1;
  const offsetX = centerX - bbox.x1 - glyphWidth / 2;
  const offsetY = centerY - bbox.y1 - glyphHeight / 2;
  
  // Get path at correct position
  const path = glyph.getPath(offsetX, offsetY + glyphHeight, fontSize);
  
  // Draw the path
  ctx.fillStyle = color;
  path.fill = color;
  path.draw(ctx);
}

function generateIcon(filename, withPadding = false) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, SIZE, SIZE);
  
  // Calculate effective area
  const effectiveSize = withPadding ? SIZE * (1 - PADDING_RATIO * 2) : SIZE;
  const offsetX = withPadding ? SIZE * PADDING_RATIO : 0;
  const offsetY = withPadding ? SIZE * PADDING_RATIO : 0;
  
  const centerX = offsetX + effectiveSize / 2;
  const centerY = offsetY + effectiveSize / 2;
  
  // Drop takes ~70% of effective size
  const dropHeight = effectiveSize * 0.7;
  
  // Draw the water drop filled and get its bounds
  const dropBounds = drawWaterDropFilled(ctx, centerX, centerY, dropHeight, DROP_COLOR);
  
  // Link icon: 30% of drop size, positioned at 2 o'clock (upper-right edge)
  const linkSize = dropHeight * 0.30;
  
  // Position: upper-right edge of raindrop, badge-style at 2 o'clock
  // X: drop center + 38% of drop width (pushes right toward edge)
  // Y: drop top + 12% of drop height (higher up on edge)
  const linkCenterX = dropBounds.centerX + dropBounds.width * 0.38;
  const linkCenterY = dropBounds.top + dropHeight * 0.12;
  
  // Draw link-variant glyph using opentype.js path rendering
  drawLinkVariantGlyph(ctx, linkCenterX, linkCenterY, linkSize, LINK_COLOR);
  
  // Save to file
  const buffer = canvas.toBuffer('image/png');
  const filepath = path.join(__dirname, 'assets', filename);
  fs.writeFileSync(filepath, buffer);
  console.log(`✓ Generated: ${filepath}`);
}

console.log('');
console.log('Generating DropLink app icons...');
console.log('');
console.log('Configuration:');
console.log(`  Background: ${BG_COLOR}`);
console.log(`  Drop fill: ${DROP_COLOR}`);
console.log(`  Link color: ${LINK_COLOR}`);
console.log(`  Link glyph: U+${LINK_VARIANT_CODEPOINT.toString(16).toUpperCase()} (codepoint ${LINK_VARIANT_CODEPOINT})`);
console.log('');

try {
  generateIcon('icon.png', false);
  generateIcon('adaptive-icon.png', true);
  console.log('\n✓ All icons generated successfully!');
} catch (error) {
  console.error('Error generating icons:', error);
  process.exit(1);
}
