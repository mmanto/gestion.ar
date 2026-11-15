import { usePasskeySettings } from '../../../components/settings/usePasskeySettings';
import { REASON_LABELS, useBiometricSettings } from '../../../components/settings/useBiometricSettings';

/** Passkeys y acceso con huella, con la presentación del tema UrbanVoice. */
export default function SecurityBlock() {
  const passkeys = usePasskeySettings();
  const biometric = useBiometricSettings();

  return (
    <section className="card uv-set-card">
      <header className="uv-set-head">
        <div>
          <h3>Acceso y seguridad</h3>
          <p>Entrá sin contraseña con passkeys o huella.</p>
        </div>
      </header>

      <div className="uv-set-sec">
        <div className="uv-set-sec-head">
          <b>Passkeys</b>
          <span className={`uv-set-status ${passkeys.supported ? 'ok' : 'warn'}`}>
            {passkeys.supported ? 'Disponible' : 'No disponible'}
          </span>
        </div>

        {!passkeys.supported ? (
          <p>Este navegador no soporta passkeys. Probá con uno actualizado o desde la app en el celular.</p>
        ) : (
          <>
            {passkeys.error ? <div className="uv-set-alert err">{passkeys.error}</div> : null}
            {passkeys.hint ? <div className="uv-set-alert info">{passkeys.hint}</div> : null}

            <div className="uv-set-inline">
              <div className="uv-set-field">
                <label htmlFor="uv-passkey-name">Nombre (opcional)</label>
                <input
                  id="uv-passkey-name"
                  type="text"
                  value={passkeys.name}
                  onChange={(event) => passkeys.setName(event.target.value)}
                  placeholder="Ej. Notebook del estudio"
                  disabled={passkeys.busy}
                />
              </div>
              <button
                type="button"
                className="btn pri sm"
                onClick={passkeys.handleAdd}
                disabled={passkeys.busy}
              >
                {passkeys.busy ? 'Agregando…' : 'Agregar passkey'}
              </button>
            </div>

            <div className="uv-set-list">
              {passkeys.loading ? (
                <p className="uv-set-hint">Cargando…</p>
              ) : passkeys.passkeys.length === 0 ? (
                <p className="uv-set-hint">Todavía no registraste ninguna passkey.</p>
              ) : (
                passkeys.passkeys.map((passkey) => (
                  <div className="uv-set-row" key={passkey.id}>
                    <span>{passkey.name || 'Passkey'}</span>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => passkeys.handleRevoke(passkey.id)}
                      disabled={passkeys.revokingId === passkey.id}
                    >
                      {passkeys.revokingId === passkey.id ? 'Revocando…' : 'Revocar'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {biometric.isNative ? (
        <div className="uv-set-sec">
          <div className="uv-set-sec-head">
            <b>Acceso con huella</b>
            <span className={`uv-set-status ${biometric.enrolled ? 'ok' : biometric.available ? 'warn' : 'bad'}`}>
              {biometric.enrolled ? 'Habilitada' : biometric.available ? 'Disponible' : 'No disponible'}
            </span>
          </div>

          {biometric.error ? <div className="uv-set-alert err">{biometric.error}</div> : null}

          {!biometric.available ? (
            <>
              <p>Tu dispositivo no tiene una huella configurada. Activá una en los ajustes del teléfono para poder iniciar sesión con tu huella.</p>
              {biometric.reason !== undefined ? (
                <p className="uv-set-hint">
                  Diagnóstico: {REASON_LABELS[biometric.reason] ?? `código ${biometric.reason} de BiometricManager`}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p>
                {biometric.enrolled
                  ? 'Iniciá sesión en este dispositivo con tu huella.'
                  : 'Entrá sin escribir tu usuario y contraseña cada vez.'}
              </p>
              <div className="uv-set-actions">
                <button
                  type="button"
                  className={`btn sm ${biometric.enrolled ? 'danger' : 'pri'}`}
                  onClick={biometric.enrolled ? biometric.handleDisable : biometric.handleEnable}
                  disabled={biometric.busy}
                >
                  {biometric.busy ? 'Procesando…' : biometric.enrolled ? 'Deshabilitar' : 'Habilitar'}
                </button>
              </div>

              {biometric.devices.length > 0 ? (
                <div className="uv-set-list">
                  {biometric.devices.map((device) => (
                    <div className="uv-set-row" key={device.device_id}>
                      <span>{device.device_name || device.device_id.slice(0, 12)}</span>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => biometric.handleRevoke(device.device_id)}
                      >
                        Revocar
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
