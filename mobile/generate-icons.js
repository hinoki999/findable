const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZE = 1024;
const PADDING_RATIO = 0.15; // 15% padding for adaptive icon

// Colors
const BG_COLOR = '#000000';
const DROP_COLOR = '#FF6B4A';
const WHITE = '#FFFFFF';

function drawWaterDrop(ctx, centerX, centerY, height, fillColor) {
  // Water drop shape - teardrop/raindrop
  const width = height * 0.65;
  
  ctx.beginPath();
  
  // Start at the top point of the drop
  const topY = centerY - height / 2;
  const bottomY = centerY + height / 2;
  
  ctx.moveTo(centerX, topY);
  
  // Right curve - bezier curve from top to bottom right
  ctx.bezierCurveTo(
    centerX + width * 0.1, topY + height * 0.2,  // control point 1
    centerX + width / 2, topY + height * 0.4,     // control point 2
    centerX + width / 2, centerY + height * 0.1   // end point
  );
  
  // Bottom right curve to bottom center
  ctx.bezierCurveTo(
    centerX + width / 2, bottomY - height * 0.15,  // control point 1
    centerX + width * 0.3, bottomY,                 // control point 2
    centerX, bottomY                                // end point (bottom center)
  );
  
  // Bottom left curve
  ctx.bezierCurveTo(
    centerX - width * 0.3, bottomY,                 // control point 1
    centerX - width / 2, bottomY - height * 0.15,  // control point 2
    centerX - width / 2, centerY + height * 0.1   // end point
  );
  
  // Left curve back to top
  ctx.bezierCurveTo(
    centerX - width / 2, topY + height * 0.4,     // control point 1
    centerX - width * 0.1, topY + height * 0.2,  // control point 2
    centerX, topY                                  // end point (top)
  );
  
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
}

function drawLinkIcon(ctx, centerX, centerY, size, color) {
  // Draw a chain link icon (two interlocking ovals)
  const linkWidth = size * 0.35;
  const linkHeight = size * 0.6;
  const gap = size * 0.08;
  const lineWidth = size * 0.12;
  
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  
  // Rotate 45 degrees for diagonal chain links
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(-Math.PI / 4);
  
  // Left link (oval shape)
  ctx.beginPath();
  const leftX = -gap - linkWidth / 2;
  // Draw rounded rectangle/pill shape
  const radius = linkWidth / 2;
  ctx.moveTo(leftX - linkWidth/2 + radius, -linkHeight/2);
  ctx.lineTo(leftX + linkWidth/2 - radius, -linkHeight/2);
  ctx.arc(leftX + linkWidth/2 - radius, -linkHeight/2 + radius, radius, -Math.PI/2, 0);
  ctx.lineTo(leftX + linkWidth/2, linkHeight/2 - radius);
  ctx.arc(leftX + linkWidth/2 - radius, linkHeight/2 - radius, radius, 0, Math.PI/2);
  ctx.lineTo(leftX - linkWidth/2 + radius, linkHeight/2);
  ctx.arc(leftX - linkWidth/2 + radius, linkHeight/2 - radius, radius, Math.PI/2, Math.PI);
  ctx.lineTo(leftX - linkWidth/2, -linkHeight/2 + radius);
  ctx.arc(leftX - linkWidth/2 + radius, -linkHeight/2 + radius, radius, Math.PI, Math.PI * 1.5);
  ctx.stroke();
  
  // Right link (oval shape)
  ctx.beginPath();
  const rightX = gap + linkWidth / 2;
  ctx.moveTo(rightX - linkWidth/2 + radius, -linkHeight/2);
  ctx.lineTo(rightX + linkWidth/2 - radius, -linkHeight/2);
  ctx.arc(rightX + linkWidth/2 - radius, -linkHeight/2 + radius, radius, -Math.PI/2, 0);
  ctx.lineTo(rightX + linkWidth/2, linkHeight/2 - radius);
  ctx.arc(rightX + linkWidth/2 - radius, linkHeight/2 - radius, radius, 0, Math.PI/2);
  ctx.lineTo(rightX - linkWidth/2 + radius, linkHeight/2);
  ctx.arc(rightX - linkWidth/2 + radius, linkHeight/2 - radius, radius, Math.PI/2, Math.PI);
  ctx.lineTo(rightX - linkWidth/2, -linkHeight/2 + radius);
  ctx.arc(rightX - linkWidth/2 + radius, -linkHeight/2 + radius, radius, Math.PI, Math.PI * 1.5);
  ctx.stroke();
  
  ctx.restore();
}

function generateIcon(filename, withPadding = false) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, SIZE, SIZE);
  
  // Calculate dimensions based on padding
  const effectiveSize = withPadding ? SIZE * (1 - PADDING_RATIO * 2) : SIZE;
  const offsetX = withPadding ? SIZE * PADDING_RATIO : 0;
  const offsetY = withPadding ? SIZE * PADDING_RATIO : 0;
  
  const centerX = offsetX + effectiveSize / 2;
  
  // Drop takes 55% of effective height, positioned in upper portion to leave room for text
  const dropHeight = effectiveSize * 0.55;
  const dropCenterY = offsetY + effectiveSize * 0.38; // Shifted up to make room for text
  
  // Draw the water drop
  drawWaterDrop(ctx, centerX, dropCenterY, dropHeight, DROP_COLOR);
  
  // Draw link icon in upper right area of drop
  const linkSize = dropHeight * 0.28;
  const linkX = centerX + dropHeight * 0.08;
  const linkY = dropCenterY - dropHeight * 0.12;
  drawLinkIcon(ctx, linkX, linkY, linkSize, WHITE);
  
  // Draw "DropLink" text below the drop
  const fontSize = effectiveSize * 0.11;
  ctx.fillStyle = WHITE;
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  const textY = dropCenterY + dropHeight / 2 + effectiveSize * 0.06;
  ctx.fillText('DropLink', centerX, textY);
  
  // Save to file
  const buffer = canvas.toBuffer('image/png');
  const filepath = path.join(__dirname, 'assets', filename);
  fs.writeFileSync(filepath, buffer);
  console.log(`✓ Generated: ${filepath}`);
}

// Generate all three icons
console.log('Generating DropLink app icons...\n');

try {
  generateIcon('icon.png', false);
  generateIcon('adaptive-icon.png', true);
  generateIcon('splash-icon.png', false);
  console.log('\n✓ All icons generated successfully!');
} catch (error) {
  console.error('Error generating icons:', error);
  process.exit(1);
}
