import type { ConnectionStatus, FirmwareState } from '../types';

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
    case 'ERROR': return 'Reinicia el dispositivo antes de continuar.';
    default: return 'No se pudo interpretar el estado del dispositivo.';
  }
}
