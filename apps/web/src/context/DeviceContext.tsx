import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { DeviceService } from '../serial/DeviceService';
import { DemoTransport, type DemoDeviceControls } from '../serial/DemoTransport';
import {
  FirmwareState,
} from '../types';
import type {
  DeviceInfo,
  CapturePhase,
  Gesture,
  GestureData,
  ActiveProfileInfo,
  ActiveSyncInfo,
  RecognitionDetectedData,
  ConnectionStatus,
} from '../types';

interface DeviceContextValue {
  deviceMode: 'hardware' | 'demo';
  setDeviceMode: (mode: 'hardware' | 'demo') => void;
  isDemoMode: boolean;
  // Connection state
  connectionStatus: ConnectionStatus;
  deviceInfo: DeviceInfo | null;
  connectionError: string | null;
  isConnected: boolean;
  isHandshakeValid: boolean;
  
  // Device state
  firmwareState: FirmwareState;
  activeProfile: ActiveProfileInfo | null;
  activeSync: ActiveSyncInfo | null;
  
  // Capture state
  isCapturing: boolean;
  capturePhase: CapturePhase | null;
  captureProgress: number;
  captureError: string | null;
  capturedGestureData: GestureData | null;
  
  // Sync state
  isSyncing: boolean;
  syncProgress: { sent: number; total: number };
  syncError: string | null;
  syncIsComplete: boolean;
  
  // Recognition
  lastRecognition: RecognitionDetectedData | null;
  
  // Actions
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  getStatus: () => Promise<void>;
  startCapture: () => Promise<void>;
  startSync: (profileId: string, profileRevision: string, gestures: Gesture[]) => Promise<void>;
  abortSync: () => Promise<void>;
  restartDemoDevice: () => Promise<void>;
  simulateRecognition: (gestureId?: number) => Promise<boolean>;
  
  // State resetters
  clearCaptureState: () => void;
  clearSyncState: () => void;
  clearRecognition: () => void;
  clearConnectionError: () => void;
}

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [deviceMode, setDeviceModeState] = useState<'hardware' | 'demo'>(() =>
    sessionStorage.getItem('mitten_device_mode') === 'demo' ? 'demo' : 'hardware'
  );
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [firmwareState, setFirmwareState] = useState<FirmwareState>(FirmwareState.INITIALIZING);
  const [activeProfile, setActiveProfile] = useState<ActiveProfileInfo | null>(null);
  const [activeSync, setActiveSync] = useState<ActiveSyncInfo | null>(null);
  
  // Capture state
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturePhase, setCapturePhase] = useState<CapturePhase | null>(null);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [capturedGestureData, setCapturedGestureData] = useState<GestureData | null>(null);
  
  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ sent: 0, total: 0 });
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncIsComplete, setSyncIsComplete] = useState(false);
  
  // Recognition
  const [lastRecognition, setLastRecognition] = useState<RecognitionDetectedData | null>(null);
  
  const deviceServiceRef = useRef<DeviceService | null>(null);
  const isMountedRef = useRef(true);
  const syncGeneration = useRef(0);

  // Initialize device service
  useEffect(() => {
    isMountedRef.current = true;
    
    const service = new DeviceService({
      onStateChange: (state) => {
        if (isMountedRef.current) {
          setFirmwareState(state);
        }
      },
      onConnectionStatusChange: (status, info, error) => {
        if (status === "disconnected" || status === "error") syncGeneration.current++;
        if (isMountedRef.current) {
          setConnectionStatus(status);
          setDeviceInfo(info);
          setConnectionError(error);
        }
      },
      onCaptureProgress: (data) => {
        if (isMountedRef.current) {
          setCapturePhase(data.phase);
          setCaptureProgress(data.progress || 0);
        }
      },
      onCaptureCompleted: (data) => {
        if (isMountedRef.current) {
          setIsCapturing(false);
          setCapturePhase(null);
          setCaptureProgress(100);
          setCapturedGestureData(data.data);
          setCaptureError(null);
        }
      },
      onCaptureFailed: (data) => {
        if (isMountedRef.current) {
          setIsCapturing(false);
          setCapturePhase(null);
          setCaptureProgress(0);
          setCaptureError(data.error.message);
        }
      },
      onSyncProgress: (sent, total) => {
        if (isMountedRef.current) {
          setSyncProgress({ sent, total });
        }
      },
      onSyncCompleted: (profile) => {
        if (isMountedRef.current) {
          setIsSyncing(false);
          setActiveProfile(profile);
          setActiveSync(null);
          setSyncIsComplete(true);
          setSyncError(null);
          setSyncProgress({ sent: 0, total: 0 });
        }
      },
      onSyncFailed: (error) => {
        syncGeneration.current++;
        if (isMountedRef.current) {
          setIsSyncing(false);
          setSyncError(error.message);
          setActiveSync(null);
        }
      },
      onRecognitionDetected: (data) => {
        if (isMountedRef.current) {
          setLastRecognition(data);
        }
      },
      onError: (error) => {
        if (isMountedRef.current) {
          setConnectionError(error.message);
        }
      },
      onDeviceError: (code, message, details) => {
        if (isMountedRef.current) {
          console.error(`Device error [${code}]:`, message, details);
        }
      },
    }, deviceMode === 'demo' ? handlers => new DemoTransport(handlers) : undefined);
    
    deviceServiceRef.current = service;
    
    return () => {
      isMountedRef.current = false;
      service.disconnect().catch(console.error);
    };
  }, [deviceMode]);

  const setDeviceMode = useCallback((mode: 'hardware' | 'demo') => {
    if (connectionStatus !== 'disconnected' && connectionStatus !== 'error') {
      throw new Error('Desconecta el dispositivo antes de cambiar de modo');
    }
    sessionStorage.setItem('mitten_device_mode', mode);
    setConnectionError(null);
    setDeviceModeState(mode);
  }, [connectionStatus]);

  const connect = useCallback(async () => {
    const service = deviceServiceRef.current;
    if (!service) throw new Error('Device service not initialized');
    
    setConnectionError(null);
    try {
      const info = await service.connect();
      setDeviceInfo(info);
      setFirmwareState(info.state);
      setActiveProfile(info.activeProfile as ActiveProfileInfo | null);
      setActiveSync(info.activeSync as ActiveSyncInfo | null);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Connection failed');
      throw error;
    }
  }, []);

  const disconnect = useCallback(async () => {
    const service = deviceServiceRef.current;
    if (!service) return;
    
    await service.disconnect();
    setDeviceInfo(null);
    setFirmwareState(FirmwareState.INITIALIZING);
    setActiveProfile(null);
    setActiveSync(null);
    setIsCapturing(false);
    setCapturePhase(null);
    setCaptureProgress(0);
    setCaptureError(null);
    setCapturedGestureData(null);
    setIsSyncing(false);
    setSyncProgress({ sent: 0, total: 0 });
    setSyncError(null);
    setSyncIsComplete(false);
  }, []);

  const getStatus = useCallback(async () => {
    const service = deviceServiceRef.current;
    if (!service) throw new Error('Device service not initialized');
    
    try {
      const status = await service.getStatus();
      setFirmwareState(status.state);
      setActiveProfile(status.activeProfile as ActiveProfileInfo | null);
      setActiveSync(status.activeSync as ActiveSyncInfo | null);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Failed to get status');
      throw error;
    }
  }, []);

  const startCapture = useCallback(async () => {
    const service = deviceServiceRef.current;
    if (!service) throw new Error('Device service not initialized');
    
    setIsCapturing(true);
    setCaptureError(null);
    setCaptureProgress(0);
    setCapturedGestureData(null);
    
    try {
      await service.startCapture();
    } catch (error) {
      setIsCapturing(false);
      setCaptureError(error instanceof Error ? error.message : 'Capture failed');
      throw error;
    }
  }, []);

  const startSync = useCallback(async (profileId: string, profileRevision: string, gestures: Gesture[]) => {
    const service = deviceServiceRef.current;
    if (!service) throw new Error('Device service not initialized');
    
    if (gestures.length > (deviceInfo?.capabilities.maxGestures || 50)) {
      throw new Error(`Too many gestures (${gestures.length}). Maximum is ${deviceInfo?.capabilities.maxGestures || 50}`);
    }
    
    const generation = ++syncGeneration.current;
    setIsSyncing(true);
    setSyncError(null);
    setSyncIsComplete(false);
    setSyncProgress({ sent: 0, total: gestures.length });
    
    const syncId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    try {
      // Start sync transaction
      await service.startSync(syncId, profileId, profileRevision, gestures.length);
      setActiveSync({
        syncId,
        profileId,
        profileRevision,
        expectedGestureCount: gestures.length,
        receivedCount: 0,
        nextIndex: 0,
      });
      
      // Send each gesture
      for (let i = 0; i < gestures.length; i++) {
        if (generation !== syncGeneration.current) return;
        await service.sendGesture(syncId, i, gestures[i]);
      }
      
      // Commit sync
      if (generation !== syncGeneration.current) return;
      await service.commitSync(syncId);
      
    } catch (error) {
      setIsSyncing(false);
      setSyncError(error instanceof Error ? error.message : 'Sync failed');
      // Try to abort on error
      try {
        await service.abortSync(syncId);
      } catch {
        // Ignore abort errors
      }
      throw error;
    }
  }, [deviceInfo]);

  const abortSync = useCallback(async () => {
    const service = deviceServiceRef.current;
    if (!service || !activeSync) return;
    
    syncGeneration.current++;
    try {
      await service.abortSync(activeSync.syncId);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Abort failed');
      throw error;
    }
    setIsSyncing(false);
    setActiveSync(null);
    setSyncError(null);
    setSyncProgress({ sent: 0, total: 0 });
  }, [activeSync]);

  const restartDemoDevice = useCallback(async () => {
    const service = deviceServiceRef.current;
    if (!service || deviceMode !== 'demo') throw new Error('El reinicio simulado sólo está disponible en modo demostración');
    const transport = service.getTransport() as unknown as DemoDeviceControls;
    await service.disconnect();
    await transport.restart();
    const info = await service.connect();
    setDeviceInfo(info);
    await getStatus();
  }, [deviceMode, getStatus]);

  const simulateRecognition = useCallback(async (gestureId?: number) => {
    const service = deviceServiceRef.current;
    if (!service || deviceMode !== 'demo') throw new Error('El reconocimiento simulado sólo está disponible en modo demostración');
    return (service.getTransport() as unknown as DemoDeviceControls).recognize(gestureId);
  }, [deviceMode]);

  const clearCaptureState = useCallback(() => {
    setCaptureError(null);
    setCapturedGestureData(null);
    setCaptureProgress(0);
    setCapturePhase(null);
  }, []);

  const clearSyncState = useCallback(() => {
    setSyncError(null);
    setSyncIsComplete(false);
    setSyncProgress({ sent: 0, total: 0 });
  }, []);

  const clearRecognition = useCallback(() => {
    setLastRecognition(null);
  }, []);

  const clearConnectionError = useCallback(() => {
    setConnectionError(null);
  }, []);

  const value: DeviceContextValue = {
    deviceMode,
    setDeviceMode,
    isDemoMode: deviceMode === 'demo',
    connectionStatus,
    deviceInfo,
    connectionError,
    isConnected: connectionStatus === 'connected',
    isHandshakeValid: deviceServiceRef.current?.isHandshakeValid() ?? false,
    firmwareState,
    activeProfile,
    activeSync,
    isCapturing,
    capturePhase,
    captureProgress,
    captureError,
    capturedGestureData,
    isSyncing,
    syncProgress,
    syncError,
    syncIsComplete,
    lastRecognition,
    connect,
    disconnect,
    getStatus,
    startCapture,
    startSync,
    abortSync,
    restartDemoDevice,
    simulateRecognition,
    clearCaptureState,
    clearSyncState,
    clearRecognition,
    clearConnectionError,
  };

  return (
    <DeviceContext.Provider value={value}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice(): DeviceContextValue {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error('useDevice must be used within a DeviceProvider');
  }
  return context;
}
