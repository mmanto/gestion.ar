import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from '@simplewebauthn/browser';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import axios from 'axios';
import api from './api';
import type { RegisterPlan } from '../types/auth.types';

/**
 * Login alternativo con passkeys (WebAuthn): Face ID, huella, Windows Hello o
 * llave de seguridad. La clave privada nunca sale del autenticador — el backend
 * (`/tenant/oauth/passkey/*`) guarda solo la clave pública y el contador de
 * firmas, sobre las mismas cuentas del login por contraseña.
 *
 * Las ceremonias son stateless: el challenge firmado que devuelven los
 * endpoints de `options` viaja de vuelta en el body de los de `verify`
 * (`challengeToken`).
 */

/** Credencial registrada, tal como la lista GET /tenant/oauth/passkey/credentials. */
export interface PasskeyInfo {
  id: string;
  name: string | null;
  transports: string[] | null;
  created_at: string | null;
}

/** Resultado de registrar una passkey (POST /tenant/oauth/passkey/register/verify). */
export interface PasskeyEnrollment {
  credentialId: string;
  name: string;
  deviceType: string;
  backedUp: boolean;
}

/**
 * El usuario canceló el prompt del navegador (o el SO lo cerró por timeout).
 * No es un error para mostrar en pantalla: el caller lo ignora (ver LoginForm).
 */
export class PasskeyCancelled extends Error {
  constructor(message = 'Autenticación con passkey cancelada') {
    super(message);
    this.name = 'PasskeyCancelled';
  }
}

/** ¿Este navegador/contexto soporta WebAuthn (HTTPS o localhost)? */
export function isPasskeySupported(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

/**
 * Traduce los errores de WebAuthn a mensajes en español. El `detail` del
 * backend (400/401/403/404/409) tiene prioridad: es el único que sabe qué pasó
 * del lado del servidor (desafío vencido, credencial de otra cuenta, etc.).
 *
 * Los navegadores sobrecargan `NotAllowedError` (cancelación del usuario,
 * timeout del autenticador, sin credencial disponible), así que se normaliza a
 * `PasskeyCancelled` en vez de mostrarlo como error.
 */
function toSpanishError(err: unknown): Error {
  if (axios.isAxiosError<{ detail?: string }>(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string' && detail) return new Error(detail);
  }

  switch (errorName(err)) {
    case 'NotAllowedError':
    case 'AbortError':
      return new PasskeyCancelled();
    case 'InvalidStateError':
      return new Error('Esta passkey ya está registrada en este dispositivo');
    case 'SecurityError':
      return new Error('El navegador bloqueó la passkey. Verificá que el sitio use HTTPS y el dominio correcto');
    case 'NotSupportedError':
      return new Error('Este dispositivo no soporta passkeys');
    case 'ConstraintError':
      return new Error('El dispositivo no pudo verificar tu identidad. Probá con otro método');
    case 'UnknownError':
      return new Error('El dispositivo no pudo completar la autenticación. Intentá de nuevo');
    default:
      break;
  }

  // Códigos propios de @simplewebauthn/browser cuando el navegador devuelve un
  // error que no matchea ninguna de las ramas de arriba (ver webAuthnError.js).
  if (err instanceof WebAuthnError) {
    switch (err.code) {
      case 'ERROR_CEREMONY_ABORTED':
        return new PasskeyCancelled();
      case 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED':
        return new Error('Esta passkey ya está registrada en este dispositivo');
      case 'ERROR_INVALID_DOMAIN':
      case 'ERROR_INVALID_RP_ID':
        return new Error('Este dominio no está habilitado para passkeys. Ingresá desde el dominio principal');
      case 'ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT':
      case 'ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE':
        return new Error('El dispositivo no pudo verificar tu identidad. Probá con otro método');
      case 'ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT':
        return new Error('El dispositivo no puede guardar passkeys reutilizables. Probá con Face ID, huella o una llave de seguridad');
      case 'ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG':
        return new Error('Este dispositivo no soporta el tipo de passkey requerido');
      case 'ERROR_AUTHENTICATOR_GENERAL_ERROR':
        return new Error('El dispositivo no pudo completar la operación. Intentá de nuevo');
      default:
        break;
    }
  }

  if (err instanceof Error) return err;
  return new Error('No se pudo completar la operación con passkey');
}

/** Nombre del error sin castear: `Error`, `DOMException` y `WebAuthnError`. */
function errorName(err: unknown): string | null {
  if (err instanceof Error) return err.name;
  if (err && typeof err === 'object' && 'name' in err && typeof err.name === 'string') return err.name;
  return null;
}

/**
 * Registra una passkey para el usuario actual (requiere JWT).
 * 1. Pide las opciones de registro al backend.
 * 2. Abre el prompt del navegador (`startRegistration`) y crea la credencial.
 * 3. Envía la credencial al backend, que guarda la clave pública.
 */
export async function enrollPasskey(name?: string): Promise<PasskeyEnrollment> {
  const { data } = await api.post<{
    options: PublicKeyCredentialCreationOptionsJSON;
    challengeToken: string;
  }>('/tenant/oauth/passkey/register/options').catch((err: unknown) => {
    throw toSpanishError(err);
  });

  let credential: RegistrationResponseJSON;
  try {
    credential = await startRegistration({ optionsJSON: data.options });
  } catch (err) {
    throw toSpanishError(err);
  }

  const { data: result } = await api.post<PasskeyEnrollment>(
    '/tenant/oauth/passkey/register/verify',
    {
      credential,
      challengeToken: data.challengeToken,
      name: name || undefined,
    },
  ).catch((err: unknown) => {
    throw toSpanishError(err);
  });

  return result;
}

/**
 * Ingresa con una passkey ya registrada (sin autenticación previa: es el
 * login). Sin `username` se pide una credencial descubrible, así el usuario
 * elige la passkey en el propio prompt del sistema.
 */
export async function loginWithPasskey(tenantId: string, username?: string): Promise<{ token: string }> {
  const { data } = await api.post<{
    options: PublicKeyCredentialRequestOptionsJSON;
    challengeToken: string;
  }>('/tenant/oauth/passkey/login/options', {
    tenant_id: tenantId,
    username: username || undefined,
  }).catch((err: unknown) => {
    throw toSpanishError(err);
  });

  let credential: AuthenticationResponseJSON;
  try {
    credential = await startAuthentication({ optionsJSON: data.options });
  } catch (err) {
    throw toSpanishError(err);
  }

  const { data: result } = await api.post<{ token: string }>(
    '/tenant/oauth/passkey/login/verify',
    {
      tenant_id: tenantId,
      credential,
      challengeToken: data.challengeToken,
    },
  ).catch((err: unknown) => {
    throw toSpanishError(err);
  });

  return { token: result.token };
}

/**
 * Alta de cuenta con passkey: crea la cuenta **nueva** y la passkey en el mismo
 * paso, sin email ni teléfono (administración completa esos datos después).
 *
 * El `username` lo genera el backend (`pk_…`) y viaja firmado dentro del
 * `challengeToken`, así que una ceremonia abandonada no deja cuentas a medio
 * crear. Desde la pantalla de registro se manda el `plan` elegido, que queda
 * pendiente de aprobación igual que en el alta con Google.
 */
export async function signupWithPasskey(
  tenantId: string,
  options: { nombre: string; plan?: RegisterPlan },
): Promise<{ token: string; username: string }> {
  const { data } = await api.post<{
    options: PublicKeyCredentialCreationOptionsJSON;
    challengeToken: string;
  }>(
    '/tenant/oauth/passkey/signup/options',
    { tenant_id: tenantId, nombre: options.nombre },
  ).catch((err: unknown) => {
    throw toSpanishError(err);
  });

  let credential: RegistrationResponseJSON;
  try {
    credential = await startRegistration({ optionsJSON: data.options });
  } catch (err) {
    throw toSpanishError(err);
  }

  const { data: result } = await api.post<{ token: string; username: string }>(
    '/tenant/oauth/passkey/signup/verify',
    {
      tenant_id: tenantId,
      credential,
      challengeToken: data.challengeToken,
      nombre: options.nombre,
      plan: options.plan,
    },
  ).catch((err: unknown) => {
    throw toSpanishError(err);
  });

  return result;
}

/** Passkeys registradas del usuario actual (requiere JWT). */
export async function listPasskeys(): Promise<PasskeyInfo[]> {
  const { data } = await api
    .get<{ credentials: PasskeyInfo[] }>('/tenant/oauth/passkey/credentials')
    .catch((err: unknown) => {
      throw toSpanishError(err);
    });
  return data.credentials;
}

/** Revoca (borra) una passkey del usuario actual (requiere JWT). */
export async function revokePasskey(credentialId: string): Promise<void> {
  await api
    .delete(`/tenant/oauth/passkey/credentials/${encodeURIComponent(credentialId)}`)
    .catch((err: unknown) => {
      throw toSpanishError(err);
    });
}
