import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, Animated, Pressable, Modal, ScrollView, PanResponder, RefreshControl, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useDarkMode, usePinnedProfiles, useUserProfile, useToast, useLinkNotifications, useSettings } from '../../App';
import { saveDevice, getDevices, deleteDevice, restoreDevice, Device } from '../services/api';
import LinkIcon from '../components/LinkIcon';
import { useTutorial } from '../contexts/TutorialContext';
import TutorialOverlay from '../components/TutorialOverlay';
import { useBLEScanner, BleDevice } from '../components/BLEScanner';

// ========== TENSOR MATHEMATICS ENGINE ==========
// Multi-dimensional tensor operations for spatial calculations
//
// TENSOR SYSTEM ARCHITECTURE:
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 
// 1. COORDINATE TRANSFORMATION TENSORS
//    - 2×2 rotation matrices for angular positioning
//    - Scaling tensors for unit conversion (feet ↔ pixels)
//    - Quantization tensors for grid snapping
//
// 2. SPATIAL STATE TENSORS (per device)
//    - Position vector (x, y) in pixels from nucleus
//    - Velocity vector (dx/dt, dy/dt) computed via finite difference
//    - Acceleration vector (d²x/dt², d²y/dt²) for physics simulation
//    - Timestamp for temporal tracking
//
// 3. INTERACTION TENSORS
//    - Distance field: scalar field representing device density
//    - Interaction strength: pairwise device influence (inverse square law)
//    - Momentum vectors: mass × velocity for motion analysis
//
// 4. PREDICTIVE CAPABILITIES
//    - Euler integration: predict future positions using kinematics
//    - Trajectory extrapolation: estimate device paths
//    - Collision detection: anticipate spatial conflicts
//
// 5. MATHEMATICAL BENEFITS
//    - Linear algebra operations enable efficient bulk calculations
//    - Tensor composition allows complex transformations in single operations
//    - Memoization of transformation matrices improves performance
//    - Physics-based modeling creates realistic motion and interactions
//    - Extensible to 3D/AR with minimal refactoring (add z-component)
//
// FUTURE EXTENSIONS:
//    - 3×3 tensors for 3D/AR positioning
//    - Kalman filters for noise reduction in position tracking
//    - Neural tensor networks for pattern recognition
//    - Multi-user interaction tensors for collaborative features
//    - Gravitational field simulation for attraction/repulsion effects
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Vector2D {
  x: number;
  y: number;
}

interface Tensor2x2 {
  m11: number; m12: number;
  m21: number; m22: number;
}

interface SpatialTensor {
  position: Vector2D;
  velocity: Vector2D;
  acceleration: Vector2D;
  distance: number;
  angle: number;
  timestamp: number;
}

// Tensor Operations
const TensorMath = {
  // Matrix multiplication for 2x2 tensor
  multiply2x2: (t1: Tensor2x2, t2: Tensor2x2): Tensor2x2 => ({
    m11: t1.m11 * t2.m11 + t1.m12 * t2.m21,
    m12: t1.m11 * t2.m12 + t1.m12 * t2.m22,
    m21: t1.m21 * t2.m11 + t1.m22 * t2.m21,
    m22: t1.m21 * t2.m12 + t1.m22 * t2.m22,
  }),

  // Apply transformation tensor to vector
  transformVector: (tensor: Tensor2x2, vector: Vector2D): Vector2D => ({
    x: tensor.m11 * vector.x + tensor.m12 * vector.y,
    y: tensor.m21 * vector.x + tensor.m22 * vector.y,
  }),

  // Create rotation tensor (for coordinate transformations)
  rotationTensor: (angle: number): Tensor2x2 => ({
    m11: Math.cos(angle),
    m12: -Math.sin(angle),
    m21: Math.sin(angle),
    m22: Math.cos(angle),
  }),

  // Create scaling tensor (for distance mapping)
  scalingTensor: (scaleX: number, scaleY: number = scaleX): Tensor2x2 => ({
    m11: scaleX,
    m12: 0,
    m21: 0,
    m22: scaleY,
  }),

  // Vector dot product (scalar projection)
  dotProduct: (v1: Vector2D, v2: Vector2D): number => {
    return v1.x * v2.x + v1.y * v2.y;
  },

  // Vector magnitude (Euclidean norm)
  magnitude: (v: Vector2D): number => {
    return Math.sqrt(v.x * v.x + v.y * v.y);
  },

  // Normalize vector to unit length
  normalize: (v: Vector2D): Vector2D => {
    const mag = TensorMath.magnitude(v);
    return mag === 0 ? { x: 0, y: 0 } : { x: v.x / mag, y: v.y / mag };
  },

  // Linear interpolation between two vectors (for smooth animations)
  lerp: (v1: Vector2D, v2: Vector2D, t: number): Vector2D => ({
    x: v1.x + (v2.x - v1.x) * t,
    y: v1.y + (v2.y - v1.y) * t,
  }),

  // Distance field tensor - calculates influence strength at a point
  distanceField: (position: Vector2D, sources: Vector2D[], maxRadius: number): number => {
    let totalInfluence = 0;
    sources.forEach(source => {
      const dx = position.x - source.x;
      const dy = position.y - source.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      // Inverse square falloff (physics-based)
      const influence = Math.max(0, 1 - Math.pow(distance / maxRadius, 2));
      totalInfluence += influence;
    });
    return Math.min(1, totalInfluence);
  },

  // Compute velocity vector from position history (finite difference)
  computeVelocity: (currentPos: Vector2D, prevPos: Vector2D, deltaTime: number): Vector2D => {
    if (deltaTime === 0) return { x: 0, y: 0 };
    return {
      x: (currentPos.x - prevPos.x) / deltaTime,
      y: (currentPos.y - prevPos.y) / deltaTime,
    };
  },

  // Predict future position using velocity (Euler integration)
  predictPosition: (current: SpatialTensor, deltaTime: number): Vector2D => {
    return {
      x: current.position.x + current.velocity.x * deltaTime + 0.5 * current.acceleration.x * deltaTime * deltaTime,
      y: current.position.y + current.velocity.y * deltaTime + 0.5 * current.acceleration.y * deltaTime * deltaTime,
    };
  },
};

// Device Blip Component - extracted to avoid hooks in loops
const DeviceBlip: React.FC<{
  device: BleDevice;
  position: { x: number; y: number };
  nucleusX: number;
  nucleusY: number;
  viewTransform: Tensor2x2;
  onPress: () => void;
}> = ({ device, position, nucleusX, nucleusY, viewTransform, onPress }) => {
  // Create random delay based on device ID for staggered animation
  const randomDelay = useState(() => Math.random() * 1000)[0];
  const [pulseAnim] = useState(new Animated.Value(0));
  const BLIP_SIZE = 6; // pixels
  
  // DRAMATIZED pulse speed based on distance - closer = MUCH faster
  // Distance-based pulsation:
  // 0-5 feet: No pulsing (stay bright)
  // 5-10 feet: 300ms (very fast)
  // 10-20 feet: 800ms (medium)
  // 20-30 feet: 1500ms (slow)
  // 30+ feet: 2500ms (very slow)
  const distance = device.distanceFeet;
  let pulseDuration;
  let shouldPulse = true;
  
  if (distance <= 5) {
    shouldPulse = false; // No pulsing, stay solid bright
    pulseDuration = 0;
  } else if (distance <= 10) {
    pulseDuration = 300; // Very fast
  } else if (distance <= 20) {
    pulseDuration = 800; // Medium
  } else if (distance <= 30) {
    pulseDuration = 1500; // Slow
  } else {
    pulseDuration = 2500; // Very slow
  }
  
  useEffect(() => {
    if (!shouldPulse) {
      // Keep at full brightness for very close devices
      pulseAnim.setValue(1);
      return;
    }
    
    // Start with random delay for staggered effect
    const timer = setTimeout(() => {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: pulseDuration,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: pulseDuration,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
    }, randomDelay);
    
    return () => {
      clearTimeout(timer);
      pulseAnim.stopAnimation();
    };
  }, [pulseDuration, shouldPulse]);
  
  // More dramatic scale changes
  const scale = shouldPulse ? pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.3], // More dramatic scaling
  }) : 1.2; // Slightly larger when not pulsing
  
  // More dramatic opacity changes
  const opacity = shouldPulse ? pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1.0], // Wider range
  }) : 1.0; // Full brightness when not pulsing
  
  // Apply view transformation (rotation + zoom) to position
  const transformedPosition = TensorMath.transformVector(viewTransform, position);
  
  const hitAreaSize = 30; // Large hit area for easy tapping
  
  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        console.log('🔵 Blip clicked:', device.name, 'at distance:', device.distanceFeet);
        onPress();
      }}
      style={{
        position: 'absolute',
        left: nucleusX + transformedPosition.x - (hitAreaSize / 2),
        top: nucleusY + transformedPosition.y - (hitAreaSize / 2),
        width: hitAreaSize,
        height: hitAreaSize,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1001,
      }}
    >
      <Animated.View
        style={{
          width: BLIP_SIZE,
          height: BLIP_SIZE,
          borderRadius: BLIP_SIZE / 2,
          backgroundColor: '#00FF00',
          transform: [{ scale }],
          opacity,
          shadowColor: '#00FF00',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: shouldPulse ? 0.6 : 0.9,
          shadowRadius: shouldPulse ? 3 : 5,
        }}
        pointerEvents="none"
      />
    </Pressable>
  );
};

export default function HomeScreen() {
  const [fadeAnim] = useState(new Animated.Value(1));
  const [rippleAnim] = useState(new Animated.Value(0));
  const [flashAnim] = useState(new Animated.Value(0));
  const [showDrops, setShowDrops] = useState(false);
  const [selectedContactCard, setSelectedContactCard] = useState<any>(null);
  const [incomingDrops, setIncomingDrops] = useState<{ name: string; text: string }[]>([
    { name: 'Sarah Chen', text: 'just sent you a drop' },
    { name: 'Alex Rivera', text: 'just sent you a drop' },
  ]);
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [linkPopupAnim] = useState(new Animated.Value(0));
  const [popupKey, setPopupKey] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDiscoverable, setIsDiscoverable] = useState(true);
  const [pinnedProfiles, setPinnedProfiles] = useState<Device[]>([]);
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBlipDevice, setSelectedBlipDevice] = useState<BleDevice | null>(null);
  const [showBlipModal, setShowBlipModal] = useState(false);
  
  // ========== ROTATION & ZOOM STATE ==========
  const [viewRotation, setViewRotation] = useState(0); // Rotation angle in radians
  const [viewScale, setViewScale] = useState(1); // Zoom scale factor (1 = normal, 2 = 2x zoom)
  const rotationAnimValue = useRef(new Animated.Value(0)).current;
  const scaleAnimValue = useRef(new Animated.Value(1)).current;
  
  // Gesture tracking for multi-touch
  const gestureState = useRef({
    initialDistance: 0,
    initialRotation: 0,
    initialScale: 1,
    initialAngle: 0,
  }).current;
  const { isDarkMode } = useDarkMode();
  const { pinnedIds, togglePin } = usePinnedProfiles();
  const { profile } = useUserProfile();
  const { showToast } = useToast();
  const { linkNotifications, dismissNotification, markAsViewed, addLinkNotification } = useLinkNotifications();
  const { currentStep, totalSteps, isActive, nextStep, prevStep, skipTutorial, startScreenTutorial, currentScreen } = useTutorial();
  const { maxDistance } = useSettings();
  const theme = getTheme(isDarkMode);
  
  // Use BLE scanner for nearby devices
  const { devices, isScanning, startScan, stopScan } = useBLEScanner();

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  
  // MATHEMATICAL CONSTANTS FOR NUCLEUS POSITIONING
  const BOTTOM_NAV_HEIGHT = 60; // Height of bottom navigation bar (pixels)
  const DROP_ICON_SIZE = 30; // Size of water drop icon (pixels)
  const MAX_RADIUS_FEET = 33; // Maximum radius in feet
  
  // Calculate the viewable area (screen minus bottom nav)
  const viewableHeight = screenHeight - BOTTOM_NAV_HEIGHT;
  
  // Calculate the NUCLEUS (origin point 0,0) - center of viewable area
  const nucleusX = screenWidth / 2; // Exact horizontal center
  const nucleusY = viewableHeight / 2; // Exact vertical center of viewable area
  
  // Icon offset to center it perfectly (half the icon size)
  const iconOffsetX = DROP_ICON_SIZE / 2; // 15 pixels
  const iconOffsetY = DROP_ICON_SIZE / 2; // 15 pixels

  // Start Home screen tutorial when component mounts
  useEffect(() => {
    startScreenTutorial('Home', 6);
  }, []);

  // Start BLE scanning when component mounts
  useEffect(() => {
    startScan();
    return () => stopScan(); // Cleanup on unmount
  }, []);
  
  // Get unviewed and not dismissed link notifications for badge
  const unviewedLinks = linkNotifications.filter(notif => !notif.viewed && !notif.dismissed);
  const hasUnviewedLinks = unviewedLinks.length > 0;

  // Tutorial steps for Home screen
  const tutorialSteps = [
    {
      message: 'Welcome to DropLink! This is your home screen.',
      position: {
        top: 80,
        left: 20,
        right: 20,
      },
      arrow: undefined,
    },
    {
      message: 'Toggle your visibility here. Active = discoverable, Ghost = invisible.',
      position: {
        top: 60,
        left: 20,
      },
      arrow: 'up' as const,
    },
    {
      message: 'Tap this to see incoming requests and link notifications.',
      position: {
        top: screenHeight * 0.54,
        left: screenWidth * 0.15,
        right: screenWidth * 0.15,
      },
      arrow: 'up' as const,
    },
    {
      message: 'Your pinned contacts appear here. Double-tap a card to manage.',
      position: {
        top: screenHeight * 0.2,
        left: screenWidth * 0.4,
      },
      arrow: 'left' as const,
    },
    {
      message: 'This is your contact card. Set up your info in the Account page!',
      position: {
        top: screenHeight * 0.35,
        right: screenWidth * 0.08,
      },
      arrow: 'down' as const,
    },
    {
      message: 'Swipe left to find nearby people and start dropping!',
      position: {
        bottom: 120,
        left: 20,
        right: 20,
      },
      arrow: 'right' as const,
    },
  ];

  // Filter devices within max distance
  const filteredDevices = devices.filter(device => device.distanceFeet <= maxDistance);

  // ========== TENSOR-BASED SPATIAL SYSTEM ==========
  
  // Memoized spatial transformation tensors
  const spatialTensors = useMemo(() => {
    const maxRadiusPixels = Math.min(nucleusX, nucleusY, screenWidth - nucleusX, viewableHeight - nucleusY);
    const pixelsPerFoot = maxRadiusPixels / MAX_RADIUS_FEET;
    
    return {
      // Scaling tensor: maps feet to pixels
      feetToPixels: TensorMath.scalingTensor(pixelsPerFoot),
      
      // Grid quantization tensor: snaps to 1-foot intervals
      gridSnap: TensorMath.scalingTensor(1 / pixelsPerFoot),
      
      maxRadiusPixels,
      pixelsPerFoot,
    };
  }, [nucleusX, nucleusY, screenWidth, viewableHeight, MAX_RADIUS_FEET]);

  // Spatial tensor tracking for all devices (position, velocity, acceleration)
  const deviceSpatialTensors = useRef<Map<string, SpatialTensor>>(new Map());

  // Map device to grid position using TENSOR MATHEMATICS
  const getGridPosition = (device: BleDevice): Vector2D => {
    const deviceId = device.id || device.name;
    const currentTime = Date.now();
    
    // Generate consistent angle based on device hash (deterministic positioning)
    const hash = device.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const angle = (hash % 360) * (Math.PI / 180);
    
    // Create rotation tensor for this device's angle
    const rotationTensor = TensorMath.rotationTensor(angle);
    
    // Calculate distance ratio (normalized to [0,1])
    const distanceRatio = Math.min(device.distanceFeet / MAX_RADIUS_FEET, 1);
    
    // Create radial vector in polar coordinates, then transform to Cartesian
    const radialVector: Vector2D = { x: distanceRatio * spatialTensors.maxRadiusPixels, y: 0 };
    
    // Apply rotation tensor to get Cartesian position
    const cartesianPosition = TensorMath.transformVector(rotationTensor, radialVector);
    
    // Snap to grid using quantization tensor
    const snappedPosition: Vector2D = {
      x: Math.round(cartesianPosition.x / spatialTensors.pixelsPerFoot) * spatialTensors.pixelsPerFoot,
      y: Math.round(cartesianPosition.y / spatialTensors.pixelsPerFoot) * spatialTensors.pixelsPerFoot,
    };
    
    // Update spatial tensor tracking (for future velocity/acceleration features)
    const previousTensor = deviceSpatialTensors.current.get(deviceId);
    
    if (previousTensor) {
      const deltaTime = (currentTime - previousTensor.timestamp) / 1000; // seconds
      
      // Compute velocity using finite difference
      const velocity = TensorMath.computeVelocity(
        snappedPosition,
        previousTensor.position,
        deltaTime
      );
      
      // Compute acceleration (change in velocity)
      const acceleration = TensorMath.computeVelocity(
        velocity,
        previousTensor.velocity,
        deltaTime
      );
      
      // Store updated tensor
      deviceSpatialTensors.current.set(deviceId, {
        position: snappedPosition,
        velocity,
        acceleration,
        distance: device.distanceFeet,
        angle,
        timestamp: currentTime,
      });
    } else {
      // Initialize tensor for new device
      deviceSpatialTensors.current.set(deviceId, {
        position: snappedPosition,
        velocity: { x: 0, y: 0 },
        acceleration: { x: 0, y: 0 },
        distance: device.distanceFeet,
        angle,
        timestamp: currentTime,
      });
    }
    
    return snappedPosition;
  };

  // ========== ADVANCED TENSOR FEATURES ==========
  
  // Calculate spatial density field (heat map) using tensor operations
  const calculateSpatialDensity = useMemo(() => {
    const devicePositions: Vector2D[] = filteredDevices.map(device => getGridPosition(device));
    
    // Create density field function
    return (testPoint: Vector2D): number => {
      return TensorMath.distanceField(testPoint, devicePositions, spatialTensors.maxRadiusPixels);
    };
  }, [filteredDevices, spatialTensors.maxRadiusPixels]);

  // Calculate interaction tensor between two devices
  const calculateInteractionStrength = (device1: BleDevice, device2: BleDevice): number => {
    const pos1 = getGridPosition(device1);
    const pos2 = getGridPosition(device2);
    
    const displacement: Vector2D = { x: pos2.x - pos1.x, y: pos2.y - pos1.y };
    const distance = TensorMath.magnitude(displacement);
    
    // Interaction strength falls off with distance (inverse square law)
    const maxInteractionDistance = spatialTensors.maxRadiusPixels;
    const strength = Math.max(0, 1 - Math.pow(distance / maxInteractionDistance, 2));
    
    return strength;
  };

  // Predictive positioning: estimate where a device will be in N seconds
  const predictFuturePosition = (device: BleDevice, futureDeltaTime: number): Vector2D | null => {
    const deviceId = device.id || device.name;
    const spatialTensor = deviceSpatialTensors.current.get(deviceId);
    
    if (!spatialTensor) return null;
    
    // Use physics-based prediction (position + velocity*t + 0.5*acceleration*t²)
    return TensorMath.predictPosition(spatialTensor, futureDeltaTime);
  };

  // ========== VIEW TRANSFORMATION TENSORS (ROTATION & ZOOM) ==========
  
  // Create combined view transformation tensor (scale + rotation)
  const viewTransformTensor = useMemo((): Tensor2x2 => {
    // First scale, then rotate (order matters in transformation composition)
    const scaleTensor = TensorMath.scalingTensor(viewScale);
    const rotationTensor = TensorMath.rotationTensor(viewRotation);
    
    // Compose transformations: T_final = T_rotation × T_scale
    return TensorMath.multiply2x2(rotationTensor, scaleTensor);
  }, [viewScale, viewRotation]);

  // Apply view transformation to a position vector
  const applyViewTransform = (position: Vector2D): Vector2D => {
    return TensorMath.transformVector(viewTransformTensor, position);
  };

  // Calculate momentum vector for a device (mass assumed to be 1)
  const calculateMomentum = (device: BleDevice): Vector2D | null => {
    const deviceId = device.id || device.name;
    const spatialTensor = deviceSpatialTensors.current.get(deviceId);
    
    if (!spatialTensor) return null;
    
    // Momentum = mass × velocity (mass = 1 for simplicity)
    return spatialTensor.velocity;
  };

  // Log view transformation changes
  useEffect(() => {
    if (viewScale !== 1 || viewRotation !== 0) {
      console.log('🔄 VIEW TRANSFORMATION UPDATE:');
      console.log(`   Scale: ${viewScale.toFixed(3)}x`);
      console.log(`   Rotation: ${(viewRotation * 180 / Math.PI).toFixed(1)}° (${viewRotation.toFixed(3)} rad)`);
      console.log(`   Transform Tensor: [[${viewTransformTensor.m11.toFixed(3)}, ${viewTransformTensor.m12.toFixed(3)}], [${viewTransformTensor.m21.toFixed(3)}, ${viewTransformTensor.m22.toFixed(3)}]]`);
    }
  }, [viewScale, viewRotation, viewTransformTensor]);

  // Demonstrate tensor system capabilities (logs to console)
  useEffect(() => {
    if (filteredDevices.length > 0) {
      console.log('🧮 TENSOR MATHEMATICS SYSTEM ACTIVE 🧮');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Log spatial tensors
      console.log('📐 Spatial Transformation Tensors:');
      console.log(`   Pixels per foot: ${spatialTensors.pixelsPerFoot.toFixed(2)}px`);
      console.log(`   Max radius: ${spatialTensors.maxRadiusPixels.toFixed(2)}px`);
      console.log(`   Scaling tensor: [[${spatialTensors.feetToPixels.m11.toFixed(2)}, ${spatialTensors.feetToPixels.m12}], [${spatialTensors.feetToPixels.m21}, ${spatialTensors.feetToPixels.m22.toFixed(2)}]]`);
      
      // Log first device's tensor data
      const firstDevice = filteredDevices[0];
      const deviceId = firstDevice.id || firstDevice.name;
      const spatialTensor = deviceSpatialTensors.current.get(deviceId);
      
      if (spatialTensor) {
        console.log(`\n📍 Device Tensor: "${firstDevice.name}"`);
        console.log(`   Position: (${spatialTensor.position.x.toFixed(1)}px, ${spatialTensor.position.y.toFixed(1)}px)`);
        console.log(`   Velocity: (${spatialTensor.velocity.x.toFixed(2)}px/s, ${spatialTensor.velocity.y.toFixed(2)}px/s)`);
        console.log(`   Acceleration: (${spatialTensor.acceleration.x.toFixed(2)}px/s², ${spatialTensor.acceleration.y.toFixed(2)}px/s²)`);
        console.log(`   Distance: ${spatialTensor.distance.toFixed(1)} ft`);
        console.log(`   Angle: ${(spatialTensor.angle * 180 / Math.PI).toFixed(1)}°`);
        
        // Predict future position
        const future = predictFuturePosition(firstDevice, 1.0); // 1 second ahead
        if (future) {
          console.log(`   Predicted position (1s): (${future.x.toFixed(1)}px, ${future.y.toFixed(1)}px)`);
        }
      }
      
      // Log interaction strengths
      if (filteredDevices.length >= 2) {
        const interaction = calculateInteractionStrength(filteredDevices[0], filteredDevices[1]);
        console.log(`\n🔗 Interaction Strength: ${(interaction * 100).toFixed(1)}%`);
      }
      
      // Log spatial density at nucleus
      const nucleusDensity = calculateSpatialDensity({ x: 0, y: 0 });
      console.log(`\n🌡️ Spatial Density at Nucleus: ${(nucleusDensity * 100).toFixed(1)}%`);
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
  }, [filteredDevices, spatialTensors, calculateSpatialDensity]);

  // ========== MULTI-TOUCH GESTURE HANDLER (ROTATION & ZOOM) ==========
  
  // Helper: Calculate distance between two touch points
  const getTouchDistance = (touches: any[]) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Helper: Calculate angle between two touch points
  const getTouchAngle = (touches: any[]) => {
    if (touches.length < 2) return 0;
    const dx = touches[1].pageX - touches[0].pageX;
    const dy = touches[1].pageY - touches[0].pageY;
    return Math.atan2(dy, dx);
  };

  // Multi-touch gesture responder (pinch zoom + rotation)
  const gestureResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
      
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          gestureState.initialDistance = getTouchDistance(touches);
          gestureState.initialRotation = getTouchAngle(touches);
          gestureState.initialScale = viewScale;
          gestureState.initialAngle = viewRotation;
        }
      },
      
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          // Calculate pinch zoom
          const currentDistance = getTouchDistance(touches);
          const scale = (currentDistance / gestureState.initialDistance) * gestureState.initialScale;
          
          // Constrain zoom: 0.5x to 3x
          const constrainedScale = Math.max(0.5, Math.min(3, scale));
          setViewScale(constrainedScale);
          scaleAnimValue.setValue(constrainedScale);
          
          // Calculate rotation
          const currentAngle = getTouchAngle(touches);
          const rotation = currentAngle - gestureState.initialRotation + gestureState.initialAngle;
          setViewRotation(rotation);
          rotationAnimValue.setValue(rotation);
        }
      },
      
      onPanResponderRelease: () => {
        // Optionally snap to nearest 45° angle
        // const snappedRotation = Math.round(viewRotation / (Math.PI / 4)) * (Math.PI / 4);
        // setViewRotation(snappedRotation);
      },
    })
  ).current;

  // Stack drag animation
  const dragOffset = useRef(new Animated.Value(0)).current;
  const [isDragging, setIsDragging] = useState(false);
  
  // Tap animations for each card (stored by profile ID)
  const tapScales = useRef<{ [key: number]: Animated.Value }>({}).current;

  // Quick action states
  const [activeQuickActionCardId, setActiveQuickActionCardId] = useState<number | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'unpin' | 'delete' | null>(null);
  const [confirmCardId, setConfirmCardId] = useState<number | null>(null);
  const [confirmCardName, setConfirmCardName] = useState<string>('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const lastTapTime = useRef<number>(0);
  const lastTapCardId = useRef<number | null>(null);
  
  // Toggle confirmation states
  const [showToggleConfirmModal, setShowToggleConfirmModal] = useState(false);
  const [pendingDiscoverableState, setPendingDiscoverableState] = useState<boolean | null>(null);
  
  // Undo state - using ref to avoid closure issues
  const lastActionRef = useRef<{ type: 'unpin' | 'delete', cardId: number, card: Device | null } | null>(null);

  // Load pinned profiles
  useEffect(() => {
    console.log('📌 useEffect triggered - pinnedIds changed, size:', pinnedIds.size);
    (async () => {
      const devices = await getDevices();
      console.log('📋 Got devices from API:', devices.length);
      const pinned = devices.filter(d => d.id && pinnedIds.has(d.id));
      console.log('📌 Filtered to pinned devices:', pinned.length, 'IDs:', Array.from(pinnedIds));
      setPinnedProfiles(pinned);
    })();
  }, [pinnedIds]);

  // Flashing animation for link badge
  useEffect(() => {
    if (hasUnviewedLinks) {
      // Start flashing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(flashAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(flashAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      flashAnim.setValue(0);
    }
  }, [hasUnviewedLinks]);

  // PanResponder for dragging the stack
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only activate for significant downward drags
        return Math.abs(gestureState.dy) > 10 && gestureState.dy > 0;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        // Capture movement if it's a clear downward drag
        return Math.abs(gestureState.dy) > 10 && gestureState.dy > 0;
      },
      onPanResponderGrant: () => {
        setIsDragging(true);
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow dragging down, limit to 200px max
        const newValue = Math.max(0, Math.min(gestureState.dy, 200));
        dragOffset.setValue(newValue);
      },
      onPanResponderRelease: () => {
        setIsDragging(false);
        // Bounce back with spring animation
        Animated.spring(dragOffset, {
          toValue: 0,
          tension: 40,
          friction: 7,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  const showLinkPopupAnimation = () => {
    console.log('Showing link popup animation');
    setPopupKey(prev => prev + 1);
    setShowLinkPopup(true);
    setIsAnimating(true);
    
    // Reset animation value
    linkPopupAnim.setValue(0);
    
    Animated.sequence([
      Animated.timing(linkPopupAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.delay(2500),
      Animated.timing(linkPopupAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowLinkPopup(false);
      setIsAnimating(false);
    });
  };

  const handleRaindropPress = () => {
    // Trigger ripple animation
    Animated.sequence([
      Animated.timing(rippleAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(rippleAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Show drops modal
    setShowDrops(true);
  };

  const handleDropAction = async (action: 'accepted' | 'returned' | 'declined', drop: { name: string; text: string }) => {
    console.log('Drop action:', action, 'for:', drop.name);
    
    // Show link popup for returned drops IMMEDIATELY
    if (action === 'returned') {
      showLinkPopupAnimation();
    }
    
    await saveDevice({ 
      name: drop.name, 
      rssi: -55, 
      distanceFeet: 18, 
      action 
    });
    
    // Remove the drop from the list
    setIncomingDrops(prev => prev.filter(d => d.name !== drop.name));
    
    // Close modal if no more drops
    if (incomingDrops.length <= 1) {
      setShowDrops(false);
    }
  };

  // Handle quick action button press (unpin or delete)
  const handleQuickActionPress = (action: 'unpin' | 'delete', cardId: number, cardName: string) => {
    console.log('Quick action pressed:', action, cardName);
    setConfirmAction(action);
    setConfirmCardId(cardId);
    setConfirmCardName(cardName);
    setShowConfirmModal(true);
    setActiveQuickActionCardId(null); // Hide action buttons
    console.log('Confirmation modal should now be visible');
  };

  // Handle confirmation
  const handleConfirmAction = async () => {
    console.log('=== handleConfirmAction called ===');
    
    if (!confirmCardId || !confirmAction || !confirmCardName) {
      console.log('EARLY RETURN - missing data');
      return;
    }

    const actionName = confirmCardName;
    const actionType = confirmAction;

    console.log('Performing action:', actionType, 'for', actionName);

    // Store the card for undo BEFORE performing the action
    const cardToStore = pinnedProfiles.find(p => p.id === confirmCardId) || null;
    console.log('💾 Storing card for undo:', cardToStore?.name, 'ID:', cardToStore?.id);
    
    const actionData = { type: actionType, cardId: confirmCardId, card: cardToStore };
    lastActionRef.current = actionData; // Store in ref synchronously
    console.log('💾 Ref updated with:', actionData);
    
    // Perform the action
    if (actionType === 'unpin') {
      togglePin(confirmCardId);
    } else if (actionType === 'delete') {
      // Delete from API/store (removes from Link page)
      await deleteDevice(confirmCardId);
      // Remove from pinned profiles (removes from Home page)
      setPinnedProfiles(prev => prev.filter(p => p.id !== confirmCardId));
      // Unpin
      togglePin(confirmCardId);
      console.log('🗑️ Device deleted from all locations');
    }

    // Close confirmation modal
    setShowConfirmModal(false);
    
    // Reset confirmation states
    setConfirmAction(null);
    setConfirmCardId(null);
    setConfirmCardName('');
    
    // Show toast with undo option
    showToast({
      message: `${actionName} ${actionType === 'unpin' ? 'unpinned' : 'deleted'}`,
      type: 'success',
      duration: 4000,
      actionLabel: 'UNDO',
      onAction: handleUndo,
    });
    console.log('✅ TOAST WITH UNDO SHOWN');
  };

  // Handle undo
  const handleUndo = async () => {
    const lastAction = lastActionRef.current; // Get current value from ref
    console.log('🔘 handleUndo CALLED! lastAction:', lastAction);
    
    if (!lastAction) {
      console.log('⚠️ No lastAction stored, cannot undo');
      return;
    }

    console.log('🔄 UNDOING action:', lastAction.type, 'for card ID:', lastAction.cardId);

    if (lastAction.type === 'unpin') {
      // Re-pin the contact
      togglePin(lastAction.cardId);
      console.log('✅ Contact re-pinned');
    } else if (lastAction.type === 'delete' && lastAction.card) {
      console.log('Starting restore process for:', lastAction.card.name);
      
      // Step 1: Restore to API/store first and wait for it
      await restoreDevice(lastAction.card);
      console.log('✅ Device restored to API/store');
      
      // Step 2: Re-add to pinnedProfiles immediately for instant UI feedback
      setPinnedProfiles(prev => {
        // Make sure it's not already there
        if (prev.some(p => p.id === lastAction.cardId)) {
          console.log('⚠️ Card already in pinnedProfiles');
          return prev;
        }
        console.log('✅ Adding card back to pinnedProfiles UI');
        return [...prev, lastAction.card!];
      });
      
      // Step 3: Re-pin to persist it (this will be saved in the context)
      togglePin(lastAction.cardId);
      console.log('✅ Pin toggled back on, ID added to pinnedIds');
    }

    lastActionRef.current = null; // Clear the ref
  };

  // Handle toggle button press
  const handleTogglePress = () => {
    const newState = !isDiscoverable;
    setPendingDiscoverableState(newState);
    setShowToggleConfirmModal(true);
  };

  // Confirm toggle change
  const confirmToggleChange = () => {
    if (pendingDiscoverableState !== null) {
      setIsDiscoverable(pendingDiscoverableState);
    }
    setShowToggleConfirmModal(false);
    setPendingDiscoverableState(null);
  };

  // Cancel toggle change
  const cancelToggleChange = () => {
    setShowToggleConfirmModal(false);
    setPendingDiscoverableState(null);
  };

  // Refresh handler
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const devices = await getDevices();
      const pinned = devices.filter(d => d.id && pinnedIds.has(d.id));
      setPinnedProfiles(pinned);
    } catch (error) {
      console.error('Failed to refresh pinned profiles:', error);
    } finally {
      setRefreshing(false);
    }
  };


  return (
    <Animated.View style={{ flex:1, backgroundColor: theme.colors.bg, opacity: fadeAnim }}>
      {/* Grid Paper Background - full screen with gesture handling */}
      <View 
        {...gestureResponder.panHandlers}
        style={{ 
          position: 'absolute', 
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 0,
        }}
        pointerEvents="box-none"
      >
        {(() => {
          // Calculate pixels per foot based on nucleus positioning
          const maxRadiusPixels = Math.min(nucleusX, nucleusY, screenWidth - nucleusX, viewableHeight - nucleusY);
          const pixelsPerFoot = maxRadiusPixels / MAX_RADIUS_FEET; // 1 foot intervals
          
          // Calculate how many grid lines we need (extended for zoom)
          const gridRange = Math.ceil(Math.max(screenWidth, screenHeight) / (pixelsPerFoot * viewScale));
          const totalLines = gridRange * 2 + 1;
          
          return (
            <>
              {/* Vertical lines - transformed by view rotation & zoom */}
              {Array.from({ length: totalLines }, (_, i) => {
                const offset = (i - gridRange) * pixelsPerFoot;
                const lineStart: Vector2D = { x: offset, y: -screenHeight };
                const lineEnd: Vector2D = { x: offset, y: screenHeight * 2 };
                
                // Apply view transformation
                const transformedStart = TensorMath.transformVector(viewTransformTensor, lineStart);
                const transformedEnd = TensorMath.transformVector(viewTransformTensor, lineEnd);
                
                // Calculate rotation angle for the line
                const dx = transformedEnd.x - transformedStart.x;
                const dy = transformedEnd.y - transformedStart.y;
                const lineAngle = Math.atan2(dy, dx) + Math.PI / 2; // Perpendicular
                const lineLength = Math.sqrt(dx * dx + dy * dy);
                
                return (
                  <View
                    key={`v-${i}`}
                    style={{
                      position: 'absolute',
                      left: nucleusX + transformedStart.x,
                      top: nucleusY + transformedStart.y,
                      width: 0.5,
                      height: lineLength,
                      backgroundColor: '#00FF00',
                      opacity: offset === 0 ? 0.5 : 0.3,
                      transform: [{ rotate: `${lineAngle}rad` }],
                      transformOrigin: 'top left',
                    }}
                    pointerEvents="none"
                  />
                );
              })}
              
              {/* Horizontal lines - transformed by view rotation & zoom */}
              {Array.from({ length: totalLines }, (_, i) => {
                const offset = (i - gridRange) * pixelsPerFoot;
                const lineStart: Vector2D = { x: -screenWidth, y: offset };
                const lineEnd: Vector2D = { x: screenWidth * 2, y: offset };
                
                // Apply view transformation
                const transformedStart = TensorMath.transformVector(viewTransformTensor, lineStart);
                const transformedEnd = TensorMath.transformVector(viewTransformTensor, lineEnd);
                
                // Calculate rotation angle for the line
                const dx = transformedEnd.x - transformedStart.x;
                const dy = transformedEnd.y - transformedStart.y;
                const lineAngle = Math.atan2(dy, dx);
                const lineLength = Math.sqrt(dx * dx + dy * dy);
                
                return (
                  <View
                    key={`h-${i}`}
                    style={{
                      position: 'absolute',
                      left: nucleusX + transformedStart.x,
                      top: nucleusY + transformedStart.y,
                      width: lineLength,
                      height: 0.5,
                      backgroundColor: '#00FF00',
                      opacity: offset === 0 ? 0.5 : 0.3,
                      transform: [{ rotate: `${lineAngle}rad` }],
                      transformOrigin: 'top left',
                    }}
                    pointerEvents="none"
                  />
                );
              })}
            </>
          );
        })()}
      </View>

      {/* Pulsating Blips for Nearby Devices - Outside grid container for better touch handling */}
      <View 
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          zIndex: 1000,
        }}
        pointerEvents="box-none"
      >
        {filteredDevices.map((device) => {
          const position = getGridPosition(device);
          
          return (
            <DeviceBlip
              key={device.id || device.name}
              device={device}
              position={position}
              nucleusX={nucleusX}
              nucleusY={nucleusY}
              viewTransform={viewTransformTensor}
              onPress={() => {
                console.log('✅ Blip press handler called for:', device.name);
                setSelectedBlipDevice(device);
                setShowBlipModal(true);
              }}
            />
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.blue}
            colors={[theme.colors.blue]}
          />
        }
        scrollEnabled={false}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: typeof window !== 'undefined' ? window.innerHeight : 800 }}>
          {/* Background overlay to close expanded cards and quick actions when clicking outside */}
          {(expandedCardId !== null || activeQuickActionCardId !== null) && (
            <Pressable
              onPress={() => {
                setExpandedCardId(null);
                setActiveQuickActionCardId(null);
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 5,
              }}
            />
          )}

        {/* Pinned Profiles Stack - REMOVED */}
        {false && pinnedProfiles.length > 0 && (() => {
          // Calculate total height of the stack
          const cardHeight = 280; // Approximate full card height
          // Dynamic spacing: increase when dragging
          const baseSpacing = 45;
          const spacingMultiplier = isDragging ? 1.8 : 1;
          const stackSpacing = baseSpacing * spacingMultiplier;
          const totalStackHeight = cardHeight + ((pinnedProfiles.length - 1) * stackSpacing);
          
          return (
          <Animated.View 
            style={{
            position: 'absolute',
              left: '3%',
            top: '50%',
              transform: [
                { translateY: -240 },
                { translateY: dragOffset }
              ],
              width: 150,
            maxHeight: 600,
            zIndex: 10,
            }}
            {...panResponder.panHandlers}
          >
            <ScrollView 
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ minHeight: totalStackHeight }}
              scrollEnabled={!isDragging}
            >
              {pinnedProfiles.map((profile, index) => {
                const isExpanded = expandedCardId === profile.id;
                const isBottomCard = index === 0;
                // Reverse order: bottom card should be rendered last (highest in stack visually at bottom)
                const stackPosition = pinnedProfiles.length - 1 - index;
                
                // Parallax effect: cards deeper in stack move MORE to spread out
                const parallaxMultiplier = stackPosition * 0.5; // 50% more per position
                const parallaxOffset = dragOffset.interpolate({
                  inputRange: [0, 200],
                  outputRange: [0, 200 * parallaxMultiplier], // Positive to spread cards apart
                });

                // Get or create tap animation value for this card
                if (profile.id && !tapScales[profile.id]) {
                  tapScales[profile.id] = new Animated.Value(1);
                }
                const tapScale = profile.id ? tapScales[profile.id] : new Animated.Value(1);

                const handleTap = () => {
                  if (!profile.id) return;

                  const now = Date.now();
                  const timeSinceLastTap = now - lastTapTime.current;
                  const isDoubleTap = timeSinceLastTap < 800 && lastTapCardId.current === profile.id;

                  lastTapTime.current = now;
                  lastTapCardId.current = profile.id;

                  if (isDoubleTap) {
                    // Double tap - toggle quick actions
                    console.log('Double tap detected on:', profile.name);
                    setActiveQuickActionCardId(activeQuickActionCardId === profile.id ? null : profile.id);
                  } else {
                    // Single tap - pulse animation and expand (not collapse)
                    Animated.sequence([
                      Animated.timing(tapScale, {
                        toValue: 1.05,
                        duration: 100,
                        useNativeDriver: true,
                      }),
                      Animated.timing(tapScale, {
                        toValue: 1,
                        duration: 100,
                        useNativeDriver: true,
                      }),
                    ]).start();

                    // Hide quick actions when switching cards
                    if (activeQuickActionCardId !== null && activeQuickActionCardId !== profile.id) {
                      setActiveQuickActionCardId(null);
                    }

                    // Expand card - clicking on already expanded card keeps it expanded
                    // Clicking on different card switches the expanded card
                    if (!isBottomCard) {
                      setExpandedCardId(profile.id);
                    }
                  }
                };
                
                return (
                <Animated.View
                  key={profile.id}
                  style={{
                    position: 'absolute',
                    top: stackPosition * stackSpacing,
                    left: 0,
                    right: 0,
                    zIndex: activeQuickActionCardId === profile.id ? 1001 : (isExpanded ? 1000 : (pinnedProfiles.length - index)),
                    transform: [
                      { translateY: parallaxOffset },
                      { scale: tapScale }
                    ],
                  }}
                >
                  <Pressable
                    onPress={handleTap}
                    style={{
                      ...theme.card,
                      width: 150,
                      overflow: isExpanded || activeQuickActionCardId === profile.id || isDragging ? 'visible' : 'hidden',
                      zIndex: activeQuickActionCardId === profile.id ? 999 : 1,
                    }}
                  >
                    {/* ID Header - Always visible */}
                    <View style={{
                      backgroundColor: '#FF6B4A',
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      alignItems: 'center',
                    }}>
                      <Text style={[theme.type.h2, { color: theme.colors.white, fontSize: 12 }]}>
                        {profile.name}
                      </Text>
                    </View>

                    {/* ID Content - Show for bottom card, when expanded, or when dragging */}
                    {(isBottomCard || isExpanded || isDragging) && (
                    <View style={{ paddingTop: 10, paddingHorizontal: 10, paddingBottom: 4 }}>
                      {/* Profile Picture */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                        <View style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: '#FFE5DC',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <MaterialCommunityIcons name="account" size={18} color="#FF6B4A" />
                        </View>
                      </View>

                      {/* Contact Information */}
                      <View style={{ marginBottom: 6 }}>
                        {/* Phone */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                          <MaterialCommunityIcons name="phone" size={10} color={theme.colors.muted} />
                          <Text style={[theme.type.body, { marginLeft: 4, color: theme.colors.text, fontSize: 8 }]}>
                            +1 (555) 123-4567
                          </Text>
                        </View>

                        {/* Email */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                          <MaterialCommunityIcons name="email" size={10} color={theme.colors.muted} />
                          <Text style={[theme.type.body, { marginLeft: 4, color: theme.colors.text, fontSize: 8 }]}>
                            user@example.com
                          </Text>
                        </View>

                        {/* Social Media */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                          <MaterialCommunityIcons name="instagram" size={10} color={theme.colors.muted} />
                          <Text style={[theme.type.body, { marginLeft: 4, color: theme.colors.text, fontSize: 8 }]}>
                            @yourhandle
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                          <MaterialCommunityIcons name="twitter" size={10} color={theme.colors.muted} />
                          <Text style={[theme.type.body, { marginLeft: 4, color: theme.colors.text, fontSize: 8 }]}>
                            @yourhandle
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                          <MaterialCommunityIcons name="linkedin" size={10} color={theme.colors.muted} />
                          <Text style={[theme.type.body, { marginLeft: 4, color: theme.colors.text, fontSize: 8 }]}>
                            yourname
                          </Text>
                        </View>
                      </View>

                      {/* Bio Section */}
                      <View style={{
                        backgroundColor: theme.colors.bg,
                        padding: 6,
                        borderRadius: 6,
                      }}>
                        <Text style={[theme.type.muted, { fontSize: 6, marginBottom: 1 }]}>
                          BIO
                        </Text>
                        <Text style={[theme.type.body, { fontSize: 7, color: theme.colors.text }]}>
                          "Optional bio line goes here."
                        </Text>
                      </View>
                      </View>
                    )}
                  </Pressable>

                  {/* Quick Action Buttons (shown on double-tap) - Always accessible */}
                  {activeQuickActionCardId === profile.id && (
                    <View style={{
                      flexDirection: 'row',
                      gap: 8,
                      paddingHorizontal: 10,
                      paddingTop: 4,
                      paddingBottom: 10,
                      backgroundColor: theme.colors.white,
                      borderBottomLeftRadius: 12,
                      borderBottomRightRadius: 12,
                      width: 150,
                    }}>
                      <Pressable
                        onPress={() => profile.id && handleQuickActionPress('unpin', profile.id, profile.name)}
                        style={{
                          flex: 1,
                          backgroundColor: '#FFB89D',
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <MaterialCommunityIcons name="pin-off" size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 10, marginLeft: 4, fontWeight: '600' }}>
                          Unpin
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => profile.id && handleQuickActionPress('delete', profile.id, profile.name)}
                        style={{
                          flex: 1,
                          backgroundColor: '#FF6B4A',
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <MaterialCommunityIcons name="delete" size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 10, marginLeft: 4, fontWeight: '600' }}>
                          Delete
                        </Text>
                  </Pressable>
                </View>
                  )}
                </Animated.View>
                );
              })}
            </ScrollView>
          </Animated.View>
          );
        })()}
        </View>
      </ScrollView>

      {/* Central Raindrop Logo with Ripple - THE NUCLEUS (ORIGIN POINT 0,0) - Always Visible */}
      <View 
        style={{ 
          position: 'absolute',
          top: nucleusY,
          left: nucleusX,
          transform: [{ translateX: -iconOffsetX }, { translateY: -iconOffsetY }],
          zIndex: 999,
        }}
        pointerEvents="box-none"
      >
        <View pointerEvents="auto">
          <Pressable onPress={handleRaindropPress} style={{ alignItems: 'center', position: 'relative' }}>
          {/* Ripple Effect */}
          <Animated.View
            style={{
              position: 'absolute',
              width: 60,
              height: 60,
              borderRadius: 30,
              borderWidth: 2,
              borderColor: '#007AFF',
              opacity: rippleAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.3],
              }),
              transform: [{
                scale: rippleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.5, 1.2],
                }),
              }],
            }}
          />
          
          <View style={{ position: 'relative' }}>
            <MaterialCommunityIcons name="water" size={30} color="#007AFF" />
            
            {/* Link notification badge */}
            {hasUnviewedLinks && (
              <Animated.View
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -6,
                  opacity: flashAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.4, 1],
                  }),
                }}
              >
                <MaterialCommunityIcons 
                  name="link-variant" 
                  size={14} 
                  color="#FF6B4A" 
                />
              </Animated.View>
            )}
          </View>
        </Pressable>
        </View>
      </View>

      {/* View Transform Controls - Top Right Corner - Always Visible */}
      <View 
        style={{
          position: 'absolute',
          top: 20,
          right: 8,
          zIndex: 999,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
        pointerEvents="box-none"
      >
        {/* Reset View Button */}
        <View pointerEvents="auto">
          <Pressable
            onPress={() => {
              setViewScale(1);
              setViewRotation(0);
              scaleAnimValue.setValue(1);
              rotationAnimValue.setValue(0);
            }}
            style={{
              borderWidth: 1,
              borderColor: '#00FF00',
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text style={{ color: '#00FF00', fontSize: 11, fontWeight: '600' }}>
              Reset View
            </Text>
          </Pressable>
        </View>
        
        {/* Zoom & Rotation Display */}
        <View 
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 12,
            flexDirection: 'row',
            gap: 12,
          }}
          pointerEvents="none"
        >
          <Text style={{ color: '#00FF00', fontSize: 11, fontWeight: '600' }}>
            Zoom: {viewScale.toFixed(2)}x
          </Text>
          <Text style={{ color: '#00FF00', fontSize: 11, fontWeight: '600' }}>
            Rotate: {(viewRotation * 180 / Math.PI).toFixed(0)}°
          </Text>
        </View>
      </View>

      {/* Discoverability Toggle - Top Left Corner - Always Visible */}
      <View 
        style={{ 
          position: 'absolute',
          top: 20,
          left: 20,
          zIndex: 999,
        }}
        pointerEvents="box-none"
      >
        <View style={{ position: 'relative' }} pointerEvents="auto">
          <Pressable onPress={handleTogglePress}>
            <View style={{
              width: 40,
              height: 22,
              borderRadius: 11,
              backgroundColor: isDiscoverable ? '#FFE5DC' : '#F0F0F0',
              padding: 2,
              justifyContent: 'center',
            }}>
              <View style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: isDiscoverable ? '#FF6B4A' : '#FFFFFF',
                transform: [{ translateX: isDiscoverable ? 18 : 0 }],
              }} />
            </View>
          </Pressable>
          <View style={{ 
            position: 'absolute', 
            top: 24, 
            left: isDiscoverable ? 18 : 0,
            alignItems: 'center',
            width: 18,
          }}>
            {isDiscoverable ? (
              <MaterialCommunityIcons name="flash-outline" size={14} color="#FF6B4A" />
            ) : (
              <MaterialCommunityIcons name="ghost-outline" size={14} color="#8E8E93" />
            )}
          </View>
        </View>
      </View>

      {/* Link Popup Animation */}
      {showLinkPopup && (
        <Animated.View
          key={popupKey}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
        >
          <Animated.View
            style={{
              transform: [
                {
                  scale: linkPopupAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 1.2],
                  }),
                },
              ],
              opacity: linkPopupAnim,
            }}
          >
          <View style={{
            backgroundColor: theme.colors.white,
            borderRadius: 20,
            padding: 16,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
            borderWidth: 2,
            borderColor: '#FF6B4A',
          }}>
            <LinkIcon size={32} />
            <Text style={[theme.type.h2, { marginTop: 8, color: '#FF6B4A' }]}>
              Link Created!
            </Text>
          </View>
          </Animated.View>
        </Animated.View>
      )}

      {/* Drops Modal */}
      <Modal
        visible={showDrops}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDrops(false)}
      >
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0,0,0,0.5)', 
          justifyContent: 'center', 
          alignItems: 'center',
          padding: 20 
        }}>
          <View style={{
            backgroundColor: theme.colors.white,
            borderRadius: 16,
            padding: 20,
            width: '100%',
            maxWidth: 400,
            maxHeight: '80%',
          }}>
            <Text style={[theme.type.h1, { marginBottom: 16, textAlign: 'center' }]}>
              Your Drops
            </Text>
            
            <ScrollView style={{ maxHeight: 500 }}>
              {/* Link Notifications Section */}
              {unviewedLinks.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <LinkIcon size={16} />
                    <Text style={[theme.type.h2, { marginLeft: 6, fontSize: 14, color: '#FF6B4A' }]}>
                      Links
                    </Text>
                  </View>
                  {unviewedLinks.map((linkNotif) => (
                    <View
                      key={linkNotif.id}
                      style={{
                        backgroundColor: theme.colors.blueLight,
                        borderRadius: 12,
                        padding: 14,
                        marginBottom: 10,
                        borderLeftWidth: 4,
                        borderLeftColor: theme.colors.blue,
                      }}
                    >
                      {/* Close button */}
                      <Pressable
                        onPress={() => dismissNotification(linkNotif.id)}
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          padding: 4,
                        }}
                      >
                        <MaterialCommunityIcons name="close" size={16} color="#666" />
                      </Pressable>

                      {/* Content */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                        <MaterialCommunityIcons 
                          name="link-variant" 
                          size={20} 
                          color={theme.colors.blue} 
                          style={{ marginRight: 10 }}
                        />
                        <View style={{ flex: 1, paddingRight: 20 }}>
                          <Text style={[theme.type.h2, { fontSize: 14, color: '#FF6B4A' }]}>
                            You linked with {linkNotif.name}!
                          </Text>
                        </View>
                      </View>

                      {/* View Contact Card button */}
                      <Pressable
                        onPress={() => {
                          setSelectedContactCard(linkNotif);
                        }}
                        style={({ pressed }) => ({
                          backgroundColor: '#FF6B4A',
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 20,
                          alignItems: 'center',
                          opacity: pressed ? 0.9 : 1,
                        })}
                      >
                        <Text style={[theme.type.button, { fontSize: 12, color: '#000000' }]}>
                          View Contact Card
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {/* Incoming Drops Section */}
              {incomingDrops.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={[theme.type.h2, { marginBottom: 12, fontSize: 14, color: '#007AFF' }]}>
                    💧 Incoming Drops
                  </Text>
                </View>
              )}
            
              {incomingDrops.length === 0 && unviewedLinks.length === 0 ? (
                <Text style={[theme.type.muted, { textAlign: 'center', marginVertical: 20 }]}>
                  No drops or links yet
                </Text>
              ) : (
                incomingDrops.map((drop, index) => (
                <View key={index} style={{
                  backgroundColor: theme.colors.bg,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}>
                  <Text style={[theme.type.h2, { marginBottom: 4 }]}>
                    {drop.name} just sent you a drop
                  </Text>
                  
                  <View style={{ 
                    flexDirection: 'row', 
                    gap: 8, 
                    marginTop: 12 
                  }}>
                    <Pressable
                      onPress={() => handleDropAction('accepted', drop)}
                      style={{
                        flex: 1,
                        backgroundColor: theme.colors.blue,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={[theme.type.button, { fontSize: 12, textAlign: 'center' }]}>
                        Accept
                      </Text>
              </Pressable>
                    <Pressable
                      onPress={() => handleDropAction('returned', drop)}
                      style={{
                        flex: 1,
                        backgroundColor: theme.colors.blue,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={[theme.type.button, { fontSize: 12, textAlign: 'center' }]}>
                        Return
                      </Text>
              </Pressable>
                    <Pressable
                      onPress={() => handleDropAction('declined', drop)}
                      style={{
                        flex: 1,
                        backgroundColor: theme.colors.bg,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                    >
                      <Text style={[theme.type.body, { fontSize: 12, textAlign: 'center', color: theme.colors.muted }]}>
                        Decline
                      </Text>
              </Pressable>
            </View>
          </View>
              ))
            )}
            </ScrollView>
            
            <Pressable
              onPress={() => setShowDrops(false)}
              style={{
                backgroundColor: theme.colors.bg,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 8,
                marginTop: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={[theme.type.body, { textAlign: 'center', color: theme.colors.muted }]}>
                Close
              </Text>
            </Pressable>
      </View>
    </View>
      </Modal>

      {/* Contact Card Modal */}
      <Modal 
        visible={!!selectedContactCard} 
        transparent 
        animationType="fade" 
        onRequestClose={() => {
          if (selectedContactCard?.id) {
            markAsViewed(selectedContactCard.id);
          }
          setSelectedContactCard(null);
          setShowDrops(false);
        }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ 
            backgroundColor: theme.colors.white,
            borderRadius: 16,
            padding: 20,
            width: '100%',
            maxWidth: 340,
            borderWidth: 2,
            borderColor: '#FF6B4A',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 8,
          }}>
            {/* Header */}
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: '#FFE5DC',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}>
                <MaterialCommunityIcons 
                  name="account" 
                  size={32} 
                  color="#FF6B4A" 
                />
              </View>
              <Text style={[theme.type.h1, { fontSize: 20, marginBottom: 2, color: '#FF6B4A' }]}>
                {selectedContactCard?.name}
              </Text>
            </View>

            {/* Contact Information */}
            <View style={{ marginBottom: 16 }}>
              {selectedContactCard?.phoneNumber && (
                <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="phone" size={16} color="#FF6B4A" style={{ marginRight: 8 }} />
                  <Text style={[theme.type.body, { fontSize: 14 }]}>
                    {selectedContactCard.phoneNumber}
                  </Text>
                </View>
              )}
              
              {selectedContactCard?.email && (
                <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="email" size={16} color="#FF6B4A" style={{ marginRight: 8 }} />
                  <Text style={[theme.type.body, { fontSize: 14 }]}>
                    {selectedContactCard.email}
                  </Text>
                </View>
              )}

              {/* Social Media */}
              {selectedContactCard?.socialMedia && selectedContactCard.socialMedia.length > 0 && (
                <View style={{ marginTop: 4, marginBottom: 8 }}>
                  {selectedContactCard.socialMedia.map((social: any, index: number) => (
                    <View key={index} style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialCommunityIcons 
                        name={
                          social.platform.toLowerCase().includes('instagram') ? 'instagram' :
                          social.platform.toLowerCase().includes('twitter') || social.platform.toLowerCase().includes('x') ? 'twitter' :
                          social.platform.toLowerCase().includes('linkedin') ? 'linkedin' :
                          social.platform.toLowerCase().includes('facebook') ? 'facebook' :
                          'web'
                        } 
                        size={16} 
                        color="#FF6B4A" 
                        style={{ marginRight: 8 }}
                      />
                      <Text style={[theme.type.body, { fontSize: 14 }]}>
                        {social.handle}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              
              {selectedContactCard?.bio && (
                <View style={{ 
                  marginTop: 8,
                  padding: 10,
                  backgroundColor: '#FFF5F2',
                  borderRadius: 8,
                }}>
                  <Text style={[theme.type.body, { fontSize: 13, color: theme.colors.text, fontStyle: 'italic' }]}>
                    "{selectedContactCard.bio}"
                  </Text>
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <View style={{ gap: 8 }}>
              {/* Pin Button */}
              <Pressable
                onPress={async () => {
                  const deviceId = selectedContactCard?.deviceId || selectedContactCard?.id;
                  if (deviceId) {
                    // Device should already be in store from link notification creation
                    // Just toggle the pin
                    togglePin(deviceId);
                    markAsViewed(selectedContactCard.id);
                    console.log(`✅ Contact ${selectedContactCard.name} ${pinnedIds.has(deviceId) ? 'unpinned' : 'pinned'}`);
                  }
                }}
                style={({ pressed }) => ({
                  backgroundColor: pinnedIds.has(selectedContactCard?.deviceId || selectedContactCard?.id) ? '#FFE5DC' : '#FF6B4A',
                  paddingVertical: 10,
                  borderRadius: 20,
                  alignItems: 'center',
                  opacity: pressed ? 0.9 : 1,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 6,
                })}
              >
                <MaterialCommunityIcons 
                  name={pinnedIds.has(selectedContactCard?.deviceId || selectedContactCard?.id) ? "pin-off" : "pin"} 
                  size={16} 
                  color={pinnedIds.has(selectedContactCard?.deviceId || selectedContactCard?.id) ? '#FF6B4A' : '#FFFFFF'}
                />
                <Text style={{ 
                  fontSize: 14,
                  fontWeight: '600',
                  color: pinnedIds.has(selectedContactCard?.deviceId || selectedContactCard?.id) ? '#FF6B4A' : '#FFFFFF'
                }}>
                  {pinnedIds.has(selectedContactCard?.deviceId || selectedContactCard?.id) ? 'Unpin' : 'Pin Contact'}
                </Text>
              </Pressable>

              {/* Close Button */}
              <Pressable
                onPress={() => {
                  if (selectedContactCard?.id) {
                    markAsViewed(selectedContactCard.id);
                  }
                  setSelectedContactCard(null);
                  setShowDrops(false);
                }}
                style={({ pressed }) => ({
                  paddingVertical: 10,
                  borderRadius: 20,
                  alignItems: 'center',
                  backgroundColor: theme.colors.bg,
                  borderWidth: 1,
                  borderColor: '#FF6B4A',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#FF6B4A' }}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Blip Device Modal - Execute Drop */}
      <Modal
        visible={showBlipModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBlipModal(false)}
      >
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0,0,0,0.6)', 
          justifyContent: 'center', 
          alignItems: 'center', 
          padding: 20 
        }}>
          <View style={{
            backgroundColor: theme.colors.white,
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 300,
            borderWidth: 2,
            borderColor: '#00FF00',
            shadowColor: '#00FF00',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
            elevation: 10,
          }}>
            {/* Header */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: '#E5FFE5',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
                borderWidth: 2,
                borderColor: '#00FF00',
              }}>
                <MaterialCommunityIcons 
                  name="account-circle" 
                  size={40} 
                  color="#00FF00" 
                />
              </View>
              <Text style={[theme.type.h1, { fontSize: 20, marginBottom: 6, color: theme.colors.text, fontWeight: '700' }]}>
                {selectedBlipDevice?.name}
              </Text>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#E5FFE5',
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 12,
                marginBottom: 8,
              }}>
                <MaterialCommunityIcons name="map-marker-radius" size={14} color="#00FF00" />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#00AA00', marginLeft: 4 }}>
                  {selectedBlipDevice?.distanceFeet.toFixed(1)} ft away
                </Text>
              </View>
            </View>

            {/* Bio Section (if available) */}
            {selectedBlipDevice && (selectedBlipDevice as any).bio && (
              <View style={{
                backgroundColor: '#F5FFF5',
                padding: 12,
                borderRadius: 8,
                marginBottom: 16,
                borderLeftWidth: 3,
                borderLeftColor: '#00FF00',
              }}>
                <Text style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: theme.colors.muted,
                  marginBottom: 4,
                  textTransform: 'uppercase',
                }}>
                  Bio
                </Text>
                <Text style={{ fontSize: 13, color: theme.colors.text, lineHeight: 18 }}>
                  {(selectedBlipDevice as any).bio}
                </Text>
              </View>
            )}

            {/* Message */}
            <Text style={[theme.type.body, { textAlign: 'center', marginBottom: 20, color: theme.colors.muted, fontSize: 14 }]}>
              Would you like to send your contact card?
            </Text>

            {/* Action Buttons */}
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={async () => {
                  if (selectedBlipDevice) {
                    await saveDevice({ 
                      name: selectedBlipDevice.name, 
                      rssi: selectedBlipDevice.rssi, 
                      distanceFeet: selectedBlipDevice.distanceFeet, 
                      action: 'dropped' 
                    });
                    setShowBlipModal(false);
                    showToast({
                      message: `Drop sent to ${selectedBlipDevice.name}!`,
                      type: 'success',
                      duration: 3000,
                    });
                    
                    // Simulate link back after 3 seconds
                    setTimeout(async () => {
                      const uniqueId = Date.now();
                      const linkData = {
                        name: selectedBlipDevice.name,
                        phoneNumber: '(555) 123-4567',
                        email: `${selectedBlipDevice.name.toLowerCase().replace(' ', '.')}@example.com`,
                        bio: 'This is a test bio for the linked contact.',
                        socialMedia: [
                          { platform: 'Instagram', handle: `@${selectedBlipDevice.name.toLowerCase().replace(' ', '')}` },
                        ],
                      };
                      
                      await saveDevice({
                        id: uniqueId,
                        name: linkData.name,
                        rssi: -55,
                        distanceFeet: 18,
                        action: 'returned',
                        phoneNumber: linkData.phoneNumber,
                        email: linkData.email,
                        bio: linkData.bio,
                        socialMedia: linkData.socialMedia,
                      });
                      
                      addLinkNotification({
                        deviceId: uniqueId,
                        name: linkData.name,
                        phoneNumber: linkData.phoneNumber,
                        email: linkData.email,
                        bio: linkData.bio,
                        socialMedia: linkData.socialMedia,
                      });
                    }, 3000);
                  }
                }}
                style={({ pressed }) => ({
                  backgroundColor: '#00FF00',
                  paddingVertical: 14,
                  borderRadius: 10,
                  alignItems: 'center',
                  opacity: pressed ? 0.8 : 1,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 8,
                })}
              >
                <MaterialCommunityIcons name="water" size={18} color="#000" />
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#000' }}>
                  Drop
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setShowBlipModal(false)}
                style={({ pressed }) => ({
                  paddingVertical: 14,
                  borderRadius: 10,
                  alignItems: 'center',
                  borderWidth: 1.5,
                  borderColor: '#00FF00',
                  backgroundColor: 'transparent',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#00AA00' }}>
                  Close
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0,0,0,0.6)', 
          justifyContent: 'center', 
          alignItems: 'center',
          padding: 20,
          zIndex: 9999,
        }}>
          <View style={{
            backgroundColor: isDarkMode ? '#2C2C2E' : '#FFFFFF',
            borderRadius: 10,
            padding: 14,
            width: '100%',
            maxWidth: 220,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 12,
          }}>
            <MaterialCommunityIcons 
              name={confirmAction === 'unpin' ? 'pin-off' : 'delete'} 
              size={28} 
              color="#FF6B4A" 
              style={{ marginBottom: 8 }}
            />
            <Text style={[theme.type.h2, { fontSize: 15, marginBottom: 5, textAlign: 'center', color: theme.colors.text }]}>
              {confirmAction === 'unpin' ? 'Unpin Contact?' : 'Delete Contact?'}
            </Text>
            <Text style={[theme.type.body, { fontSize: 12, textAlign: 'center', marginBottom: 14, color: theme.colors.text }]}>
              Are you sure you want to {confirmAction} "{confirmCardName}"?
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
              <Pressable
                onPress={() => {
                  console.log('Cancel pressed');
                  setShowConfirmModal(false);
                }}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.bg,
                  paddingVertical: 8,
                  borderRadius: 6,
                  borderWidth: 1.5,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={[theme.type.body, { fontSize: 12, textAlign: 'center', color: theme.colors.text, fontWeight: '600' }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  console.log('Confirm pressed');
                  handleConfirmAction();
                }}
                style={{
                  flex: 1,
                  backgroundColor: '#FF6B4A',
                  paddingVertical: 8,
                  borderRadius: 6,
                }}
              >
                <Text style={[theme.type.button, { fontSize: 12, textAlign: 'center', color: '#FFFFFF', fontWeight: '600' }]}>
                  Confirm
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* SUCCESS MODAL - Separate from confirmation */}
      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0,0,0,0.6)', 
          justifyContent: 'center', 
          alignItems: 'center',
          padding: 20,
        }}>
          <View style={{
            backgroundColor: isDarkMode ? '#2C2C2E' : '#FFFFFF',
            borderRadius: 10,
            padding: 16,
            width: '100%',
            maxWidth: 220,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 12,
          }}>
            <MaterialCommunityIcons 
              name="check-circle" 
              size={36} 
              color="#4CAF50" 
              style={{ marginBottom: 8 }}
            />
            <Text style={[theme.type.h2, { fontSize: 15, marginBottom: 5, textAlign: 'center', color: theme.colors.text }]}>
              Success!
            </Text>
            <Text style={[theme.type.body, { textAlign: 'center', color: theme.colors.text, fontSize: 12 }]}>
              {successMessage}
            </Text>
          </View>
        </View>
      </Modal>

      {/* Toggle Confirmation Modal */}
      <Modal
        visible={showToggleConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelToggleChange}
      >
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0,0,0,0.6)', 
          justifyContent: 'center', 
          alignItems: 'center',
          padding: 20,
        }}>
          <View style={{
            backgroundColor: isDarkMode ? '#2C2C2E' : '#FFFFFF',
            borderRadius: 10,
            padding: 14,
            width: '100%',
            maxWidth: 240,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 12,
          }}>
            <MaterialCommunityIcons 
              name={pendingDiscoverableState ? 'flash' : 'ghost'} 
              size={28} 
              color={pendingDiscoverableState ? '#FF6B4A' : '#8E8E93'} 
              style={{ marginBottom: 8 }}
            />
            <Text style={[theme.type.h2, { fontSize: 15, marginBottom: 5, textAlign: 'center', color: theme.colors.text }]}>
              {pendingDiscoverableState ? 'Go Active?' : 'Go Ghost Mode?'}
            </Text>
            <Text style={[theme.type.body, { fontSize: 11, textAlign: 'center', marginBottom: 14, color: theme.colors.text }]}>
              {pendingDiscoverableState 
                ? 'Other users will be able to discover and drop their contact with you.' 
                : 'You will not appear to other users. You will not be able to receive drops.'}
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
              <Pressable
                onPress={cancelToggleChange}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.bg,
                  paddingVertical: 8,
                  borderRadius: 6,
                  borderWidth: 1.5,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={[theme.type.body, { fontSize: 12, textAlign: 'center', color: theme.colors.text, fontWeight: '600' }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={confirmToggleChange}
                style={{
                  flex: 1,
                  backgroundColor: pendingDiscoverableState ? '#FF6B4A' : '#8E8E93',
                  paddingVertical: 8,
                  borderRadius: 6,
                }}
              >
                <Text style={[theme.type.button, { fontSize: 11, textAlign: 'center', color: '#FFFFFF', fontWeight: '600' }]}>
                  {pendingDiscoverableState ? 'Go Active' : 'Go Ghost'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Tutorial Overlay */}
      {isActive && currentScreen === 'Home' && currentStep > 0 && (
        <TutorialOverlay
          step={tutorialSteps[currentStep - 1]}
          currentStepNumber={currentStep}
          totalSteps={totalSteps}
          onNext={nextStep}
          onBack={prevStep}
          onSkip={skipTutorial}
        />
      )}
    </Animated.View>
  );
}
