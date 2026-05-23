import React from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { Button } from '../components/common/Button';

export const Landing: React.FC = () => {
  const planFeatures = [
    'Agente IA con RAG',
    '3 canales (WhatsApp, Telegram, Webchat)',
    'Hasta 3,000 conversaciones/mes',
    'Bandeja unificada',
    'Calificación automática de prospectos',
    'Entrenamiento con documentos',
    'Soporte prioritario',
    'API Access',
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      {/* Botón flotante WhatsApp */}
      <a
        href="https://wa.me/525561483164"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110"
        aria-label="Contactar por WhatsApp"
      >
        <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
      </a>

      {/* Sección Transformación */}
      <section id="que-es-ius" className="py-20 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#F2F1F1' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1">
              <img src="/img/logo_vertical_ius.svg" alt="iUS" className="h-28 sm:h-40 w-auto mb-6 opacity-55 mx-auto" />
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-bold tracking-widest uppercase mb-1" style={{ color: '#25357A' }}>
                IA QUE FILTRA CLIENTES
              </h1>
              <h2 className="text-base sm:text-lg lg:text-xl font-semibold mb-6 uppercase tracking-widest" style={{ color: '#6B80B8' }}>
                ANTES DE QUE LLEGUEN A TI
              </h2>
              <p className="text-base uppercase tracking-wide mb-8" style={{ color: '#25357A' }}>
                iUS analiza cada asunto, clasifica al cliente y{' '}
                <strong>detecta quién sí está listo para pagar asesoría.</strong>
              </p>
              <a href="https://wa.me/525561483164" target="_blank" rel="noopener noreferrer">
                <Button variant="primary" size="lg">Conoce Demo</Button>
              </a>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <svg viewBox="0 0 400 530" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
                {/* Ventana chat */}
                <rect x="20" y="20" width="360" height="490" rx="20" fill="white" stroke="#e5e7eb" strokeWidth="1.5"/>

                {/* Header */}
                <rect x="20" y="20" width="360" height="64" rx="20" fill="#2793b4"/>
                <rect x="20" y="64" width="360" height="20" fill="#2793b4"/>
                {/* Avatar con fondo blanco y logo */}
                <circle cx="58" cy="52" r="22" fill="white"/>
                <image href="/img/logo_vertical_ius.svg" x="36" y="30" width="44" height="44" clipPath="url(#avatarClip)"/>
                <clipPath id="avatarClip"><circle cx="58" cy="52" r="22"/></clipPath>
                {/* Nombre y estado */}
                <text x="88" y="48" fontFamily="sans-serif" fontSize="13" fontWeight="bold" fill="white">iUS</text>
                <text x="88" y="64" fontFamily="sans-serif" fontSize="10" fill="white" fillOpacity="0.75">en línea</text>
                <circle cx="356" cy="52" r="7" fill="#37c88e"/>

                {/* Burbuja bot */}
                <rect x="36" y="100" width="262" height="112" rx="14" fill="#f0f9ff"/>
                <polygon points="36,196 18,204 36,204" fill="#f0f9ff"/>
                <text x="50" y="118" fontFamily="sans-serif" fontSize="11.5" fill="#1e3a5f" fontWeight="600">Hola, soy el asistente iUS</text>
                <text x="50" y="134" fontFamily="sans-serif" fontSize="11.5" fill="#374151">Puedo ayudarte a entender tu</text>
                <text x="50" y="149" fontFamily="sans-serif" fontSize="11.5" fill="#374151">situación laboral y orientarte</text>
                <text x="50" y="164" fontFamily="sans-serif" fontSize="11.5" fill="#374151">para recibir asesoría.</text>
                <text x="50" y="179" fontFamily="sans-serif" fontSize="11.5" fill="#2793b4" fontWeight="600">👉 Cuéntame tu situación laboral</text>
                {/* Timestamp */}
                <text x="264" y="198" fontFamily="sans-serif" fontSize="9" fill="#9ca3af">10:32</text>

                {/* Burbuja usuario */}
                <rect x="102" y="228" width="262" height="68" rx="14" fill="#2793b4"/>
                <polygon points="364,280 382,284 364,288" fill="#2793b4"/>
                <text x="116" y="248" fontFamily="sans-serif" fontSize="11.5" fill="white">Trabajo para el gobierno federal,</text>
                <text x="116" y="264" fontFamily="sans-serif" fontSize="11.5" fill="white">fui notificada de mi despido en</text>
                <text x="116" y="280" fontFamily="sans-serif" fontSize="11.5" fill="white" fillOpacity="0.85">un viaje de trabajo...</text>
                {/* Timestamp + check */}
                <text x="318" y="308" fontFamily="sans-serif" fontSize="9" fill="#9ca3af">10:33</text>
                <path d="M336 303 l3 3 6-6" stroke="#2793b4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M339 303 l3 3 6-6" stroke="#2793b4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>

                {/* Indicador escribiendo */}
                <rect x="36" y="328" width="76" height="34" rx="17" fill="#f0f9ff"/>
                <polygon points="36,348 18,354 36,354" fill="#f0f9ff"/>
                <circle cx="56" cy="345" r="5" fill="#2793b4" fillOpacity="0.35"/>
                <circle cx="74" cy="345" r="5" fill="#2793b4" fillOpacity="0.6"/>
                <circle cx="92" cy="345" r="5" fill="#2793b4" fillOpacity="0.9"/>

                {/* Input bar */}
                <rect x="28" y="460" width="344" height="40" rx="20" fill="#f9fafb" stroke="#e5e7eb" strokeWidth="1.5"/>
                <text x="50" y="485" fontFamily="sans-serif" fontSize="11.5" fill="#9ca3af">Escribe un mensaje...</text>
                <circle cx="354" cy="480" r="13" fill="#2793b4"/>
                <path d="M348 480 L358 475 L358 485 Z" fill="white"/>
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* Hero Section — no está en el PDF, comentado */}
      {/*
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto w-full">
          <div className="text-center">
            <div className="flex justify-center mb-8">
              <img src="/img/logo_vertical_ius.svg" alt="iUS" style={{ width: '500px', height: '400px', marginBottom: '-60px' }} />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6" style={{ color: '#25357A' }}>
              IA QUE FILTRA CLIENTES
            </h1>
            <p className="text-lg text-gray-600 mb-8 max-w-3xl mx-auto">
              Un asistente legal que analiza, clasifica y prepara cada asunto antes de que llegue a ti
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/login">
                <Button variant="primary" size="lg">Acceder al Dashboard</Button>
              </Link>
              <a href="#problema">
                <Button variant="outline" size="lg">Conocer más</Button>
              </a>
            </div>
          </div>
        </div>
      </section>
      */}

      {/* Sección Problema */}
      <section id="problema" className="py-20 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#D2CFE6' }}>
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-normal text-gray-900 mb-12">
            No toda consulta representa una{' '}
            <span className="block font-bold tracking-widest uppercase" style={{ color: '#25357A' }}>oportunidad legal</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            {/* Card 1 — borde derecho en desktop, inferior en mobile */}
            <div className="flex flex-col items-center p-8 border-b md:border-b-0 md:border-r" style={{ borderColor: '#25357A' }}>
              <div className="w-14 h-14 flex items-center justify-center rounded-full mb-5" style={{ backgroundColor: '#D8D6ED' }}>
                <svg className="w-7 h-7" fill="none" stroke="#25357A" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-gray-700 font-medium text-xl">Hay quienes buscan asesoría sin compromiso</p>
            </div>
            {/* Card 2 — borde derecho en desktop, inferior en mobile */}
            <div className="flex flex-col items-center p-8 border-b md:border-b-0 md:border-r" style={{ borderColor: '#25357A' }}>
              <div className="w-14 h-14 flex items-center justify-center rounded-full mb-5" style={{ backgroundColor: '#D8D6ED' }}>
                <svg className="w-7 h-7" fill="none" stroke="#25357A" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-700 font-medium text-xl">Otros clientes no tienen fundamentos suficientes</p>
            </div>
            {/* Card 3 — sin borde */}
            <div className="flex flex-col items-center p-8">
              <div className="w-14 h-14 flex items-center justify-center rounded-full mb-5" style={{ backgroundColor: '#D8D6ED' }}>
                <svg className="w-7 h-7" fill="none" stroke="#25357A" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-gray-700 font-medium text-xl">Y algunos no están dispuestos a invertir en asesoría</p>
            </div>
          </div>
        </div>
      </section>

      {/* Sección iUS Transforma */}
      <section className="py-20 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#F2F1F1' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="flex-1">
              <h2 className="text-2xl sm:text-4xl lg:text-5xl font-normal text-gray-900 mb-6">
                iUS{' '}
                <span className="font-bold" style={{ color: '#25357A' }}>transforma</span>
                {' '}este escenario
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                Antes de que tú interactúes con un prospecto,{' '}
                <strong className="text-gray-900">iUS ya ha evaluado su contexto, su viabilidad y su nivel de compromiso.</strong>
              </p>
              <a href="https://wa.me/525561483164" target="_blank" rel="noopener noreferrer">
                <Button variant="primary" size="lg">Conoce Demo</Button>
              </a>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="w-48 h-48 flex items-center justify-center rounded-3xl" style={{ backgroundColor: '#F2F1F1' }}>
                <svg className="w-28 h-28" fill="none" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                  <rect x="15" y="10" width="58" height="72" rx="6" fill="#D2CFE6" stroke="#25357A" strokeWidth="2"/>
                  <line x1="27" y1="30" x2="61" y2="30" stroke="#25357A" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="27" y1="42" x2="61" y2="42" stroke="#25357A" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="27" y1="54" x2="48" y2="54" stroke="#25357A" strokeWidth="2.5" strokeLinecap="round"/>
                  <circle cx="72" cy="72" r="18" fill="#25357A"/>
                  <path d="M63 72 l6 6 12-12" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sección Cómo Funciona */}
      <section id="ventajas" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center items-center">
            {[
              {
                label: 'escucha',
                desc: 'Recopila información relevante mediante interacción guiada.',
              },
              {
                label: 'analiza',
                desc: 'Evalúa la viabilidad jurídica del asunto.',
              },
              {
                label: 'decide',
                desc: 'Clasifica y prioriza conforme a criterios legales estratégicos.',
              },
            ].map((step) => (
              <div key={step.label} className="flex flex-col items-center px-6 py-3">
                {/* Ícono robot */}
                <svg className="w-14 h-14 mb-4" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="40" cy="40" r="38" fill="#D2CFE6" stroke="#25357A" strokeWidth="2"/>
                  <rect x="22" y="28" width="36" height="28" rx="8" fill="white" stroke="#25357A" strokeWidth="2"/>
                  <circle cx="32" cy="40" r="4" fill="#25357A"/>
                  <circle cx="48" cy="40" r="4" fill="#25357A"/>
                  <line x1="34" y1="50" x2="46" y2="50" stroke="#25357A" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="40" y1="18" x2="40" y2="28" stroke="#25357A" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="40" cy="15" r="3" fill="#25357A"/>
                  <line x1="22" y1="42" x2="14" y2="42" stroke="#25357A" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="58" y1="42" x2="66" y2="42" stroke="#25357A" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-normal text-gray-900 mb-3">
                  iUS <span className="font-bold" style={{ color: '#25357A' }}>{step.label}</span>
                </h3>
                <p className="text-xl text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sección Niveles */}
      <section className="py-20 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#D2CFE6' }}>
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-center mb-2 uppercase tracking-wide" style={{ color: '#25357A' }}>
            Clasificamos a tus clientes en 3 niveles
          </h2>
          <p className="text-center font-semibold uppercase tracking-wide mb-12 text-xl" style={{ color: '#25357A' }}>
            según viabilidad y pago
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                num: '1.',
                tag: 'Viabilidad Alta',
                desc: 'Caso sólido, pruebas en mano y listo para pagar.',
              },
              {
                num: '2.',
                tag: 'Potencial',
                desc: 'Buen caso, pero aún no decide.',
              },
              {
                num: '3.',
                tag: 'Exploración',
                desc: 'Solo pregunta. No va a contratar.',
              },
            ].map((item) => (
              <div key={item.tag} className="rounded-2xl p-8" style={{ backgroundColor: '#EEEDF5' }}>
                <h3 className="text-xl font-bold mb-3 uppercase tracking-wide" style={{ color: '#25357A' }}>{item.num} {item.tag}</h3>
                <p className="text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sección Canales */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
            <div className="flex-1">
              <h2 className="text-2xl sm:text-4xl lg:text-5xl font-normal mb-8" style={{ color: '#1C0B83' }}>
                Integración directa con los canales donde ya se encuentran sus clientes.
              </h2>
              <a href="https://wa.me/525561483164" target="_blank" rel="noopener noreferrer">
                <Button variant="primary" size="lg">Conoce Demo</Button>
              </a>
            </div>
            <div className="flex flex-wrap gap-8 items-center justify-center">
              {/* WhatsApp */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center">
                  <svg className="w-9 h-9 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-700">WhatsApp</span>
              </div>
              {/* Telegram */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center">
                  <svg className="w-9 h-9 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-700">Telegram</span>
              </div>
              {/* Webchat */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center">
                  <svg className="w-9 h-9 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-700">Webchat</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sección Funciones */}
      <section className="py-20 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#F2F1F1' }}>
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-widest text-center uppercase mb-12" style={{ color: '#25357A' }}>
            Funciones potentes para tu negocio
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            {[
              {
                title: 'Captura segura inteligente de datos',
                icon: (
                  <svg className="w-16 h-16 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                ),
              },
              {
                title: 'Expediente automático',
                icon: (
                  <svg className="w-16 h-16 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                ),
              },
              {
                title: 'Síntesis ejecutiva del asunto',
                icon: (
                  <svg className="w-16 h-16 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                ),
              },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl p-8 flex flex-col items-center" style={{ backgroundColor: '#F2F1F1' }}>
                <p className="text-xl text-gray-800 font-semibold mb-4">{f.title}</p>
                <div className="w-32 h-32 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#F2F1F1' }}>
                  {f.icon}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sección Inversión + Antes / Después */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold uppercase tracking-widest mb-4" style={{ color: '#1C0B83' }}>
              Una inversión que se paga sola
            </h2>
            <p className="text-gray-600 text-xl">
              Con un solo asunto adicional al mes, iUS puede cubrir completamente su costo.{' '}
              <strong className="text-gray-900">Todo lo demás es rentabilidad.</strong>
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Antes */}
            <div className="rounded-2xl p-8" style={{ backgroundColor: '#F2F1F1' }}>
              <h3 className="text-lg font-bold text-gray-500 mb-6">Antes de iUS</h3>
              <ul className="space-y-3">
                {[
                  '10 consultas',
                  'Múltiples entrevistas',
                  '1 cliente en duda',
                  'Más de 10 hrs invertidas',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-gray-600">
                    <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* Después */}
            <div className="rounded-2xl p-8" style={{ backgroundColor: '#D2CFE6' }}>
              <h3 className="text-lg font-bold text-gray-700 mb-6">Después con iUS</h3>
              <ul className="space-y-3">
                {[
                  '10 consultas',
                  'De 3 a 4 clientes calificados',
                  'Asuntos listos para avanzar',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-gray-700">
                    <span className="w-5 h-5 rounded-full bg-white/60 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
                <li className="flex items-start gap-3 text-gray-700">
                  <span className="w-5 h-5 rounded-full bg-white/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span>
                    Menos de 3 horas invertidas para calificar un asunto, que representa un{' '}
                    <strong>70% de ahorro en tiempo</strong>
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Sección Precios */}
      <section id="costo" className="py-20 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#D2CFE6' }}>
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-center uppercase tracking-wide mb-10" style={{ color: '#25357A' }}>
            Empieza a convertir más prospectos hoy
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Plan Mensual */}
            <div className="rounded-2xl p-8 bg-white">
              <p className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-2">Plan Mensual</p>
              <p className="text-4xl font-bold text-gray-900 mb-1">$999.00 <span className="text-lg font-normal text-gray-500">MX/mes</span></p>
              <ul className="mt-6 space-y-3 mb-8">
                {planFeatures.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-gray-700 text-sm">
                    <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/login" className="block">
                <Button variant="primary" size="lg" fullWidth>Contratar Ahora</Button>
              </Link>
            </div>

            {/* Plan Anual */}
            <div className="rounded-2xl p-8 bg-white">
              <p className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-2">Plan Anual</p>
              <p className="text-4xl font-bold text-gray-900 mb-1">$10,000.00 <span className="text-lg font-normal text-gray-500">MX/año</span></p>
              <ul className="mt-6 space-y-3 mb-8">
                {planFeatures.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-gray-700 text-sm">
                    <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/login" className="block">
                <Button variant="primary" size="lg" fullWidth>Contratar Ahora</Button>
              </Link>
            </div>
          </div>
          <p className="text-center text-gray-700 mt-10 text-lg sm:text-2xl">
            Enfoca tu tiempo en asuntos con verdadero potencial
          </p>
          <p className="text-center text-gray-700 text-lg sm:text-2xl">
            y en clientes listos para avanzar e invertir.
          </p>
          <p className="text-center font-bold text-gray-700 mt-6 text-lg sm:text-2xl">
            Deja que iUS filtre, analice y prepare. Tú concéntrate en ganar.
          </p>
          <p className="text-center text-2xl sm:text-3xl lg:text-4xl font-bold uppercase tracking-widest mt-10" style={{ color: '#25357A' }}>
            Comienza hoy con iUS
          </p>
          <div className="flex justify-center mt-8">
            <a href="https://wa.me/525561483164" target="_blank" rel="noopener noreferrer">
              <button className="font-bold px-10 py-4 rounded-xl text-lg text-white transition-colors hover:opacity-90" style={{ backgroundColor: '#2793B4' }}>
                Agenda una Demo
              </button>
            </a>
          </div>
        </div>
      </section>

      <div id="contacto" />
      <Footer />
    </div>
  );
};
