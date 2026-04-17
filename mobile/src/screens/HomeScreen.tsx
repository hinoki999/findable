import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, Animated, Pressable, Modal, ScrollView, PanResponder, RefreshControl, Dimensions, Platform, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { getTheme } from '../theme';
import { useDarkMode, usePinnedProfiles, useUserProfile, useToast, useLinkNotifications, useSettings } from '../../App';
import { useTabNavigation } from '../contexts/TabNavigationContext';
import { saveDevice, getDevices, deleteDevice, restoreDevice, Device, sendDrop, getIncomingDrops, getLinkedDrops, updateDropStatus, Drop, Link, getUnviewedLinks, markLinkViewed } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import LinkIcon from '../components/LinkIcon';
import { useTutorial } from '../contexts/TutorialContext';
import TutorialOverlay from '../components/TutorialOverlay';
import { useBLEScanner, BleDevice } from '../components/BLEScanner';
import { useBLEAdvertiser } from '../components/BLEAdvertiser';
import { DROPLINK_SERVICE_UUID, DROPLINK_DEVICE_PREFIX } from '../config/bleConfig';
import { supabase } from '../services/supabase';

// Verification whitelist - these users bypass all verification gates
const VERIFICATION_WHITELIST = {
  emails: ['caitie690@gmail.com'],
  phones: ['7344317582', '+17344317582', '17344317582'],
};

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

// ========== 3D SPHERE MATHEMATICS ENGINE ==========
// 3D spherical coordinate system with perspective projection
//
// SPHERE SYSTEM ARCHITECTURE:
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 1. 3D COORDINATE SYSTEMS
//    - Cartesian (x, y, z) for linear calculations
//    - Spherical (r, theta, phi) for globe surface positioning
//    - Screen (sx, sy, depth) for 2D projection
//
// 2. PERSPECTIVE PROJECTION
//    - Camera positioned at (0, 0, -cameraDistance)
//    - Field of view (FOV) for realistic depth perception
//    - Z-buffer for depth sorting and occlusion
//
// 3. GRID LINES
//    - Latitude lines: horizontal circles at various angles
//    - Longitude lines: vertical meridians through poles
//    - Curved SVG paths for smooth rendering
//
// 4. ROTATION IN 3D
//    - Euler angles (pitch, yaw, roll)
//    - Quaternions for smooth interpolation (future)
//    - 3x3 rotation matrices for transformations
//
// 5. BLIP POSITIONING
//    - Map distance/angle to sphere surface
//    - Project 3D position to 2D screen
//    - Scale and fade based on depth (z-coordinate)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Vector3D {
  x: number;
  y: number;
  z: number;
}

interface SphericalCoord {
  r: number;      // radius
  theta: number;  // azimuthal angle (longitude) [0, 2π]
  phi: number;    // polar angle (latitude) [0, π]
}

interface ProjectedPoint {
  x: number;      // screen x
  y: number;      // screen y
  z: number;      // depth (for sorting)
  visible: boolean; // is point facing camera?
}

const Sphere3D = {
  // Convert spherical coordinates to Cartesian (x, y, z)
  sphericalToCartesian: (coord: SphericalCoord): Vector3D => {
    return {
      x: coord.r * Math.sin(coord.phi) * Math.cos(coord.theta),
      y: coord.r * Math.sin(coord.phi) * Math.sin(coord.theta),
      z: coord.r * Math.cos(coord.phi),
    };
  },

  // Convert Cartesian to spherical
  cartesianToSpherical: (point: Vector3D): SphericalCoord => {
    const r = Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z);
    return {
      r,
      theta: Math.atan2(point.y, point.x),
      phi: Math.acos(point.z / r),
    };
  },

  // Rotate a 3D point around X axis (pitch)
  rotateX: (point: Vector3D, angle: number): Vector3D => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: point.x,
      y: point.y * cos - point.z * sin,
      z: point.y * sin + point.z * cos,
    };
  },

  // Rotate a 3D point around Y axis (yaw)
  rotateY: (point: Vector3D, angle: number): Vector3D => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: point.x * cos + point.z * sin,
      y: point.y,
      z: -point.x * sin + point.z * cos,
    };
  },

  // Rotate a 3D point around Z axis (roll)
  rotateZ: (point: Vector3D, angle: number): Vector3D => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: point.x * cos - point.y * sin,
      y: point.x * sin + point.y * cos,
      z: point.z,
    };
  },

  // Apply full rotation (yaw, then pitch, then roll)
  rotate3D: (point: Vector3D, yaw: number, pitch: number, roll: number): Vector3D => {
    let p = Sphere3D.rotateY(point, yaw);
    p = Sphere3D.rotateX(p, pitch);
    p = Sphere3D.rotateZ(p, roll);
    return p;
  },

  // Project 3D point to 2D screen with perspective
  project: (point: Vector3D, cameraDistance: number, fov: number): ProjectedPoint => {
    // Camera is at (0, 0, -cameraDistance) looking at origin
    const z = point.z + cameraDistance;

    // Check if point is behind camera
    if (z <= 0) {
      return { x: 0, y: 0, z: point.z, visible: false };
    }

    // Perspective projection
    const scale = cameraDistance / z;
    const fovScale = Math.tan(fov / 2);

    return {
      x: (point.x * scale) / fovScale,
      y: (point.y * scale) / fovScale,
      z: point.z,
      visible: true,
    };
  },

  // Generate points for a latitude circle (horizontal ring)
  generateLatitudeCircle: (
    radius: number,
    phi: number,
    segments: number,
    yaw: number,
    pitch: number,
    roll: number,
    cameraDistance: number,
    fov: number
  ): ProjectedPoint[] => {
    const points: ProjectedPoint[] = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const spherical: SphericalCoord = { r: radius, theta, phi };
      let cartesian = Sphere3D.sphericalToCartesian(spherical);
      cartesian = Sphere3D.rotate3D(cartesian, yaw, pitch, roll);
      const projected = Sphere3D.project(cartesian, cameraDistance, fov);
      points.push(projected);
    }
    return points;
  },

  // Generate points for a longitude line (vertical meridian)
  generateLongitudeLine: (
    radius: number,
    theta: number,
    segments: number,
    yaw: number,
    pitch: number,
    roll: number,
    cameraDistance: number,
    fov: number
  ): ProjectedPoint[] => {
    const points: ProjectedPoint[] = [];
    for (let i = 0; i <= segments; i++) {
      const phi = (i / segments) * Math.PI;
      const spherical: SphericalCoord = { r: radius, theta, phi };
      let cartesian = Sphere3D.sphericalToCartesian(spherical);
      cartesian = Sphere3D.rotate3D(cartesian, yaw, pitch, roll);
      const projected = Sphere3D.project(cartesian, cameraDistance, fov);
      points.push(projected);
    }
    return points;
  },

  // Convert projected points to SVG path string
  pointsToSVGPath: (points: ProjectedPoint[]): string => {
    if (points.length === 0) return '';

    const visiblePoints = points.filter(p => p.visible);
    if (visiblePoints.length === 0) return '';

    let path = `M ${visiblePoints[0].x} ${visiblePoints[0].y}`;
    for (let i = 1; i < visiblePoints.length; i++) {
      path += ` L ${visiblePoints[i].x} ${visiblePoints[i].y}`;
    }
    return path;
  },

  // Calculate opacity based on depth (z-coordinate)
  depthToOpacity: (z: number, minZ: number, maxZ: number): number => {
    const normalized = (z - minZ) / (maxZ - minZ);
    // Points closer to camera (higher z) are more opaque
    return 0.2 + 0.6 * normalized;
  },
};

// Device Blip Component - extracted to avoid hooks in loops
const DeviceBlip: React.FC<{
  device: BleDevice;
  position: { x: number; y: number };
  nucleusX: number;
  nucleusY: number;
  viewTransform: Tensor2x2;
  depth?: number; // z-coordinate for depth effects
  onPress: () => void;
}> = ({ device, position, nucleusX, nucleusY, viewTransform, depth = 0, onPress }) => {
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

  // Calculate depth-based effects (farther away = smaller & dimmer)
  const depthFactor = depth !== undefined ? Math.max(0.4, 1 - Math.abs(depth) / 200) : 1;

  // More dramatic scale changes with depth factor
  const baseScale = shouldPulse ? pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.3], // More dramatic scaling
  }) : 1.2; // Slightly larger when not pulsing

  const scale = typeof baseScale === 'number' ? baseScale * depthFactor : baseScale;

  // More dramatic opacity changes with depth factor
  const baseOpacity = shouldPulse ? pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1.0], // Wider range
  }) : 1.0; // Full brightness when not pulsing

  const opacity = typeof baseOpacity === 'number' ? baseOpacity * depthFactor : baseOpacity;

  // Apply view transformation (rotation + zoom) to position
  const transformedPosition = TensorMath.transformVector(viewTransform, position);

  const hitAreaSize = 50; // Increased hit area for easier tapping

  return (
    <Pressable
      onTouchEnd={(e) => {
        e.stopPropagation();
        onPress();
      }}
      onPress={(e) => {
        e.stopPropagation();
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
        zIndex: 9999, // Maximum z-index to ensure blips are always on top
        // Temporary: Add background for debugging (remove after testing)
        // backgroundColor: 'rgba(255, 0, 0, 0.1)',
      }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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

// Link Marker Component - for accepted and returned links (no pulsation, link icon)
const LinkMarker: React.FC<{
  device: Device;
  position: { x: number; y: number };
  nucleusX: number;
  nucleusY: number;
  viewTransform: Tensor2x2;
  depth?: number;
  onPress: () => void;
}> = ({ device, position, nucleusX, nucleusY, viewTransform, depth = 0, onPress }) => {
  const LINK_ICON_SIZE = 18; // Slightly larger than blips for visibility

  // Apply view transformation (rotation + zoom) to position
  const transformedPosition = TensorMath.transformVector(viewTransform, position);

  // Calculate depth-based effects (farther away = dimmer)
  const depthFactor = depth !== undefined ? Math.max(0.5, 1 - Math.abs(depth) / 200) : 1;

  const hitAreaSize = 30; // Large hit area for easy tapping

  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
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
        zIndex: 1002, // Above blips
      }}
    >
      <View
        style={{
          width: LINK_ICON_SIZE,
          height: LINK_ICON_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: depthFactor,
        }}
        pointerEvents="none"
      >
        <MaterialCommunityIcons
          name="link-variant"
          size={LINK_ICON_SIZE}
          color="#FFB366"
        />
      </View>
    </Pressable>
  );
};

export default function HomeScreen() {
  const [fadeAnim] = useState(new Animated.Value(1));
  const [rippleAnim] = useState(new Animated.Value(0));
  const [flashAnim] = useState(new Animated.Value(0));
  const [showDrops, setShowDrops] = useState(false);
  const [selectedContactCard, setSelectedContactCard] = useState<any>(null);
  const [incomingDrops, setIncomingDrops] = useState<Drop[]>([]);
  const [unviewedLinksFromDb, setUnviewedLinksFromDb] = useState<Link[]>([]);
  const [showNewLinkModal, setShowNewLinkModal] = useState(false);
  const [currentNewLink, setCurrentNewLink] = useState<Link | null>(null);
  const [showReturnLinkModal, setShowReturnLinkModal] = useState(false);
  const [returnedDropInfo, setReturnedDropInfo] = useState<{ name: string; username?: string } | null>(null);
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [linkPopupAnim] = useState(new Animated.Value(0));
  const [popupKey, setPopupKey] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDiscoverable, setIsDiscoverable] = useState(true);
  const [pinnedProfiles, setPinnedProfiles] = useState<Device[]>([]);
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBlipDevice, setSelectedBlipDevice] = useState<BleDevice | null>(null);
  const [selectedBlipDeviceId, setSelectedBlipDeviceId] = useState<string | null>(null); // Store device ID to sync with devices array
  const [showBlipModal, setShowBlipModal] = useState(false);
  const [isSendingDrop, setIsSendingDrop] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [errorLogs, setErrorLogs] = useState<string[]>([]);
  const [blipProfilePhoto, setBlipProfilePhoto] = useState<string | null>(null);

  // Auto-dismiss drop error after 5 seconds
  useEffect(() => {
    if (dropError) {
      const timer = setTimeout(() => {
        setDropError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [dropError]);

  // Capture console.error messages
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args: any[]) => {
      const errorMessage = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      const timestamp = new Date().toLocaleTimeString();
      setErrorLogs(prev => {
        const newLogs = [`[${timestamp}] ${errorMessage}`, ...prev];
        return newLogs.slice(0, 5); // Keep last 5 errors
      });
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  // Link markers state (accepted links only, not returned drops)
  const [linkedDevices, setLinkedDevices] = useState<Device[]>([]);
  const [selectedLink, setSelectedLink] = useState<Device | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);

  // ========== ROTATION & ZOOM STATE ==========
  const [viewRotation, setViewRotation] = useState(0); // Rotation angle in radians
  const [viewScale, setViewScale] = useState(1); // Zoom scale factor (1 = normal, 2 = 2x zoom)
  const rotationAnimValue = useRef(new Animated.Value(0)).current;
  const scaleAnimValue = useRef(new Animated.Value(1)).current;

  // Gesture tracking for pinch and rotation
  const gestureState = useRef({
    initialScale: 1,
    initialAngle: 0,
    initialDistance: 0,
    startAngle: 0,
  }).current;
  const touchPositions = useRef<{ [key: string]: { x: number; y: number } }>({});
  const { isDarkMode } = useDarkMode();
  const { pinnedIds, togglePin } = usePinnedProfiles();
  const { profile } = useUserProfile();
  const { showToast } = useToast();
  const { navigateToTab } = useTabNavigation();
  const phoneVerified = profile?.phoneVerified || false;
  const phone = profile?.phone || '';
  const email = profile?.email || '';
  const { userId, username, loading } = useAuth();
  const { linkNotifications, dismissNotification, markAsViewed, addLinkNotification } = useLinkNotifications();
  const { maxDistance } = useSettings();
  const { isActive, currentStep, totalSteps, currentScreen, startScreenTutorial, nextStep, prevStep, skipTutorial } = useTutorial();
  const theme = getTheme(isDarkMode);

  // Safe area insets for Android/iOS system UI
  const insets = useSafeAreaInsets();

  // Use BLE scanner for nearby devices
  const { devices, isScanning, startScan, stopScan, startScanCount, addDebugDevice } = useBLEScanner();

  // Use BLE advertiser to make device discoverable (isolated from scanning)
  const { isAdvertising, startAdvertising, stopAdvertising, error: advertisingError, isAvailable, broadcastName, localName } = useBLEAdvertiser();

  // Screen dimensions (reactive to orientation changes)
  const [screenDimensions, setScreenDimensions] = useState(() => {
    const { width, height } = Dimensions.get('window');
    return { width, height };
  });
  const screenWidth = screenDimensions.width;
  const screenHeight = screenDimensions.height;

  // Calculate available space after accounting for system UI
  const availableHeight = screenHeight - insets.top - insets.bottom;
  const availableWidth = screenWidth - insets.left - insets.right;

  // Listen for orientation changes and update dimensions
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenDimensions({ width: window.width, height: window.height });
    });

    return () => subscription?.remove();
  }, []);

  // MATHEMATICAL CONSTANTS FOR UI LAYOUT
  const TOP_CONTROLS_HEIGHT = 80; // Height of top controls (discoverability toggle, reset view, etc.)
  const BOTTOM_TABS_HEIGHT = 60; // Height of bottom navigation tabs
  const DROP_ICON_SIZE = 30; // Size of water drop icon (pixels)
  const MAX_RADIUS_FEET = 33; // Maximum radius in feet
  const UI_PADDING = 16; // Padding for UI elements
  // Minimum distance from center for blips - prevents overlap with raindrop icon
  // Raindrop is 30px with 60px ripple effect, so 45px keeps blips just outside
  const MIN_BLIP_RADIUS_PIXELS = 45;

  // Calculate radar size (square, scaled to fit available space)
  const radarAvailableHeight = availableHeight - TOP_CONTROLS_HEIGHT - BOTTOM_TABS_HEIGHT - (UI_PADDING * 2);
  const radarSize = Math.min(radarAvailableHeight, availableWidth - (UI_PADDING * 2));

  // Calculate the viewable area for backwards compatibility
  const viewableHeight = screenHeight - BOTTOM_TABS_HEIGHT;

  // Calculate the NUCLEUS (origin point 0,0) - center of radar area
  const nucleusX = screenWidth / 2; // Exact horizontal center
  const nucleusY = insets.top + TOP_CONTROLS_HEIGHT + (radarAvailableHeight / 2); // Centered in radar area

  // Stable nucleus refs for transforms (prevents drift during gestures)
  // Transform origin must match the raindrop icon position for proper rotation centering
  const nucleusXRef = useRef(nucleusX);
  const nucleusYRef = useRef(nucleusY);

  // TEMPORARILY DISABLED - Testing if this causes BLE state reset
  // useEffect(() => {
  //   const newNucleusX = nucleusX;
  //   const newNucleusY = nucleusY;  // Must match raindrop icon Y position
  //   nucleusXRef.current = newNucleusX;
  //   nucleusYRef.current = newNucleusY;
  //   console.log('🎯 NUCLEUS REFS UPDATED:', {
  //     nucleusX: nucleusXRef.current,
  //     nucleusY: nucleusYRef.current,
  //     raindropY: nucleusY,
  //     screenWidth,
  //     viewableHeight
  //   });
  // }, [nucleusX, nucleusY, screenWidth, viewableHeight]);

  // Icon offset to center it perfectly (half the icon size)
  const iconOffsetX = DROP_ICON_SIZE / 2; // 15 pixels
  const iconOffsetY = DROP_ICON_SIZE / 2; // 15 pixels

  // Update grid spacing to scale with radar size
  const PIXELS_PER_FOOT = radarSize / (MAX_RADIUS_FEET * 2);

  // Start Home screen tutorial when component mounts
  useEffect(() => {
    startScreenTutorial('Home', 6);
  }, []);

  // Ref to track scanning state for interval (avoids stale closures)
  const isScanningRef = useRef(isScanning);
  useEffect(() => {
    isScanningRef.current = isScanning;
  }, [isScanning]);

  // Refs to stabilize startScan/stopScan callbacks (prevents useEffect re-runs)
  const startScanRef = useRef(startScan);
  const stopScanRef = useRef(stopScan);
  useEffect(() => {
    startScanRef.current = startScan;
    stopScanRef.current = stopScan;
  }, [startScan, stopScan]);

  // Refs to stabilize startAdvertising/stopAdvertising callbacks (prevents useEffect re-runs)
  const startAdvertisingRef = useRef(startAdvertising);
  const stopAdvertisingRef = useRef(stopAdvertising);
  useEffect(() => {
    startAdvertisingRef.current = startAdvertising;
  }, [startAdvertising]);
  useEffect(() => {
    stopAdvertisingRef.current = stopAdvertising;
  }, [stopAdvertising]);

  // Synchronous ref to prevent multiple startAdvertising calls during rapid re-renders
  // This is checked/set synchronously in the useEffect before calling startAdvertisingRef.current()
  const hasRequestedAdvertisingRef = useRef(false);

  // Ref to track link IDs dismissed in this session (prevents polling from re-adding them)
  const dismissedLinkIdsRef = useRef<Set<string>>(new Set());

  // Start BLE scanning when component mounts and restart if it stops
  useEffect(() => {
    startScanRef.current();

    // FIX #4: Restart scanning if it stops (continuous scanning loop)
    // Use ref to check current scanning state without causing effect re-runs
    const scanInterval = setInterval(() => {
      if (!isScanningRef.current) {
        startScanRef.current();
      }
    }, 5000); // Check every 5 seconds and restart if stopped

    return () => {
      stopScanRef.current(); // Cleanup on unmount
      clearInterval(scanInterval);
    };
  }, []); // Empty deps - only run once on mount

  // Start/stop BLE advertising based on isDiscoverable toggle (isolated from scanning)
  useEffect(() => {
    console.log('[BLE-ADV-EFFECT] useEffect fired - isDiscoverable:', isDiscoverable, 'isAvailable:', isAvailable, 'loading:', loading, 'userId:', userId ? 'present' : 'null');

    // Wait for BLE availability, auth loading to complete, and userId to be available
    if (!isAvailable || loading || !userId) {
      console.log('[BLE-ADV-EFFECT] Early return - prerequisites not met');
      return;
    }

    // Start advertising when isDiscoverable is true (ACTIVE mode)
    if (isDiscoverable) {
      // Use synchronous ref guard instead of isAdvertising state
      // This prevents multiple calls when useEffect fires rapidly due to multiple dependency changes
      if (!hasRequestedAdvertisingRef.current && !isAdvertising) {
        console.log('[BLE-ADV-EFFECT] 🔒 Setting hasRequestedAdvertisingRef = true, calling startAdvertising');
        hasRequestedAdvertisingRef.current = true;
        startAdvertisingRef.current();
      } else {
        console.log('[BLE-ADV-EFFECT] Skipping start - hasRequestedAdvertisingRef:', hasRequestedAdvertisingRef.current, 'isAdvertising:', isAdvertising);
      }
    } else {
      // Stop advertising when isDiscoverable is false (GHOST mode)
      console.log('[BLE-ADV-EFFECT] 🔓 isDiscoverable=false, resetting hasRequestedAdvertisingRef and stopping');
      hasRequestedAdvertisingRef.current = false;
      stopAdvertisingRef.current();
    }
    // No cleanup needed here - stop is handled in effect body when isDiscoverable=false
    // Native BLEAdvertiserService handles cleanup on app termination via onDestroy()
  }, [isDiscoverable, isAvailable, loading, userId, isAdvertising]);

  // Fetch linked devices (accepted and returned links) on mount and periodically
  // Note: HomeScreen unmounts/remounts on tab change, so this fires on each "focus"
  useEffect(() => {
    const fetchLinkedDevices = async () => {
      try {
        const allDevices = await getDevices();
        const links = (allDevices ?? []).filter(device =>
          device.action === 'accepted' || device.action === 'returned'
        );
        setLinkedDevices(links);
      } catch (error) {
        // Silent fail - linked devices will refresh on next mount
      }
    };

    fetchLinkedDevices();
    const interval = setInterval(fetchLinkedDevices, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch incoming drops from drops table on mount and periodically
  useEffect(() => {
    if (!userId) {
      console.log('[DROP-STATE] HomeScreen useEffect skip - no userId');
      return;
    }

    const fetchIncomingDropsFromTable = async () => {
      console.log('[DROP-STATE] HomeScreen fetchIncomingDropsFromTable called - userId:', userId);
      console.log('[DROP-SCREEN] HomeScreen fetching incoming drops...');
      try {
        const drops = await getIncomingDrops();
        console.log('[DROP-STATE] HomeScreen setIncomingDrops - count:', drops.length);
        console.log('[DROP-SCREEN] HomeScreen received drops:', JSON.stringify(drops.map(d => ({ id: d.id, senderName: d.senderName })), null, 2));
        setIncomingDrops(drops);
      } catch (error: any) {
        console.error('[DROP-STATE] HomeScreen fetchIncomingDropsFromTable error:', error?.message);
        // Silent fail - drops will refresh on next mount
      }
    };

    console.log('[DROP-STATE] HomeScreen drop fetch useEffect mounted - userId:', userId);
    fetchIncomingDropsFromTable();
    const interval = setInterval(fetchIncomingDropsFromTable, 5000);
    return () => {
      console.log('[DROP-STATE] HomeScreen drop fetch useEffect cleanup');
      clearInterval(interval);
    };
  }, [userId]);

  // Fetch unviewed links from database on mount and periodically
  useEffect(() => {
    if (!userId) {
      console.log('[DROP-MODAL] HomeScreen unviewed links useEffect skip - no userId');
      return;
    }

    const fetchUnviewedLinksFromDb = async () => {
      console.log('[DROP-MODAL] Fetching unviewed links...');
      try {
        const links = await getUnviewedLinks();
        // Filter out any links that were dismissed this session (prevents race condition with viewed_at write)
        const filteredLinks = links.filter(l => !dismissedLinkIdsRef.current.has(l.id));
        console.log('[DROP-STATE] HomeScreen setUnviewedLinksFromDb - count:', filteredLinks.length, '(filtered from', links.length, ')');
        setUnviewedLinksFromDb(filteredLinks);
        // Modal auto-trigger removed - modal only opens via handleRaindropPress
      } catch (error: any) {
        console.error('[DROP-MODAL] fetchUnviewedLinksFromDb error:', error?.message);
        // Silent fail - links will refresh on next mount
      }
    };

    console.log('[DROP-MODAL] Unviewed links useEffect mounted - userId:', userId);
    fetchUnviewedLinksFromDb();
    const interval = setInterval(fetchUnviewedLinksFromDb, 5000);
    return () => clearInterval(interval);
  }, [userId]);

  // Combine context-based and database-based unviewed links for badge
  const unviewedLinksFromContext = linkNotifications.filter(notif => !notif.viewed && !notif.dismissed);
  const hasUnviewedLinks = unviewedLinksFromContext.length > 0 || unviewedLinksFromDb.length > 0;

  // Tutorial steps for Home screen
  const tutorialSteps = [
    {
      message: 'Welcome to DropLink! This is your home screen.',
      position: {
        top: screenHeight * 0.35,
        left: 30,
        right: 30,
      },
    },
    {
      message: 'When other users are nearby, they will appear as green dots on the grid.',
      position: {
        top: screenHeight * 0.40,
        left: 30,
        right: 30,
      },
    },
    {
      message: 'This toggle controls your visibility.',
      position: {
        top: screenHeight * 0.35,
        left: 30,
        right: 30,
      },
      arrow: 'up' as const,
      arrowPosition: { top: 70, left: 20 },
    },
    {
      message: 'Use 2-finger pinch to zoom in/out and rotate the grid view.',
      position: {
        top: screenHeight * 0.40,
        left: 30,
        right: 30,
      },
    },
    {
      message: 'Tap the drop icon in the center of the screen to see drop requests and link notifications.',
      position: {
        top: screenHeight * 0.45,
        left: 30,
        right: 30,
      },
    },
    {
      message: "You're all set! Swipe left to explore the Drop page and start connecting with nearby people. Happy dropping!",
      position: {
        top: screenHeight * 0.40,
        left: 30,
        right: 30,
      },
    },
  ];

  // Filter devices: DropLink devices only (name starts with "DL-" OR has DropLink Service UUID)
  // Then filter by max distance
  const normalizeUUID = (uuid: string): string => uuid.toLowerCase().replace(/-/g, '');
  const normalizedDropLinkUUID = normalizeUUID(DROPLINK_SERVICE_UUID);

  const dropLinkDevices = devices.filter(device => {
    // Check if name starts with "DL-"
    if (device.name && device.name.startsWith(DROPLINK_DEVICE_PREFIX)) {
      return true;
    }
    // Check if has DropLink Service UUID
    if (device.serviceUUIDs && device.serviceUUIDs.length > 0) {
      const hasDropLinkService = device.serviceUUIDs.some(
        uuid => normalizeUUID(uuid) === normalizedDropLinkUUID
      );
      if (hasDropLinkService) {
        return true;
      }
    }
    return false;
  });

  const filteredDevices = dropLinkDevices.filter(device => device.distanceFeet <= maxDistance);

  // Deduplicate by device name (DL-XXXXXXXX) - keep the one with strongest RSSI
  // This prevents multiple dots for the same physical user when Android assigns new MAC addresses
  const deduplicatedDevices = filteredDevices.reduce((acc, device) => {
    const existingIndex = acc.findIndex(d => d.name === device.name);
    if (existingIndex === -1) {
      acc.push(device);
    } else if ((device.rssi || -100) > (acc[existingIndex].rssi || -100)) {
      acc[existingIndex] = device;
    }
    return acc;
  }, [] as typeof filteredDevices);

  // Log device counts for BLE debugging
  useEffect(() => {
    console.log('[BLE-DUPE] HomeScreen devices state changed - total:', devices.length, 'dropLink:', dropLinkDevices.length, 'filtered:', filteredDevices.length, 'deduplicated:', deduplicatedDevices.length);
    console.log('[BLE-ID] HomeScreen deduplicatedDevices for UI render:', JSON.stringify(deduplicatedDevices.map(d => ({ id: d.id, name: d.name, username: d.username, userId: d.userId })), null, 2));
  }, [devices, dropLinkDevices.length, filteredDevices.length, deduplicatedDevices.length]);

  // Sync selectedBlipDevice with devices array when username/userId is loaded
  useEffect(() => {
    if (selectedBlipDeviceId && selectedBlipDevice) {
      // Find the current device in the devices array (it may have been updated with username)
      const currentDevice = devices.find(d => d.id === selectedBlipDeviceId);
      if (currentDevice && (
        currentDevice.username !== selectedBlipDevice.username ||
        currentDevice.userId !== selectedBlipDevice.userId
      )) {
        setSelectedBlipDevice(currentDevice);
      }
    }
  }, [devices, selectedBlipDeviceId, selectedBlipDevice]);

  // Fetch profile photo when blip modal opens with a userId
  useEffect(() => {
    const fetchBlipProfilePhoto = async () => {
      if (showBlipModal && selectedBlipDevice?.userId) {
        try {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('profile_photo')
            .eq('user_id', selectedBlipDevice.userId)
            .single();

          if (!error && data?.profile_photo) {
            setBlipProfilePhoto(data.profile_photo);
          } else {
            setBlipProfilePhoto(null);
          }
        } catch (err) {
          console.error('[BLIP-MODAL] Error fetching profile photo:', err);
          setBlipProfilePhoto(null);
        }
      } else if (!showBlipModal) {
        // Clear photo when modal closes
        setBlipProfilePhoto(null);
      }
    };

    fetchBlipProfilePhoto();
  }, [showBlipModal, selectedBlipDevice?.userId]);

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

  // Map device to 2D position with ACCURATE grid snapping (3 ft intervals to match visible grid)
  const GRID_SPACING_FEET = 3; // Must match grid configuration (3 ft intervals)

  const getGridPosition = (device: BleDevice): { x: number; y: number; z: number } => {
    const deviceId = device.id || device.name;
    const currentTime = Date.now();

    // Generate consistent angle based on device ID hash (deterministic positioning)
    // Using device.id ensures unique distribution across 360 degrees since IDs are always unique
    const hash = deviceId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const angleInRadians = (hash % 360) * (Math.PI / 180);

    // ACCURATE distance mapping to pixel radius (linear scale for symmetry)
    const distanceInFeet = Math.min(device.distanceFeet, MAX_RADIUS_FEET);
    const radiusInPixels = (distanceInFeet / MAX_RADIUS_FEET) * spatialTensors.maxRadiusPixels;

    // Calculate raw 2D position (polar to cartesian)
    const rawPosition: Vector2D = {
      x: radiusInPixels * Math.cos(angleInRadians),
      y: radiusInPixels * Math.sin(angleInRadians),
    };

    // SNAP TO NEAREST GRID INTERSECTION (1 ft intervals) - BEFORE sphere projection
    // This ensures nodes align perfectly with visible grid lines for accuracy
    const gridPixelSpacing = spatialTensors.pixelsPerFoot * GRID_SPACING_FEET;
    const snappedPosition: Vector2D = {
      x: Math.round(rawPosition.x / gridPixelSpacing) * gridPixelSpacing,
      y: Math.round(rawPosition.y / gridPixelSpacing) * gridPixelSpacing,
    };

    // Apply CUBED SPHERE PROJECTION to match curved grid (EXACT same formula as grid lines)
    // CRITICAL: Must use same sphere radius calculation as grid for alignment
    const sphereRadius = Math.max(screenWidth, viewableHeight) * 0.7; // Matches grid exactly
    const normalizedX = snappedPosition.x / sphereRadius;
    const normalizedY = snappedPosition.y / sphereRadius;
    const denominator = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY + 1);
    const depth = 1 / denominator;
    const projectedX = normalizedX / denominator;
    const projectedY = normalizedY / denominator;
    const bulgeFactor = 1.15; // Matches grid exactly
    let curvedPosition: Vector2D = {
      x: projectedX * sphereRadius * bulgeFactor,
      y: projectedY * sphereRadius * bulgeFactor,
    };

    // MINIMUM DISTANCE BUFFER: Push blips outside the raindrop's hit area
    // This prevents blips from overlapping the central raindrop icon
    const curvedDistance = Math.sqrt(curvedPosition.x * curvedPosition.x + curvedPosition.y * curvedPosition.y);
    if (curvedDistance < MIN_BLIP_RADIUS_PIXELS && curvedDistance > 0) {
      // Scale the position outward to the minimum radius while preserving angle
      const scaleFactor = MIN_BLIP_RADIUS_PIXELS / curvedDistance;
      curvedPosition = {
        x: curvedPosition.x * scaleFactor,
        y: curvedPosition.y * scaleFactor,
      };
    } else if (curvedDistance === 0) {
      // Device at exact center (0,0) - push to minimum radius at the device's hash angle
      curvedPosition = {
        x: MIN_BLIP_RADIUS_PIXELS * Math.cos(angleInRadians),
        y: MIN_BLIP_RADIUS_PIXELS * Math.sin(angleInRadians),
      };
    }

    const z = depth; // Depth factor from sphere projection (0-1)

    // Update spatial tensor tracking (for future velocity/acceleration features)
    // Track snapped position (pre-curve) for accurate velocity/acceleration
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
        angle: angleInRadians, // Store angle for tracking
        timestamp: currentTime,
      });
    } else {
      // Initialize tensor for new device
      deviceSpatialTensors.current.set(deviceId, {
        position: snappedPosition,
        velocity: { x: 0, y: 0 },
        acceleration: { x: 0, y: 0 },
        distance: device.distanceFeet,
        angle: angleInRadians, // Store angle for tracking
        timestamp: currentTime,
      });
    }

    // Return CURVED position that matches the 3D grid projection
    return {
      x: curvedPosition.x,
      y: curvedPosition.y,
      z: z, // Depth for perspective effects (0-1)
    };
  };

  // ========== ADVANCED TENSOR FEATURES ==========

  // Calculate spatial density field (heat map) using tensor operations
  const calculateSpatialDensity = useMemo(() => {
    const devicePositions: Vector2D[] = deduplicatedDevices.map(device => {
      const pos = getGridPosition(device);
      return { x: pos.x, y: pos.y }; // Extract 2D position
    });

    // Create density field function
    return (testPoint: Vector2D): number => {
      return TensorMath.distanceField(testPoint, devicePositions, spatialTensors.maxRadiusPixels);
    };
  }, [deduplicatedDevices, spatialTensors.maxRadiusPixels]);

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

  // Tensor system is active but logging removed for production

  // ========== RAW TOUCH HANDLERS (PINCH ZOOM & ROTATION) ==========

  const handleTouchStart = (event: any) => {
    const touches = event.nativeEvent.touches;

    // Only handle multi-touch gestures (pinch/rotate) - let single taps pass through to blips
    if (touches.length === 1) {
      return; // Don't capture single touches - allow blips to receive them
    }

    touches.forEach((touch: any) => {
      touchPositions.current[touch.identifier] = { x: touch.pageX, y: touch.pageY };
    });

    if (touches.length === 2) {
      const [touch1, touch2] = touches;
      const distance = Math.sqrt(
        Math.pow(touch2.pageX - touch1.pageX, 2) +
        Math.pow(touch2.pageY - touch1.pageY, 2)
      );
      gestureState.initialScale = viewScale;
      gestureState.initialDistance = distance;

      const angle = Math.atan2(touch2.pageY - touch1.pageY, touch2.pageX - touch1.pageX);
      gestureState.initialAngle = viewRotation;
      gestureState.startAngle = angle;

    }
  };

  const handleTouchMove = (event: any) => {
    const touches = event.nativeEvent.touches;

    // Only handle multi-touch gestures - let single taps pass through
    if (touches.length !== 2) {
      return;
    }

    if (touches.length === 2) {
      const [touch1, touch2] = touches;

      // PINCH (zoom)
      const distance = Math.sqrt(
        Math.pow(touch2.pageX - touch1.pageX, 2) +
        Math.pow(touch2.pageY - touch1.pageY, 2)
      );
      if (gestureState.initialDistance) {
        const scale = (distance / gestureState.initialDistance) * gestureState.initialScale;
        // Constrain zoom: min 0.91x (91%), max 4x (400%)
        const constrainedScale = Math.max(0.91, Math.min(4, scale));

        setViewScale(constrainedScale);
        scaleAnimValue.setValue(constrainedScale);

      }

      // ROTATION
      const angle = Math.atan2(touch2.pageY - touch1.pageY, touch2.pageX - touch1.pageX);
      if (gestureState.startAngle !== undefined) {
        const rotation = gestureState.initialAngle + (angle - gestureState.startAngle);

        setViewRotation(rotation);
        rotationAnimValue.setValue(rotation);

      }
    }
  };

  const handleTouchEnd = () => {
    touchPositions.current = {};
  };

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
    (async () => {
      const devices = await getDevices();
      const pinned = devices.filter(d => d.id && pinnedIds.has(d.id));
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
        // Don't capture to allow gesture handlers to work
        return false;
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
    console.log('[DROP-MODAL] handleRaindropPress called - USER TAPPED RAINDROP');
    console.log('[DROP-MODAL] Current state - incomingDrops.length:', incomingDrops.length, 'showDrops:', showDrops);
    
    // TEMP DISABLED - RE-ENABLE AFTER DROP TESTING
    // Phone verification gate with whitelist bypass
    // if (!phoneVerified && !VERIFICATION_WHITELIST.phones.some(p => phone?.includes(p)) && !VERIFICATION_WHITELIST.emails.includes(email)) {
    //   showToast({ message: 'Verify your phone number to see your drops', type: 'info', duration: 3000 });
    //   navigateToTab('Account');
    //   return;
    // }

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
    console.log('[DROP-MODAL] Setting showDrops to TRUE (user initiated)');
    console.log('[DROP-STATE] HomeScreen setShowDrops(true) - triggered by raindrop press');
    setShowDrops(true);
  };

  const handleDropAction = async (action: 'accepted' | 'returned' | 'declined', drop: Drop) => {
    console.log('[DROP-STATE] handleDropAction called - action:', action, 'drop.id:', drop.id);
    
    // Show link popup for returned drops IMMEDIATELY
    if (action === 'returned') {
      showLinkPopupAnimation();
    }

    // Get current user's profile to share if returning
    const responseProfile = action === 'returned' ? {
      name: profile?.name,
      username: username ?? undefined,
      email: profile?.email,
      phone: profile?.phone,
      bio: profile?.bio,
      profilePhoto: profile?.profilePhoto,
      socialMedia: profile?.socialMedia,
    } : undefined;

    try {
      console.log('[DROP-STATE] Calling updateDropStatus - drop.id:', drop.id, 'action:', action);
      await updateDropStatus(drop.id, action, responseProfile);

      // Remove the drop from the list
      console.log('[DROP-STATE] HomeScreen setIncomingDrops - removing drop.id:', drop.id, 'current count:', incomingDrops.length);
      setIncomingDrops(prev => prev.filter(d => d.id !== drop.id));

      // Close modal if no more drops
      console.log('[DROP-MODAL] Checking if should close modal - incomingDrops.length:', incomingDrops.length);
      if (incomingDrops.length <= 1) {
        console.log('[DROP-MODAL] Closing drops modal - no more drops');
        console.log('[DROP-STATE] HomeScreen setShowDrops(false) - after last drop action');
        setShowDrops(false);
      }

      // Show success feedback
      if (action === 'returned') {
        // Show confirmation modal for the returner
        setReturnedDropInfo({
          name: drop.senderName || 'User',
          username: drop.senderUsername,
        });
        setShowReturnLinkModal(true);
      } else if (action === 'accepted') {
        showToast({
          message: `Accepted drop from ${drop.senderName || 'User'}`,
          type: 'success',
          duration: 3000,
        });
      }
    } catch (error: any) {
      console.error('[DROPS] Failed to update drop status:', error);
      console.error('[DROP-STATE] handleDropAction EXCEPTION:', error?.message);
      showToast({
        message: 'Failed to respond to drop. Please try again.',
        type: 'error',
        duration: 3000,
      });
    }
  };

  // Handle dismissing the new link notification modal
  const handleDismissNewLink = async () => {
    if (currentNewLink) {
      try {
        await markLinkViewed(currentNewLink.id);

        // Remove from unviewed list
        setUnviewedLinksFromDb(prev => prev.filter(l => l.id !== currentNewLink.id));

        // Check if there are more unviewed links to show
        const remainingLinks = unviewedLinksFromDb.filter(l => l.id !== currentNewLink.id);
        if (remainingLinks.length > 0) {
          setCurrentNewLink(remainingLinks[0]);
        } else {
          setCurrentNewLink(null);
          setShowNewLinkModal(false);
        }
      } catch (error) {
        console.error('[LINKS] Failed to mark link as viewed:', error);
        setShowNewLinkModal(false);
        setCurrentNewLink(null);
      }
    } else {
      setShowNewLinkModal(false);
    }
  };

  // Handle dismissing a link card from the drops sheet
  const handleDismissLinkCard = async (linkId: string) => {
    // Add to dismissed set immediately to prevent polling from re-adding it
    dismissedLinkIdsRef.current.add(linkId);
    // Remove from state immediately for responsive UI
    setUnviewedLinksFromDb(prev => prev.filter(l => l.id !== linkId));
    try {
      await markLinkViewed(linkId);
    } catch (error) {
      console.error('[LINKS] Failed to dismiss link card:', error);
    }
  };

  // Handle dismissing the return link confirmation modal
  const handleDismissReturnLinkModal = () => {
    setShowReturnLinkModal(false);
    setReturnedDropInfo(null);
  };

  // Handle quick action button press (unpin or delete)
  const handleQuickActionPress = (action: 'unpin' | 'delete', cardId: number, cardName: string) => {
    setConfirmAction(action);
    setConfirmCardId(cardId);
    setConfirmCardName(cardName);
    setShowConfirmModal(true);
    setActiveQuickActionCardId(null);
  };

  // Handle confirmation
  const handleConfirmAction = async () => {
    if (!confirmCardId || !confirmAction || !confirmCardName) {
      return;
    }

    const actionName = confirmCardName;
    const actionType = confirmAction;

    // Store the card for undo BEFORE performing the action
    const cardToStore = pinnedProfiles.find(p => p.id === confirmCardId) || null;
    const actionData = { type: actionType, cardId: confirmCardId, card: cardToStore };
    lastActionRef.current = actionData;

    // Perform the action
    if (actionType === 'unpin') {
      togglePin(confirmCardId);
    } else if (actionType === 'delete') {
      await deleteDevice(confirmCardId, userId!);
      setPinnedProfiles(prev => prev.filter(p => p.id !== confirmCardId));
      togglePin(confirmCardId);
    }

    setShowConfirmModal(false);
    setConfirmAction(null);
    setConfirmCardId(null);
    setConfirmCardName('');

    showToast({
      message: `${actionName} ${actionType === 'unpin' ? 'unpinned' : 'deleted'}`,
      type: 'success',
      duration: 4000,
      actionLabel: 'UNDO',
      onAction: handleUndo,
    });
  };

  // Handle undo
  const handleUndo = async () => {
    const lastAction = lastActionRef.current;

    if (!lastAction) {
      return;
    }

    if (lastAction.type === 'unpin') {
      togglePin(lastAction.cardId);
    } else if (lastAction.type === 'delete' && lastAction.card) {
      await restoreDevice(lastAction.card, userId!);

      setPinnedProfiles(prev => {
        if (prev.some(p => p.id === lastAction.cardId)) {
          return prev;
        }
        return [...prev, lastAction.card!];
      });

      togglePin(lastAction.cardId);
    }

    lastActionRef.current = null;
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
    <Animated.View style={{ flex: 1, backgroundColor: theme.colors.bg, opacity: fadeAnim }}>

      {/* Curved Grid Background - 2D grid with slight curve for 3D effect */}
      <View
        style={{ flex: 1, overflow: 'visible' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: screenWidth,
            height: viewableHeight,
            zIndex: 0,
            overflow: 'visible',
            // Native RN transformOrigin - rotate/zoom around raindrop icon (array syntax)
            transformOrigin: [nucleusX, nucleusY],
            transform: [
              { scale: scaleAnimValue },
              {
                rotate: rotationAnimValue.interpolate({
                  inputRange: [-100, 100],
                  outputRange: ['-100rad', '100rad']
                })
              },
            ],
          }}
          pointerEvents="box-none" // Allow touches to pass through to blips
        >
          {React.useMemo(() => {
            // 2D Grid with 3D Cubed Sphere Projection (FULL SCREEN, 33 ft node accuracy maintained)
            const maxRadiusPixels = Math.min(nucleusX, nucleusY, screenWidth - nucleusX, viewableHeight - nucleusY);
            const pixelsPerFoot = maxRadiusPixels / MAX_RADIUS_FEET;

            // Sphere radius extended to cover entire screen for full background grid
            const sphereRadius = Math.max(screenWidth, viewableHeight) * 0.85; // Full screen coverage

            // Grid Configuration - 3 FOOT INTERVALS for better performance (extends beyond 33 ft for visual fill)
            const GRID_SPACING_FEET = 3; // Wider spacing = fewer lines = better performance
            const screenMaxFeet = Math.ceil(Math.max(screenWidth, viewableHeight) / pixelsPerFoot); // Grid to screen edges
            const gridRange = Math.max(MAX_RADIUS_FEET, screenMaxFeet); // Extend grid to fill screen
            const totalLines = gridRange * 2 + 1; // Total lines spanning entire screen
            const segmentsPerLine = 20; // Segments per line for curve smoothness

            // Helper: Cubed Sphere Projection - (x, y, 1) / √(x² + y² + 1)
            // Optimized for 33 ft visible range with dramatic curvature
            const projectToSphere = (x: number, y: number): { x: number; y: number; depth: number } => {
              // Normalize coordinates relative to 33 ft sphere radius
              const normalizedX = x / sphereRadius;
              const normalizedY = y / sphereRadius;

              // Cubed sphere projection formula: (x, y, 1) / √(x² + y² + 1)
              // This projects the flat plane onto a sphere surface
              const denominator = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY + 1);

              // The z-component (depth) from the projection
              const depth = 1 / denominator;

              // Project x and y coordinates onto sphere
              const projectedX = normalizedX / denominator;
              const projectedY = normalizedY / denominator;

              // Scale back to screen coordinates
              // Multiply by a factor > 1 to create outward bulge effect
              const bulgeFactor = 1.15; // Subtle outward expansion for mobile-friendly 3D effect
              const bulgedX = projectedX * sphereRadius * bulgeFactor;
              const bulgedY = projectedY * sphereRadius * bulgeFactor;

              return {
                x: bulgedX,
                y: bulgedY,
                depth: depth, // 0 (far) to 1 (center)
              };
            };

            // Extended SVG canvas to cover zoom-out and rotation
            const svgSize = Math.max(screenWidth, viewableHeight) * 1.5;
            const svgWidth = svgSize;
            const svgHeight = svgSize;
            const svgOffsetX = (svgWidth - screenWidth) / 2;
            const svgOffsetY = (svgHeight - viewableHeight) / 2;

            return (
              <Svg
                width={svgWidth}
                height={svgHeight}
                style={{ position: 'absolute', top: -svgOffsetY, left: -svgOffsetX }}
                pointerEvents="none"
              >
                {/* Vertical lines curved by spherical projection - 1 Path per line */}
                {Array.from({ length: totalLines }, (_, i) => {
                  const offset = (i - gridRange) * pixelsPerFoot * GRID_SPACING_FEET;

                  // Build SVG path string with all segment points
                  let pathData = '';
                  let totalDepth = 0;

                  for (let seg = 0; seg <= segmentsPerLine; seg++) {
                    const t = (seg / segmentsPerLine) * 2 - 1; // -1 to 1
                    const y = t * viewableHeight * 1.2;
                    const p = projectToSphere(offset, y);
                    const screenX = svgOffsetX + nucleusX + p.x;
                    const screenY = svgOffsetY + nucleusY + p.y;
                    totalDepth += p.depth;

                    if (seg === 0) {
                      pathData = `M ${screenX.toFixed(2)} ${screenY.toFixed(2)}`;
                    } else {
                      pathData += ` L ${screenX.toFixed(2)} ${screenY.toFixed(2)}`;
                    }
                  }

                  // Depth-based opacity: center bright, edges dim (creates 3D illusion)
                  const avgDepth = totalDepth / (segmentsPerLine + 1);
                  const depthFactor = avgDepth * avgDepth; // Square for contrast
                  const baseOpacity = offset === 0 ? 0.5 : 0.3;
                  const opacity = baseOpacity * (0.3 + depthFactor * 0.7);

                  return (
                    <Path
                      key={`v-${i}`}
                      d={pathData}
                      stroke="#00D4FF"
                      strokeWidth={1}
                      opacity={opacity}
                      fill="none"
                    />
                  );
                })}

                {/* Horizontal lines curved by spherical projection - 1 Path per line */}
                {Array.from({ length: totalLines }, (_, i) => {
                  const offset = (i - gridRange) * pixelsPerFoot * GRID_SPACING_FEET;

                  // Build SVG path string with all segment points
                  let pathData = '';
                  let totalDepth = 0;

                  for (let seg = 0; seg <= segmentsPerLine; seg++) {
                    const t = (seg / segmentsPerLine) * 2 - 1; // -1 to 1
                    const x = t * screenWidth * 1.2;
                    const p = projectToSphere(x, offset);
                    const screenX = svgOffsetX + nucleusX + p.x;
                    const screenY = svgOffsetY + nucleusY + p.y;
                    totalDepth += p.depth;

                    if (seg === 0) {
                      pathData = `M ${screenX.toFixed(2)} ${screenY.toFixed(2)}`;
                    } else {
                      pathData += ` L ${screenX.toFixed(2)} ${screenY.toFixed(2)}`;
                    }
                  }

                  // Depth-based opacity: center bright, edges dim (creates 3D illusion)
                  const avgDepth = totalDepth / (segmentsPerLine + 1);
                  const depthFactor = avgDepth * avgDepth; // Square for contrast
                  const baseOpacity = offset === 0 ? 0.5 : 0.3;
                  const opacity = baseOpacity * (0.3 + depthFactor * 0.7);

                  return (
                    <Path
                      key={`h-${i}`}
                      d={pathData}
                      stroke="#00D4FF"
                      strokeWidth={1}
                      opacity={opacity}
                      fill="none"
                    />
                  );
                })}
              </Svg>
            );
          }, [screenWidth, viewableHeight, nucleusX, nucleusY])}


        </Animated.View>  {/* ← Close transformed grid container */}

        {/* Blips Layer - Completely separate from gesture handlers for reliable touch detection */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 2000,
            pointerEvents: 'box-none', // Container doesn't capture, but children (blips) can
          }}
        >
          {deduplicatedDevices.map((device) => {
            const position = getGridPosition(device);

            return (
              <DeviceBlip
                key={device.id || device.name}
                device={device}
                position={{ x: position.x, y: position.y }}
                depth={position.z}
                nucleusX={nucleusX}
                nucleusY={nucleusY}
                viewTransform={viewTransformTensor}
                onPress={() => {
                  setSelectedBlipDevice(device);
                  setSelectedBlipDeviceId(device.id); // Store device ID to sync later
                  setShowBlipModal(true);
                }}
              />
            );
          })}

          {/* Link Markers - for accepted and returned links (no pulsation) */}
          {linkedDevices.map((device) => {
            // Use same positioning logic as blips to ensure grid snapping
            const position = getGridPosition(device as any); // Device has distanceFeet property

            return (
              <LinkMarker
                key={device.id || `link-${device.name}`}
                device={device}
                position={{ x: position.x, y: position.y }}
                depth={position.z}
                nucleusX={nucleusX}
                nucleusY={nucleusY}
                viewTransform={viewTransformTensor}
                onPress={() => {
                  setSelectedLink(device);
                  setShowLinkModal(true);
                }}
              />
            );
          })}
        </View>

        {/* Empty State - No Nearby Users - OUTSIDE grid so it doesn't rotate */}
        {deduplicatedDevices.length === 0 && linkedDevices.length === 0 && (
          <View
            style={{
              position: 'absolute',
              top: '45%',
              left: 0,
              right: 0,
              alignItems: 'center',
            }}
            pointerEvents="none"
          >
            <Text style={[theme.type.muted, {
              textAlign: 'center',
              fontSize: 15,
            }]}>
              No drops nearby
            </Text>
          </View>
        )}

        {/* Central Raindrop Logo with Ripple - THE NUCLEUS (ORIGIN POINT 0,0) - ROTATES WITH GRID */}
        <Animated.View
          style={{
            position: 'absolute',
            top: nucleusY,
            left: nucleusX,
            transform: [
              { translateX: -iconOffsetX },
              { translateY: -iconOffsetY },
              {
                rotate: rotationAnimValue.interpolate({
                  inputRange: [-100, 100],
                  outputRange: ['-100rad', '100rad']
                })
              }
            ],
            zIndex: 10000, // Higher than blips (9999) to ensure raindrop is always tappable
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
                  borderColor: theme.colors.green,
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
                <MaterialCommunityIcons
                  name={(incomingDrops.length > 0 || unviewedLinksFromDb.length > 0) ? "water" : "water-outline"}
                  size={30}
                  color={theme.colors.green}
                />

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
                      color="#007AFF"
                    />
                  </Animated.View>
                )}
              </View>
            </Pressable>
          </View>
        </Animated.View>

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
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: Dimensions.get('window').height || 800 }}>
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

        {/* View Transform Controls - Top Right Corner - Always Visible */}
        <View
          style={{
            position: 'absolute',
            top: insets.top + 8,
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
                borderColor: theme.colors.green,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Text style={{ color: theme.colors.green, fontSize: 11, fontWeight: '600' }}>
                Reset View
              </Text>
            </Pressable>
          </View>

          {/* Zoom & Rotation Indicators (visual feedback only) */}
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
            }}
            pointerEvents="none"
          >
            {/* Zoom Indicator - illuminates when zoom is NOT 1x */}
            <View
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Math.abs(viewScale - 1) > 0.01 ? theme.colors.green : 'rgba(128, 128, 128, 0.3)',
              }}
            >
              <Text style={{
                color: Math.abs(viewScale - 1) > 0.01 ? theme.colors.green : 'rgba(128, 128, 128, 0.5)',
                fontSize: 11,
                fontWeight: '600'
              }}>
                Zoom
              </Text>
            </View>

            {/* Rotate Indicator - illuminates when rotation is NOT 0° */}
            <View
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Math.abs(viewRotation) > 0.01 ? theme.colors.green : 'rgba(128, 128, 128, 0.3)',
              }}
            >
              <Text style={{
                color: Math.abs(viewRotation) > 0.01 ? theme.colors.green : 'rgba(128, 128, 128, 0.5)',
                fontSize: 11,
                fontWeight: '600'
              }}>
                Rotate
              </Text>
            </View>
          </View>
        </View>

        {/* Discoverability Toggle - Top Left Corner - Always Visible */}
        <View
          style={{
            position: 'absolute',
            top: insets.top + 8,
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
                backgroundColor: isDiscoverable ? theme.colors.greenLight : '#F0F0F0',
                padding: 2,
                justifyContent: 'center',
              }}>
                <View style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: isDiscoverable ? theme.colors.green : '#FFFFFF',
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
                <MaterialCommunityIcons name="flash-outline" size={14} color={theme.colors.green} />
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
              width: '95%',
              maxWidth: 500,
              maxHeight: '80%',
            }}>
              <Text style={[theme.type.h1, { marginBottom: 16, textAlign: 'center' }]}>
                Your Drops
              </Text>

              <ScrollView style={{ maxHeight: 500 }}>
                <>
                  {/* Link Notifications Section (from context) */}
                  {unviewedLinksFromContext.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <LinkIcon size={16} />
                        <Text style={[theme.type.h2, { marginLeft: 6, fontSize: 14, color: '#FF6B4A' }]}>
                          Links
                        </Text>
                      </View>
                      {unviewedLinksFromContext.map((linkNotif) => (
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

                          {/* Action buttons */}
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Pressable
                              onPress={() => {
                                setSelectedContactCard(linkNotif);
                              }}
                              style={({ pressed }) => ({
                                flex: 1,
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

                            <Pressable
                              onPress={() => dismissNotification(linkNotif.id)}
                              style={({ pressed }) => ({
                                flex: 1,
                                backgroundColor: theme.colors.border,
                                paddingVertical: 8,
                                paddingHorizontal: 12,
                                borderRadius: 20,
                                alignItems: 'center',
                                opacity: pressed ? 0.9 : 1,
                              })}
                            >
                              <Text style={[theme.type.button, { fontSize: 12, color: theme.colors.text }]}>
                                Dismiss
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Incoming Drops Section */}
                  {incomingDrops.length > 0 && (
                    <View style={{ marginBottom: 10 }}>
                      <Text style={[theme.type.h2, { marginBottom: 12, fontSize: 14, color: theme.colors.green }]}>
                        💧 Incoming Drops
                      </Text>
                    </View>
                  )}

                  {incomingDrops.length === 0 && unviewedLinksFromContext.length === 0 && unviewedLinksFromDb.length === 0 ? (
                    <View style={{ alignItems: 'center', marginVertical: 40, paddingHorizontal: 20 }}>
                      <MaterialCommunityIcons name="water-outline" size={48} color={theme.colors.muted} style={{ marginBottom: 12 }} />
                      <Text style={[theme.type.h2, { textAlign: 'center', marginBottom: 8, fontSize: 16 }]}>
                        All caught up!
                      </Text>
                      <Text style={[theme.type.muted, { textAlign: 'center', fontSize: 13, lineHeight: 18 }]}>
                        No new drops right now. Head to the Drop page to connect with people nearby!
                      </Text>
                    </View>
                  ) : (
                    <>
                    {/* Render incoming drops */}
                    {incomingDrops.map((drop) => (
                      <View key={drop.id} style={{
                        backgroundColor: theme.colors.white,
                        borderRadius: 16,
                        marginBottom: 16,
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 4,
                        elevation: 3,
                      }}>
                        {/* Header with name */}
                        <View style={{
                          backgroundColor: '#FF6B4A',
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          alignItems: 'center',
                        }}>
                          <Text style={[theme.type.h2, { color: theme.colors.white, fontSize: 16 }]}>
                            {drop.senderName || drop.senderUsername || 'Someone'} sent you a drop
                          </Text>
                          {/* Distance and username */}
                          <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginTop: 4,
                          }}>
                            {drop.distanceFeet !== undefined && drop.distanceFeet !== null && (
                              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                                {drop.distanceFeet.toFixed(1)} ft away
                              </Text>
                            )}
                            {drop.distanceFeet !== undefined && drop.senderUsername && (
                              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginHorizontal: 6 }}>•</Text>
                            )}
                            {drop.senderUsername && (
                              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                                @{drop.senderUsername}
                              </Text>
                            )}
                          </View>
                        </View>

                        {/* Contact Card Content */}
                        <View style={{ padding: 16 }}>
                          {/* Profile Picture */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                            <View style={{
                              width: 70,
                              height: 70,
                              borderRadius: 35,
                              backgroundColor: '#FFE5DC',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                            }}>
                              {drop.senderProfilePhoto ? (
                                <Image source={{ uri: drop.senderProfilePhoto }} style={{ width: 70, height: 70 }} />
                              ) : (
                                <Text style={{ color: '#FF6B4A', fontSize: 28, fontWeight: '600' }}>
                                  {(drop.senderName || drop.senderUsername || 'U').substring(0, 2).toUpperCase()}
                                </Text>
                              )}
                            </View>
                          </View>

                          {/* Contact Information */}
                          <View style={{ marginBottom: 12 }}>
                            {/* Phone */}
                            {drop.senderPhone && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <MaterialCommunityIcons name="phone" size={16} color={theme.colors.muted} />
                                <Text style={[theme.type.body, { marginLeft: 8, color: theme.colors.text, fontSize: 14 }]}>
                                  {drop.senderPhone}
                                </Text>
                              </View>
                            )}

                            {/* Email */}
                            {drop.senderEmail && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <MaterialCommunityIcons name="email" size={16} color={theme.colors.muted} />
                                <Text style={[theme.type.body, { marginLeft: 8, color: theme.colors.text, fontSize: 14 }]}>
                                  {drop.senderEmail}
                                </Text>
                              </View>
                            )}

                            {/* Social Media */}
                            {drop.senderSocialMedia && drop.senderSocialMedia.map((social, index) => (
                              social.platform && social.handle ? (
                                <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                  <MaterialCommunityIcons
                                    name={social.platform.toLowerCase() as any}
                                    size={16}
                                    color={theme.colors.muted}
                                  />
                                  <Text style={[theme.type.body, { marginLeft: 8, color: theme.colors.text, fontSize: 14 }]}>
                                    {social.handle}
                                  </Text>
                                </View>
                              ) : null
                            ))}
                          </View>

                          {/* Bio Section */}
                          {drop.senderBio && (
                            <View style={{
                              backgroundColor: theme.colors.bg,
                              padding: 12,
                              borderRadius: 8,
                              marginBottom: 16,
                            }}>
                              <Text style={[theme.type.muted, { fontSize: 12, marginBottom: 4 }]}>
                                BIO
                              </Text>
                              <Text style={[theme.type.body, { fontSize: 13, color: theme.colors.text }]}>
                                "{drop.senderBio}"
                              </Text>
                            </View>
                          )}

                          {/* No contact info message */}
                          {!drop.senderPhone && !drop.senderEmail && !drop.senderBio && (!drop.senderSocialMedia || drop.senderSocialMedia.length === 0) && (
                            <View style={{
                              backgroundColor: theme.colors.bg,
                              padding: 12,
                              borderRadius: 8,
                              marginBottom: 16,
                              alignItems: 'center',
                            }}>
                              <Text style={[theme.type.muted, { fontSize: 13, textAlign: 'center' }]}>
                                No additional contact info shared
                              </Text>
                            </View>
                          )}

                          {/* Action Buttons */}
                          <View style={{
                            flexDirection: 'row',
                            gap: 8,
                          }}>
                            <Pressable
                              onPress={() => handleDropAction('accepted', drop)}
                              style={{
                                flex: 1,
                                backgroundColor: theme.colors.blue,
                                paddingVertical: 10,
                                paddingHorizontal: 12,
                                borderRadius: 8,
                              }}
                            >
                              <Text style={[theme.type.button, { fontSize: 13, textAlign: 'center' }]}>
                                Accept
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleDropAction('returned', drop)}
                              style={{
                                flex: 1,
                                backgroundColor: '#FF6B4A',
                                paddingVertical: 10,
                                paddingHorizontal: 12,
                                borderRadius: 8,
                              }}
                            >
                              <Text style={[theme.type.button, { fontSize: 13, textAlign: 'center' }]}>
                                Return Drop
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleDropAction('declined', drop)}
                              style={{
                                flex: 1,
                                backgroundColor: theme.colors.bg,
                                paddingVertical: 10,
                                paddingHorizontal: 12,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: theme.colors.border,
                              }}
                            >
                              <Text style={[theme.type.body, { fontSize: 13, textAlign: 'center', color: theme.colors.muted }]}>
                                Decline
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    ))}

                    {/* New Links Section */}
                    {unviewedLinksFromDb.length > 0 && (
                      <View style={{ marginTop: incomingDrops.length > 0 ? 20 : 0 }}>
                        <Text style={[theme.type.h2, { marginBottom: 12, fontSize: 14, color: theme.colors.green }]}>
                          🔗 New Links
                        </Text>
                        {unviewedLinksFromDb.map((link) => (
                          <View key={link.id} style={{
                            backgroundColor: theme.colors.white,
                            borderRadius: 16,
                            marginBottom: 16,
                            overflow: 'hidden',
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.1,
                            shadowRadius: 4,
                            elevation: 3,
                          }}>
                            {/* Header */}
                            <View style={{
                              backgroundColor: theme.colors.green,
                              paddingVertical: 12,
                              paddingHorizontal: 16,
                              alignItems: 'center',
                            }}>
                              <Text style={[theme.type.h2, { color: theme.colors.white, fontSize: 16 }]}>
                                You linked with {link.otherUserName || link.otherUserUsername || 'someone'}!
                              </Text>
                              {link.otherUserUsername && (
                                <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 4 }}>
                                  @{link.otherUserUsername}
                                </Text>
                              )}
                            </View>

                            {/* Content */}
                            <View style={{ padding: 16 }}>
                              {/* Profile Picture */}
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                                <View style={{
                                  width: 70,
                                  height: 70,
                                  borderRadius: 35,
                                  backgroundColor: '#E8F5E9',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  overflow: 'hidden',
                                }}>
                                  {link.otherUserProfilePhoto ? (
                                    <Image source={{ uri: link.otherUserProfilePhoto }} style={{ width: 70, height: 70 }} />
                                  ) : (
                                    <MaterialCommunityIcons name="link-variant" size={32} color={theme.colors.green} />
                                  )}
                                </View>
                              </View>

                              {/* Contact Information */}
                              <View style={{ marginBottom: 12 }}>
                                {link.otherUserPhone && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                    <MaterialCommunityIcons name="phone" size={16} color={theme.colors.muted} />
                                    <Text style={[theme.type.body, { marginLeft: 8, color: theme.colors.text, fontSize: 14 }]}>
                                      {link.otherUserPhone}
                                    </Text>
                                  </View>
                                )}
                                {link.otherUserEmail && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                    <MaterialCommunityIcons name="email" size={16} color={theme.colors.muted} />
                                    <Text style={[theme.type.body, { marginLeft: 8, color: theme.colors.text, fontSize: 14 }]}>
                                      {link.otherUserEmail}
                                    </Text>
                                  </View>
                                )}
                                {link.otherUserSocialMedia && link.otherUserSocialMedia.map((social, index) => (
                                  social.platform && social.handle ? (
                                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                      <MaterialCommunityIcons
                                        name={social.platform.toLowerCase() as any}
                                        size={16}
                                        color={theme.colors.muted}
                                      />
                                      <Text style={[theme.type.body, { marginLeft: 8, color: theme.colors.text, fontSize: 14 }]}>
                                        {social.handle}
                                      </Text>
                                    </View>
                                  ) : null
                                ))}
                              </View>

                              {/* Bio */}
                              {link.otherUserBio && (
                                <View style={{
                                  backgroundColor: theme.colors.bg,
                                  padding: 12,
                                  borderRadius: 8,
                                  marginBottom: 16,
                                }}>
                                  <Text style={[theme.type.muted, { fontSize: 12, marginBottom: 4 }]}>
                                    BIO
                                  </Text>
                                  <Text style={[theme.type.body, { fontSize: 13, color: theme.colors.text }]}>
                                    "{link.otherUserBio}"
                                  </Text>
                                </View>
                              )}

                              {/* Action buttons */}
                              <View style={{ flexDirection: 'row', gap: 8 }}>
                                <Pressable
                                  onPress={() => {
                                    handleDismissLinkCard(link.id);
                                    setShowDrops(false);
                                    navigateToTab('History');
                                  }}
                                  style={{
                                    flex: 1,
                                    backgroundColor: theme.colors.green,
                                    paddingVertical: 12,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                  }}
                                >
                                  <Text style={[theme.type.body, { color: '#fff', fontWeight: '600' }]}>
                                    View Link
                                  </Text>
                                </Pressable>
                                <Pressable
                                  onPress={() => handleDismissLinkCard(link.id)}
                                  style={{
                                    flex: 1,
                                    backgroundColor: theme.colors.bg,
                                    paddingVertical: 12,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    borderWidth: 1,
                                    borderColor: theme.colors.border,
                                  }}
                                >
                                  <Text style={[theme.type.body, { color: theme.colors.text, fontWeight: '600' }]}>
                                    Okay
                                  </Text>
                                </Pressable>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                    </>
                  )}
                </>
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

        {/* Return Link Confirmation Modal - shown after user returns a drop */}
        <Modal
          visible={showReturnLinkModal}
          transparent={true}
          animationType="fade"
          onRequestClose={handleDismissReturnLinkModal}
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}>
            <View style={{
              backgroundColor: theme.colors.white,
              borderRadius: 20,
              padding: 24,
              width: '90%',
              maxWidth: 320,
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.25,
              shadowRadius: 16,
              elevation: 12,
            }}>
              {/* Link Icon */}
              <View style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: 'rgba(0, 200, 130, 0.15)',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}>
                <LinkIcon size={40} />
              </View>

              {/* Title */}
              <Text style={[theme.type.h1, {
                fontSize: 24,
                color: theme.colors.green,
                marginBottom: 8,
                textAlign: 'center',
              }]}>
                Link Created!
              </Text>

              {/* Subtitle */}
              <Text style={[theme.type.body, {
                fontSize: 16,
                color: theme.colors.text,
                marginBottom: 4,
                textAlign: 'center',
              }]}>
                You linked with
              </Text>

              {/* Contact Name */}
              <Text style={[theme.type.h2, {
                fontSize: 20,
                color: theme.colors.text,
                marginBottom: 4,
                textAlign: 'center',
              }]}>
                {returnedDropInfo?.name || 'User'}
              </Text>

              {/* Username */}
              {returnedDropInfo?.username && (
                <Text style={[theme.type.body, {
                  fontSize: 14,
                  color: theme.colors.muted,
                  marginBottom: 20,
                  textAlign: 'center',
                }]}>
                  @{returnedDropInfo.username}
                </Text>
              )}

              {/* Info Text */}
              <Text style={[theme.type.body, {
                fontSize: 13,
                color: theme.colors.muted,
                marginBottom: 24,
                textAlign: 'center',
                paddingHorizontal: 10,
              }]}>
                View their contact info on the Links page
              </Text>

              {/* Action buttons */}
              <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
                <Pressable
                  onPress={() => {
                    handleDismissReturnLinkModal();
                    navigateToTab('History');
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: theme.colors.green,
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    borderRadius: 12,
                  }}
                >
                  <Text style={[theme.type.body, {
                    color: '#fff',
                    textAlign: 'center',
                    fontWeight: '600',
                    fontSize: 16,
                  }]}>
                    View Link
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleDismissReturnLinkModal}
                  style={{
                    flex: 1,
                    backgroundColor: theme.colors.bg,
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text style={[theme.type.body, {
                    color: theme.colors.text,
                    textAlign: 'center',
                    fontWeight: '600',
                    fontSize: 16,
                  }]}>
                    Okay
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* New Link Notification Modal */}
        <Modal
          visible={showNewLinkModal}
          transparent={true}
          animationType="fade"
          onRequestClose={handleDismissNewLink}
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}>
            <View style={{
              backgroundColor: theme.colors.white,
              borderRadius: 20,
              padding: 24,
              width: '90%',
              maxWidth: 320,
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.25,
              shadowRadius: 16,
              elevation: 12,
            }}>
              {/* Link Icon */}
              <View style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: 'rgba(0, 200, 130, 0.15)',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}>
                <LinkIcon size={40} />
              </View>

              {/* Title */}
              <Text style={[theme.type.h1, {
                fontSize: 24,
                color: theme.colors.green,
                marginBottom: 8,
                textAlign: 'center',
              }]}>
                New Link!
              </Text>

              {/* Subtitle */}
              <Text style={[theme.type.body, {
                fontSize: 16,
                color: theme.colors.text,
                marginBottom: 4,
                textAlign: 'center',
              }]}>
                You're now linked with
              </Text>

              {/* Contact Name */}
              <Text style={[theme.type.h2, {
                fontSize: 20,
                color: theme.colors.text,
                marginBottom: 4,
                textAlign: 'center',
              }]}>
                {currentNewLink?.otherUserName || 'User'}
              </Text>

              {/* Username */}
              {currentNewLink?.otherUserUsername && (
                <Text style={[theme.type.body, {
                  fontSize: 14,
                  color: theme.colors.muted,
                  marginBottom: 20,
                  textAlign: 'center',
                }]}>
                  @{currentNewLink.otherUserUsername}
                </Text>
              )}

              {/* Info Text */}
              <Text style={[theme.type.body, {
                fontSize: 13,
                color: theme.colors.muted,
                marginBottom: 24,
                textAlign: 'center',
                paddingHorizontal: 10,
              }]}>
                View their contact info on the Links page
              </Text>

              {/* OK Button */}
              <Pressable
                onPress={handleDismissNewLink}
                style={{
                  backgroundColor: theme.colors.green,
                  paddingVertical: 14,
                  paddingHorizontal: 40,
                  borderRadius: 12,
                  width: '100%',
                }}
              >
                <Text style={[theme.type.body, {
                  color: '#fff',
                  textAlign: 'center',
                  fontWeight: '600',
                  fontSize: 16,
                }]}>
                  Got it!
                </Text>
              </Pressable>

              {/* Badge count if more links */}
              {unviewedLinksFromDb.length > 1 && (
                <Text style={[theme.type.body, {
                  fontSize: 12,
                  color: theme.colors.muted,
                  marginTop: 12,
                  textAlign: 'center',
                }]}>
                  +{unviewedLinksFromDb.length - 1} more new link{unviewedLinksFromDb.length > 2 ? 's' : ''}
                </Text>
              )}
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
          onRequestClose={() => {
            setShowBlipModal(false);
            setDropError(null);
          }}
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
              position: 'relative',
            }}>
              {/* Close X Button - Upper Right */}
              <Pressable
                onPress={() => {
                  setShowBlipModal(false);
                  setDropError(null);
                }}
                style={({ pressed }) => ({
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: '#F0F0F0',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <MaterialCommunityIcons name="close" size={18} color="#888" />
              </Pressable>

              {/* Header */}
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                {/* Profile Photo */}
                <View style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: blipProfilePhoto ? 'transparent' : '#E5FFE5',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 12,
                  borderWidth: 2,
                  borderColor: '#00FF00',
                  overflow: 'hidden',
                }}>
                  {blipProfilePhoto ? (
                    <Image source={{ uri: blipProfilePhoto }} style={{ width: 60, height: 60 }} />
                  ) : (
                    <MaterialCommunityIcons
                      name="account-circle"
                      size={40}
                      color="#00FF00"
                    />
                  )}
                </View>
                {/* Device Name - Primary Identifier */}
                <Text style={[theme.type.h1, { fontSize: 24, marginBottom: 4, color: theme.colors.text, fontWeight: '700' }]}>
                  {selectedBlipDevice?.username ||
                    (selectedBlipDevice?.name && selectedBlipDevice.name.startsWith(DROPLINK_DEVICE_PREFIX)
                      ? 'Loading user...'
                      : (selectedBlipDevice?.name && selectedBlipDevice.name.trim() ? selectedBlipDevice.name : 'Unknown Device'))}
                </Text>

                {/* Device Details - Distance Only */}
                <View style={{ width: '100%', marginBottom: 12, marginTop: 8 }}>
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#E5FFE5',
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                    borderRadius: 12,
                  }}>
                    <MaterialCommunityIcons name="map-marker-radius" size={14} color="#00FF00" />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#00AA00', marginLeft: 4 }}>
                      {selectedBlipDevice?.distanceFeet.toFixed(1)} ft away
                    </Text>
                  </View>
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
                    const sendTimestamp = Date.now();
                    console.log('[DROP-CRASH] Send button pressed - timestamp:', sendTimestamp);
                    console.log('[DROP-DUPE] HomeScreen send button onPress - timestamp:', sendTimestamp);
                    console.log('[DROP-DUPE] Guard check - selectedBlipDevice:', !!selectedBlipDevice, 'isSendingDrop:', isSendingDrop);
                    
                    // TEMP DISABLED - RE-ENABLE AFTER DROP TESTING
                    // Phone verification gate with whitelist bypass
                    // if (!phoneVerified && !VERIFICATION_WHITELIST.phones.some(p => phone?.includes(p)) && !VERIFICATION_WHITELIST.emails.includes(email)) {
                    //   showToast({ message: 'Verify your phone number to send drops', type: 'info', duration: 3000 });
                    //   navigateToTab('Account');
                    //   return;
                    // }
                    if (selectedBlipDevice && !isSendingDrop) {
                      console.log('[DROP-DUPE] Guard passed - proceeding with send, timestamp:', sendTimestamp);
                      console.log('[DROP-CRASH] Setting isSendingDrop to true');
                      console.log('[DROP-STATE] HomeScreen setIsSendingDrop(true)');
                      setIsSendingDrop(true);
                      setDropError(null);
                      try {
                        console.log('[DROP-CRASH] selectedBlipDevice:', JSON.stringify(selectedBlipDevice, null, 2));
                        // Use userId from device object (already fetched during scan)
                        // If userId is not available, try to look it up now
                        let receiverUserId = selectedBlipDevice.userId;
                        console.log('[DROP-CRASH] Initial receiverUserId from device:', receiverUserId);

                        if (!receiverUserId) {
                          // Extract deviceId from device name
                          const deviceIdMatch = selectedBlipDevice.name?.match(new RegExp(`^${DROPLINK_DEVICE_PREFIX}(.+)$`));
                          if (deviceIdMatch && deviceIdMatch[1]) {
                            const deviceId = deviceIdMatch[1];

                            // Try to look up userId from Supabase - ALWAYS prefer user_profiles.name (display name)
                            try {
                              // ALWAYS query user_profiles FIRST to get display name (e.g., "cheese")
                              // CRITICAL: user_id is UUID type - PostgREST doesn't support ::text casting in LIKE
                              // Solution: Query all user_profiles and filter in JS (UUIDs have hyphens, prefix matching is complex)
                              let { data: allUserProfiles, error: userProfileError } = await supabase
                                .from('user_profiles')
                                .select('user_id, name');

                              // Filter in JavaScript: find user where UUID (as string) starts with deviceId
                              const userProfileData = allUserProfiles?.find(profile =>
                                profile.user_id && profile.user_id.toString().toLowerCase().replace(/-/g, '').startsWith(deviceId.toLowerCase())
                              ) || null;

                              let foundUserId: string | null = null;
                              let foundDisplayName: string | null = null;

                              if (!userProfileError && userProfileData) {
                                // Found in user_profiles - use display name
                                foundUserId = userProfileData.user_id;
                                foundDisplayName = userProfileData.name || deviceId || 'User';
                              }

                              if (foundUserId) {
                                receiverUserId = foundUserId;

                                // Update the device object with the found userId and display name
                                (selectedBlipDevice as any).username = foundDisplayName;
                                (selectedBlipDevice as any).userId = foundUserId;
                              } else {
                                throw new Error(`No user found with device ID: ${deviceId}`);
                              }
                            } catch (lookupError: any) {
                              console.error('[HomeScreen] Lookup failed:', lookupError);
                              setDropError(`Could not find receiver: ${lookupError.message || 'User not found in database'}`);
                              throw new Error(`Could not find receiver: ${lookupError.message || 'User not found'}`);
                            }
                          } else {
                            // Device name doesn't match expected pattern - try to find user by device name directly
                            try {
                              // Try to find user by display name matching the device name (without DL- prefix)
                              const cleanName = selectedBlipDevice.name.replace(/^DL-/, '').trim();

                              // ALWAYS query user_profiles FIRST to get display name (e.g., "cheese")
                              let { data: userProfileData, error: userProfileError } = await supabase
                                .from('user_profiles')
                                .select('user_id, name')
                                .ilike('name', `%${cleanName}%`)
                                .maybeSingle();

                              let foundUserId: string | null = null;
                              let foundDisplayName: string | null = null;

                              if (!userProfileError && userProfileData) {
                                // Found in user_profiles - use display name
                                foundUserId = userProfileData.user_id;
                                foundDisplayName = userProfileData.name || cleanName || 'User';
                              }

                              if (foundUserId) {
                                receiverUserId = foundUserId;
                                // Update with display name
                                (selectedBlipDevice as any).username = foundDisplayName;
                                (selectedBlipDevice as any).userId = foundUserId;
                              } else {
                                throw new Error(`Device name "${selectedBlipDevice.name}" does not match expected format and user lookup failed`);
                              }
                            } catch (fallbackError: any) {
                              console.error('[HomeScreen] Fallback lookup failed:', fallbackError);
                              setDropError(`Could not identify receiver from device name: ${selectedBlipDevice.name}`);
                              throw new Error(`Could not extract device ID: ${fallbackError.message}`);
                            }
                          }
                        }

                        if (!receiverUserId) {
                          // Final fallback: try to use the device's BLE ID as a last resort
                          // This should never happen if deviceId extraction worked, but handle it gracefully
                          const errorMsg = `Could not find receiver. Device name: ${selectedBlipDevice.name}, Device ID: ${selectedBlipDevice.id}`;
                          console.error('[HomeScreen]', errorMsg);
                          setDropError('Could not find receiver. Please try again.');
                          throw new Error('Could not find receiver');
                        }

                        // Validate receiverUserId is not empty
                        if (!receiverUserId || receiverUserId.trim() === '') {
                          const errorMsg = 'Receiver user ID is empty or invalid';
                          console.error('[HomeScreen]', errorMsg);
                          setDropError('Invalid receiver ID. Please try again.');
                          throw new Error(errorMsg);
                        }

                        // Send drop with current user's profile info and distance
                        console.log('[DROP-CRASH] About to call sendDrop - receiverUserId:', receiverUserId, 'distanceFeet:', selectedBlipDevice.distanceFeet);
                        console.log('[DROP-DUPE] Calling sendDrop from HomeScreen - receiverUserId:', receiverUserId, 'timestamp:', Date.now());
                        await sendDrop(receiverUserId, {
                          name: profile?.name || 'User',
                          username: username ?? undefined,
                          email: profile?.email,
                          phone: profile?.phone,
                          bio: profile?.bio,
                          profilePhoto: profile?.profilePhoto,
                          socialMedia: profile?.socialMedia,
                        }, selectedBlipDevice.distanceFeet);

                        console.log('[DROP-CRASH] sendDrop returned successfully');
                        console.log('[DROP-DUPE] sendDrop completed in HomeScreen - timestamp:', Date.now());
                        console.log('[DROP-STATE] HomeScreen setShowBlipModal(false) - after successful send');
                        
                        // Close modal after successful send
                        setShowBlipModal(false);

                        // Show success toast
                        showToast({
                          message: `Drop sent to ${selectedBlipDevice.username || selectedBlipDevice.name}!`,
                          type: 'success',
                          duration: 3000,
                        });

                        // Note: No more simulated return - real returns come from receiver's device
                      } catch (error: any) {
                        // Set detailed error message with actual error details
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        console.error('[DROP-CRASH] EXCEPTION in HomeScreen send flow:', errorMsg);
                        console.error('[DROP-CRASH] Full error:', JSON.stringify(error, null, 2));
                        console.error('[DROP-CRASH] Stack:', error?.stack);
                        setDropError(`Drop failed: ${errorMsg}`);
                        console.error('Drop error details:', error);

                        // Show error toast
                        showToast({
                          message: `Drop failed: ${errorMsg}`,
                          type: 'error',
                          duration: 3000,
                        });
                      } finally {
                        console.log('[DROP-STATE] HomeScreen setIsSendingDrop(false) - in finally block');
                        setIsSendingDrop(false);
                      }
                    } else {
                      console.log('[DROP-DUPE] Guard FAILED - selectedBlipDevice:', !!selectedBlipDevice, 'isSendingDrop:', isSendingDrop);
                    }
                  }}
                  disabled={isSendingDrop}
                  style={({ pressed }) => ({
                    backgroundColor: '#00FF00',
                    paddingVertical: 14,
                    borderRadius: 10,
                    alignItems: 'center',
                    opacity: (pressed || isSendingDrop) ? 0.6 : 1,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 8,
                  })}
                >
                  {isSendingDrop ? (
                    <>
                      <ActivityIndicator size="small" color="#000" />
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#000' }}>
                        Sending...
                      </Text>
                    </>
                  ) : (
                    <>
                      <MaterialCommunityIcons name="water" size={18} color="#000" />
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#000' }}>
                        Drop
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Link Contact Card Modal */}
        <Modal
          visible={showLinkModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowLinkModal(false)}
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
              maxWidth: 320,
              borderWidth: 2,
              borderColor: '#00FF00',
              shadowColor: '#00FF00',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 10,
              elevation: 10,
            }}>
              {/* Header */}
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={{
                  width: 70,
                  height: 70,
                  borderRadius: 35,
                  backgroundColor: '#E5FFE5',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 12,
                  borderWidth: 2,
                  borderColor: '#00FF00',
                }}>
                  <MaterialCommunityIcons
                    name="link-variant"
                    size={40}
                    color="#00FF00"
                  />
                </View>
                <Text style={[theme.type.h1, { fontSize: 20, marginBottom: 6, color: theme.colors.text, fontWeight: '700' }]}>
                  {selectedLink?.name}
                </Text>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#E5FFE5',
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  borderRadius: 12,
                }}>
                  <MaterialCommunityIcons name="map-marker-radius" size={14} color="#00FF00" />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#00AA00', marginLeft: 4 }}>
                    {selectedLink?.distanceFeet?.toFixed(1) || '0.0'} ft away
                  </Text>
                </View>
              </View>

              {/* Contact Information */}
              <View style={{
                backgroundColor: '#F5FFF5',
                padding: 16,
                borderRadius: 12,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: '#E0FFE0',
              }}>
                {selectedLink?.phoneNumber && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <MaterialCommunityIcons name="phone" size={18} color="#00AA00" />
                    <Text style={{ marginLeft: 10, fontSize: 14, color: theme.colors.text, fontWeight: '500' }}>
                      {selectedLink.phoneNumber}
                    </Text>
                  </View>
                )}
                {selectedLink?.email && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <MaterialCommunityIcons name="email" size={18} color="#00AA00" />
                    <Text style={{ marginLeft: 10, fontSize: 14, color: theme.colors.text, fontWeight: '500' }}>
                      {selectedLink.email}
                    </Text>
                  </View>
                )}
                {selectedLink?.bio && (
                  <View style={{ marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E0FFE0' }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.muted, marginBottom: 6, textTransform: 'uppercase' }}>
                      Bio
                    </Text>
                    <Text style={{ fontSize: 13, color: theme.colors.text, lineHeight: 18 }}>
                      {selectedLink.bio}
                    </Text>
                  </View>
                )}
                {selectedLink?.socialMedia && selectedLink.socialMedia.length > 0 && (
                  <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E0FFE0' }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.muted, marginBottom: 8, textTransform: 'uppercase' }}>
                      Social Media
                    </Text>
                    {selectedLink.socialMedia.map((social, index) => {
                      const iconName =
                        social.platform.toLowerCase() === 'instagram' ? 'instagram' :
                          social.platform.toLowerCase() === 'twitter' ? 'twitter' :
                            social.platform.toLowerCase() === 'linkedin' ? 'linkedin' :
                              'link-variant';

                      return (
                        <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                          <MaterialCommunityIcons name={iconName as any} size={16} color="#00AA00" />
                          <Text style={{ marginLeft: 8, fontSize: 13, color: theme.colors.text }}>
                            {social.handle}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Close Button */}
              <Pressable
                onPress={() => setShowLinkModal(false)}
                style={({ pressed }) => ({
                  paddingVertical: 14,
                  borderRadius: 10,
                  alignItems: 'center',
                  backgroundColor: '#00FF00',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#000' }}>
                  Close
                </Text>
              </Pressable>
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
                color={pendingDiscoverableState ? theme.colors.green : '#8E8E93'}
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
                    backgroundColor: pendingDiscoverableState ? theme.colors.green : '#8E8E93',
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

      </View>

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
