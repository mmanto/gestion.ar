import { Fragment, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import './fonts.css';
import './landing/landing.css';

/**
 * Landing pública de UrbanVoice — réplica del sitio estático
 * `sites/urbanvoice/index.html` (retirado, ADR-044). El CSS es una transcripción mecánica scopeada
 * a `.uv-landing` (ver landing.css) y los assets viven en public/uv/landing/.
 *
 * Es la landing del tenant UrbanVoice, no del tema del backoffice: la resuelve
 * `pages/Landing.tsx` por slug/nombre (`config/tenantLanding.ts`). El resto del
 * producto (login, panel) es la app de intellify, no la demo de administración.
 */

const WHATSAPP = 'https://wa.me/5492212267836';
const asset = (name: string) => `/uv/landing/${name}`;

const NAV = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'como-funciona', label: 'Cómo funciona' },
  { id: 'asistente', label: 'Asistente' },
  { id: 'mapa', label: 'Mapa' },
  { id: 'servicios', label: 'Servicios' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'nosotros', label: 'Equipo' },
] as const;

const HERO_FEATURES = [
  { icon: 'escucha.png', label: 'Escuchá', sub: 'a los vecinos' },
  { icon: 'visualiza.png', label: 'Visualizá', sub: 'la realidad' },
  { icon: 'analiza.png', label: 'Analizá', sub: 'tendencias' },
  { icon: 'informa.png', label: 'Informá', sub: 'a la comunidad' },
] as const;

const STATS = [
  { icon: 'informa.png', strong: '+10.000', label: 'Vecinos informados' },
  { icon: 'visualiza.png', strong: 'Información', label: 'geolocalizada' },
  { icon: 'analiza.png', strong: 'Datos en', label: 'tiempo real' },
  { icon: 'escucha.png', strong: 'Comunidades', label: 'más participativas' },
] as const;

const PROCESS_STEPS = [
  { num: 1, icon: 'escucha.png', title: 'Los vecinos informan', text: <>Realizan reclamos, consultas <br />o sugerencias desde la web <br />o su celular, con asistencia <br />de IA.</> },
  { num: 2, icon: 'visualiza.png', title: 'Se geolocalizan', text: <>Cada reporte se ubica <br />en el mapa con categoría, <br />detalles y fecha.</> },
  { num: 3, icon: 'analiza.png', title: 'Se organizan', text: <>La información se clasifica <br />y se centraliza por zona, <br />tipo de problema y temática.</> },
  { num: 4, icon: 'informa.png', title: 'Se visualizan', text: <>Obtenés una visión clara <br />de las principales <br />problemáticas, tendencias <br />y datos de tu ciudad.</> },
] as const;

const ASSISTANT_FEATURES = [
  { icon: 'responde.png', label: <>Responde <br />consultas</> },
  { icon: 'tramites.png', label: <>Brinda información <br />sobre trámites <br />y servicios</> },
  { icon: 'reclamos.png', label: <>Recibe reclamos <br />y sugerencias</> },
  { icon: 'orienta.png', label: <>Orienta y acompaña <br />a los vecinos</> },
] as const;

const INFO_CARDS = [
  { icon: 'cat-tramites.png', label: <>Trámites <br />y servicios</> },
  { icon: 'cat-normativas.png', label: <>Normativas <br />y ordenanzas</> },
  { icon: 'cat-residuos.png', label: <>Residuos <br />y ambiente</> },
  { icon: 'cat-salud.png', label: <>Salud <br />y centros médicos</> },
  { icon: 'cat-transporte.png', label: <>Transporte <br />y movilidad</> },
  { icon: 'cat-obras.png', label: <>Obras y <br />espacios públicos</> },
  { icon: 'cat-educacion.png', label: <>Educación <br />y cultura</> },
  { icon: 'cat-propuestas.png', label: <>Propuestas <br />de los vecinos</> },
] as const;

const TEAM = [
  { name: 'Diego Giovannetti', role: 'CBO', title: 'Director de Negocios', id: 'uv-tav-2', from: '#071c70', to: '#087cf5' },
  { name: 'Martín Bruno', role: 'CEO', title: 'Director Ejecutivo', id: 'uv-tav-1', from: '#087cf5', to: '#09bce9' },
  { name: 'Gabriel Suárez', role: 'CIO', title: 'Director de Información', id: 'uv-tav-4', from: '#0a5fd6', to: '#09bce9' },
  { name: 'Martín Mantovani', role: 'CTO', title: 'Director de Tecnología', id: 'uv-tav-3', from: '#09bce9', to: '#087cf5' },
] as const;

function TeamAvatar({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <svg className="team-avatar" viewBox="0 0 200 158" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Avatar">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="200" height="158" fill="#edf8ff" />
      <circle cx="100" cy="66" r="62" fill="#dff1fc" />
      <path d="M28 158c0-32 30-52 72-52s72 20 72 52z" fill={`url(#${id})`} />
      <circle cx="100" cy="64" r="28" fill={`url(#${id})`} />
    </svg>
  );
}

export function UrbanVoiceLanding() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1100) setMenuOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Metadatos del sitio público: el SPA arranca con el <title> genérico del
  // backoffice y sin description/Open Graph. Se restauran al desmontar para no
  // dejar la landing marcada en /login.
  useEffect(() => {
    const previousTitle = document.title;
    const created: HTMLMetaElement[] = [];
    const upsert = (attr: 'name' | 'property', key: string, content: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, key);
        document.head.appendChild(element);
        created.push(element);
      }
      element.setAttribute('content', content);
    };

    const title = 'UrbanVoice — Cuando la ciudad habla, vos escuchás.';
    const description = 'UrbanVoice muestra los reclamos de los vecinos geolocalizados y organizados para conocer las problemáticas de cada barrio y tomar mejores decisiones.';
    document.title = title;
    upsert('name', 'description', description);
    upsert('property', 'og:type', 'website');
    upsert('property', 'og:title', title);
    upsert('property', 'og:description', description);
    upsert('property', 'og:image', `${window.location.origin}/uv/landing/hero.png`);

    return () => {
      document.title = previousTitle;
      created.forEach((element) => element.remove());
    };
  }, []);

  const goTo = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    setMenuOpen(false);
    if (id === 'inicio') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="uv-landing">
      <header className={`header${menuOpen ? ' open' : ''}`}>
        <div className="container navbar">
          <a className="brand" href="#inicio" onClick={(event) => goTo(event, 'inicio')}>
            <img src={asset('logo.png')} alt="UrbanVoice — Cuando la ciudad habla, vos escuchás." />
          </a>
          <button
            className="menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            aria-controls="uv-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span /><span /><span />
          </button>
          <nav className="links" id="uv-menu">
            {NAV.map((item) => (
              <a
                key={item.id}
                className={item.id === 'inicio' ? 'active' : undefined}
                href={`#${item.id}`}
                onClick={(event) => goTo(event, item.id)}
              >
                {item.label}
              </a>
            ))}
            <a className="nav-cta" href={WHATSAPP} target="_blank" rel="noopener noreferrer">Solicitá una demo</a>
            <Link className="nav-login" to="/login">Ingresar</Link>
          </nav>
        </div>
      </header>

      <section className="hero" id="inicio">
        <div className="container hero-grid">
          <div className="copy">
            <div className="eyebrow">Datos reales. Ciudades más informadas.</div>
            <h1>¿Te gustaría saber qué pasa en tu ciudad?</h1>
            <p className="lead">UrbanVoice te muestra, en un solo lugar, los reclamos de los vecinos, geolocalizados y organizados, para que puedas conocer las principales problemáticas, identificar tendencias y tomar mejores decisiones.</p>

            <div className="feature-grid">
              {HERO_FEATURES.map((feature) => (
                <div className="feature" key={feature.label}>
                  <img src={asset(feature.icon)} alt="" />
                  <b>{feature.label}</b>
                  <span>{feature.sub}</span>
                </div>
              ))}
            </div>

            <div className="actions">
              <a className="btn primary" href={WHATSAPP} target="_blank" rel="noopener noreferrer">Solicitá una demo gratuita&nbsp; →</a>
              <a className="btn secondary" href="#clientes" onClick={(event) => goTo(event, 'clientes')}>Ver clientes</a>
            </div>
          </div>

          <div className="visual">
            <div className="note">Vecinos más informados. <br />Ciudades más fuertes.</div>
            <img className="hero-art" src={asset('hero.png')} alt="Mapa de reclamos UrbanVoice y asistente ciudadano" />
          </div>
        </div>
      </section>

      <section className="stats-wrap">
        <div className="stats">
          {STATS.map((stat) => (
            <div className="stat" key={stat.strong}>
              <img src={asset(stat.icon)} alt="" />
              <div>
                <strong>{stat.strong}</strong>
                <span>{stat.label}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="how" id="como-funciona">
        <img className="how-city" src={asset('ciudad-decorativa.png')} alt="" />
        <div className="how-inner">
          <header className="how-heading">
            <div className="how-eyebrow">ASÍ DE SIMPLE</div>
            <h2>De la realidad al conocimiento</h2>
            <p>Transformamos los reclamos y consultas de los vecinos en información clara y <br />
              visual para que puedas conocer qué pasa en cada zona de tu ciudad.</p>
          </header>

          <div className="process">
            <div className="process-line">
              {PROCESS_STEPS.map((step, index) => (
                <Fragment key={step.num}>
                  <div className="process-step">
                    <span className="process-num">{step.num}</span>
                    <div className="process-icon"><img src={asset(step.icon)} alt="" /></div>
                  </div>
                  {index < PROCESS_STEPS.length - 1 && <div className="process-arrow">⇢</div>}
                </Fragment>
              ))}
            </div>

            <div className="process-cards">
              {PROCESS_STEPS.map((step) => (
                <article key={step.num}>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="assistant-section" id="asistente">
        <div className="assistant-inner">
          <div className="assistant-copy">
            <div className="assistant-eyebrow">TU ASISTENTE CIUDADANO</div>
            <h2>Información y atención <br />para todos los vecinos</h2>
            <p className="assistant-lead">Un asistente con inteligencia artificial disponible las 24 horas para responder consultas, recibir reclamos y brindar información útil sobre tu ciudad, de manera simple y natural.</p>
            <div className="assistant-features">
              {ASSISTANT_FEATURES.map((feature) => (
                <div className="assistant-feature" key={feature.icon}>
                  <img src={asset(feature.icon)} alt="" />
                  <span>{feature.label}</span>
                </div>
              ))}
            </div>
            <a className="assistant-btn" href={WHATSAPP} target="_blank" rel="noopener noreferrer">Conocé más sobre el asistente →</a>
          </div>
          <div className="assistant-visual"><img src={asset('assistant-phone.png')} alt="" /></div>
        </div>
      </section>

      <section className="map-section" id="mapa">
        <div className="map-inner">
          <div className="map-copy">
            <div className="map-eyebrow">UN MAPA QUE HABLA DE TU CIUDAD</div>
            <h2>Visualizá las problemáticas <br />de cada barrio</h2>
            <p>Explorá un mapa interactivo con todos los reclamos geolocalizados, filtrá por categoría, zona y fecha, y conocé qué pasa realmente en tu ciudad.</p>
            <a className="map-btn" href={WHATSAPP} target="_blank" rel="noopener noreferrer">Contáctanos <b>→</b></a>
          </div>

          <div className="map-visual">
            <img src={asset('mapa-problematicas-crop.png')} alt="Mapa de problemáticas geolocalizadas" />
          </div>

          <aside className="map-panel">
            <h3>Datos que te ayudan <br />a entender la realidad</h3>
            <p>Accedé a estadísticas, tendencias y reportes que muestran una visión clara de las problemáticas de tu ciudad.</p>
            <div className="map-chart" aria-hidden="true"><i /><i /><i /><i /></div>
            <a className="map-btn" href={WHATSAPP} target="_blank" rel="noopener noreferrer">Conocé el panel de información <b>→</b></a>
          </aside>
        </div>
      </section>

      <section className="info-section" id="servicios">
        <div className="info-inner">
          <div className="info-copy">
            <div className="info-eyebrow">INFORMACIÓN ÚTIL, SIEMPRE A MANO</div>
            <h2>Trámites, servicios <br />y novedades</h2>
            <p>Los vecinos pueden acceder a información actualizada sobre trámites, normativas, servicios, obras y propuestas de la ciudad, de forma rápida y sencilla.</p>
            <a className="info-btn" href={WHATSAPP} target="_blank" rel="noopener noreferrer">Quiero información <b>→</b></a>
          </div>
          <div className="info-categories">
            {INFO_CARDS.map((card) => (
              <div className="info-card" key={card.icon}>
                <img src={asset(card.icon)} alt="" />
                <span>{card.label}</span>
              </div>
            ))}
          </div>
          <div className="info-person"><img src={asset('ciudad-cerca-tuya-clean.png')} alt="Una ciudad más cerca tuya" /></div>
        </div>
      </section>

      <section className="trust-section" id="clientes">
        <div className="trust-inner-v2">
          <div className="trust-main-v2">
            <div className="trust-eyebrow">CONFÍAN EN URBANVOICE</div>
            <h2 className="trust-heading">Quienes conocen <br />la realidad <br /><span className="trust-heading-accent">de su ciudad</span></h2>
            <p className="trust-sub">UrbanVoice ayuda a referentes, líderes, candidatos, etc a escuchar a los vecinos, identificar las principales problemáticas y construir propuestas basadas en datos reales.</p>
          </div>
          <div className="trust-quote-card">
            <div className="trust-quote-text">
              <div className="quote-sign">“</div>
              <p>Con UrbanVoice pudimos conocer en detalle las problemáticas de cada barrio. La información real de los vecinos nos permitió <b>diseñar propuestas concretas y priorizar lo que realmente importa.</b></p>
              <div className="trust-quote-author">
                <span className="author-line" />
                <div>
                  <strong>Equipo de Campaña</strong>
                  <span>San Carlos de Bolívar, Buenos Aires</span>
                </div>
              </div>
            </div>
            <div className="trust-quote-photo" style={{ backgroundImage: `url('${asset('bolivarpach.png')}')` }} />
          </div>
        </div>
      </section>

      <section className="team-section" id="nosotros">
        <div className="team-inner">
          <div className="team-copy">
            <div className="team-eyebrow">UN EQUIPO CON PROPÓSITO</div>
            <h2>Las personas detrás de UrbanVoice</h2>
            <p>Somos un equipo de profesionales en tecnología, datos y gobierno local, convencidos de que la información puede generar comunidades más activas, participativas y mejor conectadas.</p>
            <a className="team-btn" href={WHATSAPP} target="_blank" rel="noopener noreferrer">Conocé nuestro equipo →</a>
          </div>
          <div className="team-grid">
            {TEAM.map((member) => (
              <article className="team-card" key={member.id}>
                <div className="team-photo">
                  <TeamAvatar id={member.id} from={member.from} to={member.to} />
                </div>
                <div className="team-meta">
                  <strong>{member.name}</strong>
                  <span className="team-role">{member.role}</span>
                  <span className="team-title">{member.title}</span>
                  <i className="team-linkedin">in</i>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="footer-cta" id="contacto">
        <div className="footer-cta-inner">
          <h2>¿Te gustaría saber qué pasa en tu ciudad?</h2>
          <p>Solicitá una demo y descubrí cómo UrbanVoice te ayuda a conocer la realidad de tu territorio con datos, mapas y análisis.</p>
          <div className="footer-actions">
            <a className="footer-demo" href={WHATSAPP} target="_blank" rel="noopener noreferrer">Solicitá una demo gratuita <b>→</b></a>
            <a className="footer-contact" href={WHATSAPP} target="_blank" rel="noopener noreferrer">✉ &nbsp; Contactanos</a>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-main">
          <div className="footer-brand">
            <img src={asset('logoblanco.png')} alt="UrbanVoice" className="footer-logo" />
            <p>Cuando la ciudad habla, <br />vos escuchás.</p>
          </div>
          <div className="footer-col">
            <strong>Producto</strong>
            <a href="#como-funciona" onClick={(event) => goTo(event, 'como-funciona')}>Cómo funciona</a>
            <a href="#asistente" onClick={(event) => goTo(event, 'asistente')}>Asistente IA</a>
            <a href="#mapa" onClick={(event) => goTo(event, 'mapa')}>Mapa de reclamos</a>
          </div>
          <div className="footer-col">
            <strong>Nosotros</strong>
            <a href="#nosotros" onClick={(event) => goTo(event, 'nosotros')}>Equipo</a>
            <a href="#servicios" onClick={(event) => goTo(event, 'servicios')}>Servicios</a>
            <a href="#contacto" onClick={(event) => goTo(event, 'contacto')}>Contacto</a>
          </div>
          <div className="footer-contact-col">
            <strong>Contacto</strong>
            <div className="footer-contact-item"><span>Teléfono</span><a href="tel:+5492212267836">+54 9 221 226-7836</a></div>
            <div className="footer-contact-item"><span>Email</span><a href="mailto:info@urbanvoice.com">info@urbanvoice.com</a></div>
            <div className="footer-contact-item"><span>Ubicación</span><p>Buenos Aires, Argentina</p></div>
            <div className="footer-contact-item"><span>Horario de atención</span><p>Lun – Vie: 9:00 a 18:00 hs</p></div>
          </div>
          <div className="footer-social">
            <div className="footer-social-icons"><i>in</i><i>𝕏</i><i>▶</i></div>
            <p>Una comunidad más informada, <br />una ciudad con más futuro.</p>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-bottom-inner">
            <span>© 2026 UrbanVoice. Todos los derechos reservados.</span>
            <div className="footer-legal">
              <span>Términos y condiciones</span>
              <span>Política de privacidad</span>
              <span>Desarrollado en colaboración con <a href="https://kairosgroup.ar/" target="_blank" rel="noopener noreferrer">KairosGroup</a></span>
            </div>
          </div>
        </div>
      </footer>

      <a className="whatsapp-float" href={WHATSAPP} target="_blank" rel="noopener noreferrer" aria-label="Contactanos por WhatsApp">
        <svg viewBox="0 0 32 32" fill="#fff" xmlns="http://www.w3.org/2000/svg">
          <path d="M16.01 3C9.38 3 4 8.37 4 15c0 2.23.62 4.32 1.7 6.11L4 29l8.1-2.13A11.9 11.9 0 0 0 16.01 27C22.63 27 28 21.63 28 15S22.63 3 16.01 3Zm0 21.7c-1.98 0-3.83-.55-5.4-1.5l-.39-.23-4.8 1.26 1.28-4.68-.25-.4A9.6 9.6 0 0 1 6.3 15c0-5.35 4.36-9.7 9.71-9.7 5.34 0 9.7 4.35 9.7 9.7 0 5.35-4.36 9.7-9.7 9.7Zm5.32-7.27c-.29-.15-1.72-.85-1.99-.94-.27-.1-.46-.15-.66.14-.19.29-.76.94-.93 1.13-.17.2-.34.22-.63.08-.29-.15-1.22-.45-2.32-1.43-.86-.76-1.44-1.7-1.6-1.99-.17-.29-.02-.44.13-.59.13-.13.29-.34.44-.5.15-.17.19-.29.29-.48.1-.2.05-.37-.02-.51-.08-.15-.66-1.59-.9-2.18-.24-.57-.48-.5-.66-.5-.17-.01-.36-.01-.56-.01-.19 0-.51.07-.78.36-.27.29-1.02 1-1.02 2.43 0 1.43 1.05 2.82 1.19 3.01.15.2 2.06 3.14 4.99 4.4.7.3 1.24.48 1.67.61.7.22 1.34.19 1.84.12.56-.08 1.72-.7 1.96-1.38.24-.68.24-1.26.17-1.38-.07-.12-.26-.19-.55-.34Z" />
        </svg>
      </a>
    </div>
  );
}

export default UrbanVoiceLanding;
