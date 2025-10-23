# 🔄 ROTATION & ZOOM FEATURE DOCUMENTATION

## Overview
The Home Screen now supports **interactive rotation and center-locked zoom** using advanced tensor mathematics. Users can manipulate the view using multi-touch gestures while the drop icon (nucleus) remains perfectly centered.

---

## 🎯 Key Features

### **1. Pinch-to-Zoom** 🔍
- **Gesture**: Two-finger pinch
- **Range**: 0.5x to 3x zoom
- **Behavior**: Zoom is **always centered on the nucleus** (drop icon)
- **Constraint**: Cannot zoom on specific nodes - only on the user's drop

### **2. Rotation** 🔄
- **Gesture**: Two-finger rotation
- **Range**: Unlimited (0° to 360° and beyond)
- **Behavior**: Entire grid rotates around the nucleus
- **Smoothness**: Real-time transformation with no lag

### **3. Nucleus-Locked Transformation** 💧
- **Drop icon always stays centered** - acts as origin (0,0)
- All transformations are relative to the center point
- Grid lines and device blips rotate/scale together
- Physics-based tensor operations ensure mathematical precision

---

## 🧮 Mathematical Implementation

### **Transformation Tensor Composition**

```typescript
// Step 1: Create individual tensors
scaleTensor = [
  [viewScale, 0        ],
  [0,         viewScale]
]

rotationTensor = [
  [cos(θ), -sin(θ)],
  [sin(θ),  cos(θ)]
]

// Step 2: Compose transformations (order matters!)
viewTransformTensor = rotationTensor × scaleTensor
```

### **Why This Order?**
- **Scale first, then rotate** ensures uniform scaling in all directions
- Reversing the order would create non-uniform scaling after rotation
- Mathematical property: `R(θ) × S(k) ≠ S(k) × R(θ)`

### **Position Transformation**

For each device blip at position `p = (x, y)`:

```typescript
p_transformed = viewTransformTensor × p

// Expanded:
x' = m11 × x + m12 × y
y' = m21 × x + m22 × y

// Where:
m11 = cos(θ) × scale
m12 = -sin(θ) × scale
m21 = sin(θ) × scale
m22 = cos(θ) × scale
```

### **Screen Position Calculation**

```typescript
screenX = nucleusX + x'
screenY = nucleusY + y'
```

The nucleus coordinates `(nucleusX, nucleusY)` never change - only the offsets transform.

---

## 📱 Gesture Handling

### **Multi-Touch Detection**

```typescript
// Distance between two touch points
distance = √((x₁ - x₂)² + (y₁ - y₂)²)

// Angle between two touch points
angle = atan2(y₂ - y₁, x₂ - x₁)
```

### **Zoom Calculation**

```typescript
// When gesture starts:
initialDistance = distance(touch1, touch2)
initialScale = currentViewScale

// During gesture:
currentDistance = distance(touch1, touch2)
newScale = (currentDistance / initialDistance) × initialScale

// Constrain to valid range:
finalScale = clamp(newScale, 0.5, 3.0)
```

### **Rotation Calculation**

```typescript
// When gesture starts:
initialAngle = angle(touch1, touch2)
initialRotation = currentViewRotation

// During gesture:
currentAngle = angle(touch1, touch2)
newRotation = (currentAngle - initialAngle) + initialRotation

// No constraints - full 360° rotation
```

---

## 🌐 Grid Line Transformation

### **Challenge**
React Native's `View` component for grid lines must be transformed individually.

### **Solution**
Each grid line is a vector with start and end points:

```typescript
// Original grid line (vertical at x-offset)
lineStart = { x: offset, y: -screenHeight }
lineEnd = { x: offset, y: screenHeight × 2 }

// Apply view transformation
lineStart' = viewTransformTensor × lineStart
lineEnd' = viewTransformTensor × lineEnd

// Calculate line angle and length
dx = lineEnd'.x - lineStart'.x
dy = lineEnd'.y - lineStart'.y
lineAngle = atan2(dy, dx)
lineLength = √(dx² + dy²)

// Render transformed line
<View
  style={{
    position: 'absolute',
    left: nucleusX + lineStart'.x,
    top: nucleusY + lineStart'.y,
    width: lineLength,
    height: 0.5,
    transform: [{ rotate: `${lineAngle}rad` }]
  }}
/>
```

---

## 🎮 UI Controls

### **Top-Right Panel**
```
┌─────────────────┐
│ Zoom: 1.50x     │ ← Real-time display
│ Rotate: 45°     │
├─────────────────┤
│  RESET VIEW     │ ← One-tap reset
├─────────────────┤
│ Use 2 fingers   │ ← Gesture hint
│ to rotate/zoom  │
└─────────────────┘
```

### **Reset Functionality**
```typescript
resetView = () => {
  setViewScale(1);
  setViewRotation(0);
  // Instantly returns to normal view
}
```

---

## 🔬 Technical Details

### **State Management**
```typescript
const [viewRotation, setViewRotation] = useState(0);      // radians
const [viewScale, setViewScale] = useState(1);            // scale factor
const rotationAnimValue = useRef(new Animated.Value(0));  // for animations
const scaleAnimValue = useRef(new Animated.Value(1));     // for animations
```

### **Gesture State Tracking**
```typescript
const gestureState = useRef({
  initialDistance: 0,    // Starting pinch distance
  initialRotation: 0,    // Starting angle
  initialScale: 1,       // Scale when gesture began
  initialAngle: 0,       // Rotation when gesture began
});
```

### **PanResponder Configuration**
```typescript
PanResponder.create({
  // Only respond to 2-finger gestures
  onStartShouldSetPanResponder: (evt) => 
    evt.nativeEvent.touches.length === 2,
  
  onMoveShouldSetPanResponder: (evt) => 
    evt.nativeEvent.touches.length === 2,
  
  // Capture initial state
  onPanResponderGrant: (evt) => { /* ... */ },
  
  // Update during gesture
  onPanResponderMove: (evt) => { /* ... */ },
  
  // Optional: snap on release
  onPanResponderRelease: () => { /* ... */ },
})
```

---

## 🎨 Visual Feedback

### **Grid Behavior**
- Grid lines rotate and scale in real-time
- 1-foot spacing maintained (but scales with zoom)
- Center lines (at nucleus) are brighter (50% opacity vs 30%)
- Grid extends beyond screen to cover rotated views

### **Device Blips**
- Blips transform with grid
- Maintain relative positions to nucleus
- Pulsation animation unaffected by transformation
- Still snap to grid intersections

### **Drop Icon (Nucleus)**
- **Never moves** - absolute center
- All other elements orbit around it
- Size and appearance unchanged
- Remains interactive at all zoom levels

---

## 📊 Performance Optimizations

### **1. Memoized Transformation Tensor**
```typescript
const viewTransformTensor = useMemo(() => {
  const scaleTensor = TensorMath.scalingTensor(viewScale);
  const rotationTensor = TensorMath.rotationTensor(viewRotation);
  return TensorMath.multiply2x2(rotationTensor, scaleTensor);
}, [viewScale, viewRotation]);
```
- Recomputed only when scale or rotation changes
- Prevents redundant matrix multiplication

### **2. Efficient Grid Rendering**
```typescript
const gridRange = Math.ceil(
  Math.max(screenWidth, screenHeight) / (pixelsPerFoot * viewScale)
);
```
- Dynamic line count based on zoom level
- Fewer lines when zoomed in
- More lines when zoomed out

### **3. Transform on CPU**
- Transformation calculations in JavaScript
- Final positions passed to React Native
- Native rendering handles actual drawing

---

## 🧪 Example Transformations

### **Example 1: 2x Zoom, No Rotation**
```
viewScale = 2.0
viewRotation = 0

viewTransformTensor = [
  [2.0, 0.0],
  [0.0, 2.0]
]

Device at (10px, 10px):
  → transformed: (20px, 20px)
  → screen pos: (nucleusX + 20, nucleusY + 20)
```

### **Example 2: No Zoom, 90° Rotation**
```
viewScale = 1.0
viewRotation = π/2 (90°)

viewTransformTensor = [
  [0.0, -1.0],
  [1.0,  0.0]
]

Device at (10px, 0px):
  → transformed: (0px, 10px)
  → screen pos: (nucleusX + 0, nucleusY + 10)
  
Result: Point rotated 90° clockwise
```

### **Example 3: 1.5x Zoom, 45° Rotation**
```
viewScale = 1.5
viewRotation = π/4 (45°)

viewTransformTensor = [
  [1.061, -1.061],
  [1.061,  1.061]
]

Device at (10px, 0px):
  → transformed: (10.61px, 10.61px)
  → screen pos: (nucleusX + 10.61, nucleusY + 10.61)
  
Result: Point scaled 1.5x and rotated 45°
```

---

## 🎯 Use Cases

### **1. Navigation**
- Rotate map to align with user's orientation
- Zoom in to focus on nearby drops
- Zoom out for overview

### **2. Exploration**
- Different perspectives reveal patterns
- Zoom helps in dense areas
- Rotation useful for directional navigation

### **3. Accessibility**
- Zoom for users with visual impairments
- Rotation for comfortable viewing angles
- Reset for quick return to normal

---

## 🔮 Future Enhancements

### **1. Momentum Scrolling**
```typescript
// Continue rotation after release
onPanResponderRelease: (evt, gestureState) => {
  const velocity = gestureState.vx + gestureState.vy;
  Animated.decay(rotationAnimValue, {
    velocity,
    deceleration: 0.997,
  }).start();
}
```

### **2. Snap-to-Angle**
```typescript
// Snap to 45° increments
const snappedRotation = 
  Math.round(viewRotation / (Math.PI / 4)) * (Math.PI / 4);
```

### **3. Double-Tap Zoom**
```typescript
// Quick zoom in/out
onDoubleTap: () => {
  const targetScale = viewScale < 1.5 ? 2.0 : 1.0;
  Animated.spring(scaleAnimValue, {
    toValue: targetScale,
  }).start();
}
```

### **4. Compass Mode**
```typescript
// Auto-rotate to north (using device compass)
DeviceMotion.addListener(({ orientation }) => {
  setViewRotation(-orientation);
});
```

### **5. Zoom to Blip**
```typescript
// Currently: zoom always to center
// Future: pan + zoom to specific device

onBlipLongPress: (device) => {
  const targetPosition = getGridPosition(device);
  // Pan nucleus to align with blip
  // Then zoom in
}
```

---

## 📚 Mathematical Properties

### **Transformation Composition**
```
T_combined = T_rotation × T_scale

Properties:
1. Associative: (A × B) × C = A × (B × C)
2. NOT Commutative: A × B ≠ B × A
3. Identity: I × T = T × I = T
4. Inverse exists for non-zero determinant
```

### **Determinant**
```
det(viewTransformTensor) = viewScale²

Properties:
- det > 1: Area expansion (zoom in)
- det = 1: Area preserved (rotation only)
- det < 1: Area compression (zoom out)
- det ≠ 0: Transformation is invertible
```

### **Eigenvalues**
```
For rotation + uniform scale:
λ₁ = viewScale × e^(iθ)
λ₂ = viewScale × e^(-iθ)

|λ| = viewScale (magnitude)
arg(λ) = ±θ (rotation angle)
```

---

## 🎓 Key Insights

1. **Tensors enable elegant composition** of multiple transformations
2. **Order matters** in matrix multiplication (non-commutative)
3. **Nucleus-locked transformations** require careful coordinate management
4. **Multi-touch gestures** provide intuitive control
5. **Real-time tensor computation** is performant on modern devices
6. **Visual feedback** (grid + blips) makes transformations tangible

---

## 🎮 User Experience

### **Intuitive Gestures**
- ✅ Standard pinch-to-zoom (familiar to all users)
- ✅ Two-finger rotation (natural gesture)
- ✅ Smooth, responsive feedback
- ✅ Constrained zoom prevents disorientation
- ✅ One-tap reset for quick recovery

### **Accessibility**
- ✅ Visual indicators (zoom/rotation values)
- ✅ No gesture required (reset button available)
- ✅ Works with screen readers (button labels)
- ✅ High contrast UI elements

---

## 📖 Summary

The **Rotation & Zoom** feature leverages **tensor mathematics** to provide a sophisticated yet intuitive view transformation system. Key achievements:

✅ **Center-locked zoom** (0.5x - 3x)
✅ **Full 360° rotation**
✅ **Nucleus always centered** (drop icon fixed)
✅ **Multi-touch gestures** (pinch + rotate)
✅ **Real-time transformation** (tensor operations)
✅ **Grid and blips transform together**
✅ **Performance optimized** (memoized tensors)
✅ **Visual feedback** (live display + reset button)
✅ **Mathematically rigorous** (linear algebra)
✅ **Future-proof** (extensible to 3D)

The system demonstrates how **advanced mathematics** (tensor algebra, linear transformations) can create **elegant user experiences** while maintaining **high performance** and **code maintainability**.

---

**Transform your view. Transform your experience.** 🔄✨


