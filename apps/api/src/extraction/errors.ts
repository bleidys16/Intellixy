/**
 * Error esperado durante la extracción (PDF escaneado, imagen sin texto, límite de
 * páginas...). Su `message` está pensado para mostrarse tal cual al usuario; cualquier
 * otro error se registra en el log y el usuario ve un mensaje genérico.
 */
export class ExtractionError extends Error {}
