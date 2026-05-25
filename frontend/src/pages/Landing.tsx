import React from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { Button } from '../components/common/Button';

const WA_LINK = 'https://wa.me/525561483164';

const WaIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

const CheckIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export const Landing: React.FC = () => {
  const planFeatures = [
    'Agente IA con RAG',
    '3 canales (Webchat, WPA, Telegram)',
    'Hasta 3,000 conversaciones/mes',
    'Bandeja unificada',
    'Calificación automática de prospectos',
    'Entrenamiento con documentos',
    'Soporte prioritario',
    'API Access',
  ];

  const features = [
    {
      title: 'Entrenado con tu negocio',
      desc: 'Sube documentos, FAQs y manuales. El agente aprende y responde con tu propia información.',
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
    },
    {
      title: 'Disponible 24 / 7',
      desc: 'Tu negocio responde en segundos, cualquier día y horario, sin que necesites estar presente.',
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: 'Bandeja unificada',
      desc: 'Webchat, WPA y Telegram en un solo panel. Nada se pierde, todo en orden.',
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      ),
    },
    {
      title: 'Calificación de prospectos',
      desc: 'El agente evalúa y clasifica a cada cliente antes de que llegue a tu equipo de ventas.',
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      title: 'Transferencia a humano',
      desc: 'Cuando el cliente lo necesita, el agente pasa la conversación a tu equipo sin perder el contexto.',
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      title: 'Métricas y seguimiento',
      desc: 'Volumen de conversaciones, tiempo de respuesta y tasas de conversión en tiempo real.',
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
  ];

  const industries = [
    'Restaurantes', 'Inmobiliarias', 'Clínicas', 'E-commerce',
    'Consultorios', 'Educación', 'Servicios profesionales',
    'Turismo', 'Seguros', 'Automotriz', 'Retail',
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />

      {/* Botón flotante WhatsApp */}
      <a
        href={WA_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110"
        aria-label="Contactar por WhatsApp"
      >
        <WaIcon className="w-7 h-7 text-white" />
      </a>

      {/* ── 1. Hero ── */}
      <section className="relative min-h-screen flex flex-col justify-center px-4 sm:px-6 lg:px-8 overflow-hidden">

        <div className="absolute inset-0" style={{ backgroundColor: '#2A3B4D' }} />

        <div className="absolute inset-0" style={{
          background: 'linear-gradient(180deg, rgba(42,59,77,0.5) 0%, rgba(42,59,77,0.2) 40%, rgba(42,59,77,0.7) 100%)',
        }} />

        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '30px 30px',
        }} />

        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 18% 65%, rgba(75,131,120,0.15) 0%, transparent 52%), radial-gradient(ellipse at 82% 18%, rgba(197,165,90,0.08) 0%, transparent 45%)',
        }} />

        <div className="relative max-w-7xl mx-auto w-full py-28">
          <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">

            {/* Texto */}
            <div className="flex-1 max-w-xl">
              <span className="text-label block mb-7" style={{ color: '#C5A55A' }}>
                Atención al cliente con IA
              </span>
              <h1 className="text-h1 text-white mb-7">
                Tu negocio{' '}
                <span style={{ color: '#2793b4', fontStyle: 'italic' }}>disponible 24/7</span>{' '}
                donde están tus clientes
              </h1>
              <p className="text-body mb-10 max-w-lg" style={{ color: 'rgba(255,255,255,0.62)' }}>
                Un agente inteligente entrenado con la información de tu negocio que atiende, filtra y califica clientes automáticamente vía Webchat, WPA y Telegram.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <a href={WA_LINK} target="_blank" rel="noopener noreferrer">
                  <Button variant="primary" size="lg">Agenda tu Demo</Button>
                </a>
                <a href="#como-funciona">
                  <button className="text-cta inline-flex items-center justify-center rounded-lg transition-all duration-200 px-6 py-4 border text-white hover:bg-white/10" style={{ borderColor: 'rgba(255,255,255,0.22)' }}>
                    Ver cómo funciona
                  </button>
                </a>
              </div>
            </div>

            {/* Chat mockup */}
            <div className="relative flex-1 flex items-center justify-center w-full max-w-sm lg:max-w-none">
              <div className="absolute w-72 h-72 rounded-full pointer-events-none blur-3xl opacity-20" style={{ background: '#2793b4' }} />
              <svg viewBox="0 0 380 560" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative w-full max-w-xs lg:max-w-sm h-auto drop-shadow-2xl">
                <rect x="10" y="10" width="360" height="540" rx="28" fill="white" stroke="#e5e7eb" strokeWidth="1.5"/>
                <rect x="10" y="10" width="360" height="72" rx="28" fill="#2793b4"/>
                <rect x="10" y="54" width="360" height="28" fill="#2793b4"/>
                <circle cx="52" cy="46" r="20" fill="#1e6f8f"/>
                <text x="52" y="52" textAnchor="middle" fontFamily="sans-serif" fontSize="16" fill="white" fontWeight="bold">A</text>
                <text x="80" y="40" fontFamily="sans-serif" fontSize="13" fontWeight="bold" fill="white">Asistente Virtual</text>
                <text x="80" y="57" fontFamily="sans-serif" fontSize="10" fill="white" fillOpacity="0.8">en línea</text>
                <circle cx="350" cy="46" r="6" fill="#37c88e"/>
                <rect x="10" y="82" width="360" height="468" fill="#F0F4F8"/>
                <rect x="28" y="104" width="240" height="72" rx="12" fill="white"/>
                <polygon points="28,156 12,162 28,162" fill="white"/>
                <text x="44" y="122" fontFamily="sans-serif" fontSize="11" fill="#1a1a1a" fontWeight="600">¡Hola! Soy el asistente virtual.</text>
                <text x="44" y="138" fontFamily="sans-serif" fontSize="11" fill="#555">¿En qué te puedo ayudar hoy?</text>
                <text x="44" y="166" fontFamily="sans-serif" fontSize="9" fill="#999">10:14</text>
                <rect x="112" y="196" width="240" height="52" rx="12" fill="#D1EEFB"/>
                <polygon points="352,230 368,234 352,238" fill="#D1EEFB"/>
                <text x="126" y="214" fontFamily="sans-serif" fontSize="11" fill="#1a1a1a">¿Tienen disponibilidad para</text>
                <text x="126" y="230" fontFamily="sans-serif" fontSize="11" fill="#1a1a1a">este fin de semana?</text>
                <text x="300" y="240" fontFamily="sans-serif" fontSize="9" fill="#999">10:15</text>
                <path d="M318 236 l3 3 5-5" stroke="#2793b4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M321 236 l3 3 5-5" stroke="#2793b4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="28" y="268" width="270" height="92" rx="12" fill="white"/>
                <polygon points="28,336 12,342 28,342" fill="white"/>
                <text x="44" y="287" fontFamily="sans-serif" fontSize="11" fill="#1a1a1a" fontWeight="600">¡Claro que sí!</text>
                <text x="44" y="303" fontFamily="sans-serif" fontSize="11" fill="#555">Tenemos horarios disponibles</text>
                <text x="44" y="319" fontFamily="sans-serif" fontSize="11" fill="#555">el sábado de 9am a 2pm.</text>
                <text x="44" y="335" fontFamily="sans-serif" fontSize="11" fill="#2793b4" fontWeight="600">¿Agendo una cita para ti? 👋</text>
                <text x="44" y="352" fontFamily="sans-serif" fontSize="9" fill="#999">10:15</text>
                <rect x="28" y="376" width="72" height="34" rx="17" fill="white"/>
                <polygon points="28,394 12,400 28,400" fill="white"/>
                <circle cx="48" cy="393" r="4.5" fill="#999" fillOpacity="0.4"/>
                <circle cx="64" cy="393" r="4.5" fill="#999" fillOpacity="0.65"/>
                <circle cx="80" cy="393" r="4.5" fill="#999" fillOpacity="0.9"/>
                <rect x="18" y="528" width="344" height="14" rx="7" fill="#F0F0F0"/>
                <rect x="18" y="520" width="344" height="22" rx="11" fill="#F0F0F0"/>
                <text x="36" y="534" fontFamily="sans-serif" fontSize="10.5" fill="#aaa">Escribe un mensaje...</text>
                <circle cx="346" cy="531" r="12" fill="#2793b4"/>
                <path d="M340 531 L350 526 L350 536 Z" fill="white"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none" style={{ opacity: 0.35 }}>
          <span className="text-label text-white">scroll</span>
          <svg className="w-4 h-4 text-white animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* ── 2. Pain points ── */}
      <section className="py-28 lg:py-36 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#EDF2FA' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-h2 text-gray-900 mb-6">
              ¿Te suena familiar?
            </h2>
            <p className="text-body text-gray-500 max-w-2xl mx-auto">
              Estos son los problemas más comunes que enfrentan los negocios hoy
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: 'Clientes sin respuesta',
                desc: 'Mensajes fuera del horario laboral que quedan sin contestar y se pierden como oportunidades.',
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
              },
              {
                title: 'Preguntas repetitivas',
                desc: 'Tu equipo pierde horas respondiendo las mismas consultas de siempre en lugar de vender.',
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ),
              },
              {
                title: 'Ventas perdidas',
                desc: 'Un cliente interesado no recibe respuesta rápida y se va con la competencia.',
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                ),
              },
            ].map((item) => (
              <div key={item.title} className="rounded-3xl p-10 bg-white shadow-sm">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6" style={{ backgroundColor: '#D6E4F8' }}>
                  <span style={{ color: '#1a3a6e' }}>{item.icon}</span>
                </div>
                <h3 className="text-h3 text-gray-900 mb-3">{item.title}</h3>
                <p className="text-body-small text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. Cómo funciona ── */}
      <section id="como-funciona" className="py-28 lg:py-36 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-20">
            <span className="text-label block mb-5" style={{ color: '#2793b4' }}>
              Proceso
            </span>
            <h2 className="text-h2 text-gray-900">
              En tres pasos, listo
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            <div className="hidden md:block absolute top-10 left-1/3 right-1/3 h-px" style={{ backgroundColor: '#D6E4F8' }} />

            {[
              {
                num: '01',
                title: 'Entrenás',
                desc: 'Subís documentos, preguntas frecuentes e información de tu negocio. El agente absorbe todo ese conocimiento.',
              },
              {
                num: '02',
                title: 'Activás',
                desc: 'El agente se conecta a tus canales — Webchat, WPA o Telegram — y empieza a responder de inmediato.',
              },
              {
                num: '03',
                title: 'Crecés',
                desc: 'Clientes atendidos 24/7, prospectos calificados automáticamente y tu equipo enfocado en cerrar ventas.',
              },
            ].map((step) => (
              <div key={step.num} className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-light mb-8 z-10" style={{ backgroundColor: '#0D1B38', fontFamily: 'var(--font-editorial)', fontSize: '1.6rem', letterSpacing: '0.02em' }}>
                  {step.num}
                </div>
                <h3 className="text-h3 text-gray-900 mb-4">{step.title}</h3>
                <p className="text-body-small text-gray-500 max-w-xs">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. Canales ── */}
      <section id="canales" className="py-28 lg:py-36 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#EDF2FA' }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
            <div className="flex-1 max-w-lg">
              <span className="text-label block mb-6" style={{ color: '#2793b4' }}>
                Canales
              </span>
              <h2 className="text-h2 text-gray-900 mb-6">
                Donde ya están tus clientes
              </h2>
              <p className="text-body text-gray-600 max-w-md">
                No le pidas a tus clientes que descarguen una app nueva. El agente se integra directamente con las plataformas que ya usan todos los días.
              </p>
            </div>

            <div className="flex-1 grid grid-cols-1 gap-6 w-full max-w-sm lg:max-w-none">
              {[
                {
                  name: 'WPA',
                  desc: 'Mantené a tus clientes siempre conectados con tu negocio mediante mensajería instantánea.',
                  bgColor: '#DCFCE7',
                  iconColor: '#16A34A',
                  badge: 'Principal',
                  icon: (
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  ),
                },
                {
                  name: 'Telegram',
                  desc: 'Ideal para audiencias tech y comunidades activas.',
                  bgColor: '#DBEAFE',
                  iconColor: '#2563EB',
                  badge: null,
                  icon: (
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                    </svg>
                  ),
                },
                {
                  name: 'Webchat',
                  desc: 'Un widget embebido en tu sitio web. Captura y atiende visitantes en tiempo real, sin que descarguen nada.',
                  bgColor: '#EEF8FC',
                  iconColor: '#2793b4',
                  badge: null,
                  icon: (
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  ),
                },
              ].map((channel) => (
                <div key={channel.name} className="flex items-start gap-5 rounded-3xl p-8 bg-white shadow-sm">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: channel.bgColor, color: channel.iconColor }}>
                    {channel.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-h3 text-gray-900">{channel.name}</h3>
                      {channel.badge && (
                        <span className="text-cta px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#0D1B38', fontSize: '10px' }}>
                          {channel.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-body-small text-gray-500">{channel.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Features ── */}
      <section className="py-28 lg:py-36 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <span className="text-label block mb-5" style={{ color: '#2793b4' }}>
              Funcionalidades
            </span>
            <h2 className="text-h2 text-gray-900">
              Todo lo que necesitás para crecer
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f) => (
              <div key={f.title} className="rounded-3xl p-10 border border-gray-100 hover:shadow-md transition-shadow">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6" style={{ backgroundColor: '#EEF8FC', color: '#2793b4' }}>
                  {f.icon}
                </div>
                <h3 className="text-h3 text-gray-900 mb-3">{f.title}</h3>
                <p className="text-body-small text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. Antes / Después ── */}
      <section className="py-28 lg:py-36 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#EDF2FA' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-h2 text-gray-900 mb-6">
              Una inversión que se paga sola
            </h2>
            <p className="text-body text-gray-500 max-w-2xl mx-auto">
              Con un solo cliente adicional al mes, el agente cubre completamente su costo.{' '}
              <strong className="text-gray-700">Todo lo demás es rentabilidad.</strong>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Sin el agente */}
            <div className="rounded-3xl p-10 bg-white shadow-sm">
              <p className="text-label text-gray-400 mb-8">Sin el agente</p>
              <ul className="space-y-5">
                {[
                  'Clientes sin respuesta fuera de horario',
                  'Equipo ocupado con consultas repetitivas',
                  'Prospectos sin calificar llegan a tu equipo',
                  'Más de 10 horas semanales perdidas',
                  'Conversaciones dispersas en distintos canales',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-4 text-body-small text-gray-500">
                    <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <XIcon className="w-3.5 h-3.5 text-gray-400" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Con el agente */}
            <div className="rounded-3xl p-10 shadow-sm" style={{ backgroundColor: '#D6E4F8' }}>
              <p className="text-label text-gray-600 mb-8">Con el agente</p>
              <ul className="space-y-5">
                {[
                  'Respuestas automáticas en segundos, 24/7',
                  'Equipo enfocado en cerrar ventas',
                  'Solo prospectos calificados llegan a vos',
                  'Más del 70% de ahorro en tiempo operativo',
                  'Todo unificado en un solo panel',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-4 text-body-small text-gray-700">
                    <span className="w-6 h-6 rounded-full bg-white/70 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckIcon className="w-3.5 h-3.5 text-gray-700" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. Industrias ── */}
      <section className="py-14 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-label text-gray-400 mb-8">
            Funciona para cualquier industria
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {industries.map((industry) => (
              <span
                key={industry}
                className="text-body-small px-5 py-2.5 rounded-full text-gray-700"
                style={{ backgroundColor: '#EDF2FA' }}
              >
                {industry}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── 8. Pricing ── */}
      <section id="costo" className="py-28 lg:py-36 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#EDF2FA' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-label block mb-5" style={{ color: '#2793b4' }}>
              Planes
            </span>
            <h2 className="text-h2 text-gray-900">
              Empezá a convertir más clientes hoy
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Plan Mensual */}
            <div className="rounded-3xl p-10 bg-white shadow-sm">
              <p className="text-label text-gray-400 mb-6">Plan Mensual</p>
              <p className="text-h2 text-gray-900 mb-1">
                $999
                <span className="text-body text-gray-400 ml-2">MXN / mes</span>
              </p>
              <ul className="mt-8 space-y-4 mb-10">
                {planFeatures.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-body-small text-gray-600">
                    <CheckIcon className="w-4 h-4 flex-shrink-0" style={{ color: '#2793b4' }} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/login">
                <Button variant="primary" size="lg" fullWidth>Contratar Ahora</Button>
              </Link>
            </div>

            {/* Plan Anual */}
            <div className="rounded-3xl p-10 bg-white shadow-sm relative overflow-hidden">
              <div className="absolute top-5 right-5 text-cta px-3 py-1.5 rounded-full text-white" style={{ backgroundColor: '#37c88e', fontSize: '11px' }}>
                Ahorrá 2 meses
              </div>
              <p className="text-label text-gray-400 mb-6">Plan Anual</p>
              <p className="text-h2 text-gray-900 mb-1">
                $10,000
                <span className="text-body text-gray-400 ml-2">MXN / año</span>
              </p>
              <ul className="mt-8 space-y-4 mb-10">
                {planFeatures.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-body-small text-gray-600">
                    <CheckIcon className="w-4 h-4 flex-shrink-0" style={{ color: '#2793b4' }} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/login">
                <Button variant="primary" size="lg" fullWidth>Contratar Ahora</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 9. CTA Final ── */}
      <section className="py-28 lg:py-36 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#0D1B38' }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-h2 text-white mb-6">
            Empezá hoy.
            <br />
            <span style={{ fontStyle: 'italic', color: '#C5A55A' }}>Tu agente, listo en 24 horas.</span>
          </h2>
          <p className="text-body mb-12" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Sin contratos largos. Sin configuraciones complejas. Solo resultados.
          </p>
          <a href={WA_LINK} target="_blank" rel="noopener noreferrer">
            <button className="text-cta inline-flex items-center gap-3 bg-white px-10 py-4 rounded-2xl transition-opacity hover:opacity-90" style={{ color: '#0D1B38' }}>
              <WaIcon className="w-5 h-5 text-green-500" />
              Agenda tu Demo por WhatsApp
            </button>
          </a>
        </div>
      </section>

      <div id="contacto" />
      <Footer />
    </div>
  );
};
