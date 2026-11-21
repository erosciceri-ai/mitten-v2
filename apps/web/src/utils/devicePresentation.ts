import type { ConnectionStatus, FirmwareState } from '../types';

export function isWebSerialSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serial' in navigator &&
    typeof window !== 'undefined' &&
    Boolean(window.isSecureContext)
  );
}

export function localizeDeviceError(message?: string | null): string {
  if (!message) return '';
  const normalized = message.toLowerCase();
  if (normalized.includes('web serial api is not supported')) {
    return 'Este navegador no admite Web Serial por USB. Usá Chrome o Edge en HTTPS, o cambiá a Guante por Wi-Fi o Modo demostración.';
  }
  if (normalized.includes('secure context') || normalized.includes('requires https')) {
    return 'La conexión USB requiere abrir MITTEN en HTTPS o localhost. También podés usar Guante por Wi-Fi o Modo demostración.';
  }
  if (
    normalized.includes('no port selected') ||
    normalized.includes('did not select a port') ||
    normalized.includes('notfounderror')
  ) {
    return 'No seleccionaste ningún puerto USB.';
  }
  if (normalized.includes('failed to open serial port') || normalized.includes('networkerror')) {
    return 'No se pudo abrir el puerto USB del guante. Verificá que no esté en uso en otro programa y volvé a intentarlo.';
  }
  if (normalized.includes('device not connected')) {
    return 'MITTEN no está conectado.';
  }
  if (normalized.includes('device service not initialized')) {
    return 'El servicio del dispositivo todavía no está listo. Intentá nuevamente.';
  }
  return message;
}

export function getConnectionLabel(status: ConnectionStatus): string {
  switch (status) {
    case 'connecting': return 'Conectando';
    case 'handshake': return 'Comprobando conexión';
    case 'connected': return 'Conectado';
    case 'error': return 'Error de conexión';
    default: return 'Desconectado';
  }
}

export function getFirmwareStateLabel(state: FirmwareState): string {
  switch (state) {
    case 'IDLE': return 'Listo';
    case 'CAPTURING': return 'Capturando';
    case 'SYNCING': return 'Sincronizando';
    case 'CALIBRATING': return 'Calibrando';
    case 'INITIALIZING': return 'Iniciando';
    case 'ERROR': return 'Requiere reinicio';
    default: return 'Estado desconocido';
  }
}

export function getFirmwareStateDescription(state: FirmwareState): string {
  switch (state) {
    case 'IDLE': return 'MITTEN puede capturar gestos o recibir tu biblioteca.';
    case 'CAPTURING': return 'MITTEN está registrando un gesto.';
    case 'SYNCING': return 'MITTEN está recibiendo la biblioteca.';
    case 'CALIBRATING': return 'Mantené el guante quieto mientras ajusta sus sensores.';
    case 'INITIALIZING': return 'Esperá mientras MITTEN prepara sus componentes.';
    case 'ERROR': return 'Reiniciá el dispositivo antes de continuar.';
    default: return 'No se pudo interpretar el estado del dispositivo.';
  }
}
