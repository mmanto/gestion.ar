import { LoginForm } from '../../components/auth/LoginForm';
import { UvIcon } from './ui/UvIcon';
import { UvSprite } from './ui/UvSprite';
import './fonts.css';
import './panel.css';

/**
 * Ingreso del tenant UrbanVoice — réplica de `administracion/index.html`
 * (demo de administración): panel de marca a la izquierda y caja de ingreso
 * a la derecha. El formulario es el mismo `LoginForm` de la app (usuario +
 * contraseña, Google, passkey y huella), sólo cambia la presentación.
 */
export function UrbanVoiceLogin() {
  return (
    <div className="uv-admin">
      <UvSprite />
      <section className="login">
        <div className="login-art">
          <div className="brand big">
            <img className="uv-logo" src="/uv/landing/logoblanco.png" alt="UrbanVoice" />
          </div>
          <h1>
            La plataforma para
            <br />
            todos los clientes
          </h1>
          <p>
            Desde acá controlás los clientes, sus planes y abonos, y las comisiones de los partners
            que los dan de alta.
          </p>
          <ul className="login-pts">
            <li>
              <UvIcon name="check" /> Alta de clientes en 5 pasos
            </li>
            <li>
              <UvIcon name="check" /> 3 planes con módulos a elección
            </li>
            <li>
              <UvIcon name="check" /> Cobros, vencimientos y suspensiones
            </li>
          </ul>
        </div>

        <div className="login-box">
          <h2>Ingresar</h2>
          <p className="muted">Administración de la plataforma</p>
          <LoginForm variant="urbanvoice" />
        </div>
      </section>
    </div>
  );
}
