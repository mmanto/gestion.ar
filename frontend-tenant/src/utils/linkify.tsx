import { Fragment, type ReactNode } from 'react';

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** Signos que suelen quedar pegados al final de una URL escrita en prosa
 * (punto final, coma, cierre de paréntesis) y no son parte del enlace. */
const TRAILING_RE = /[.,;:)\]]+$/;

/**
 * Convierte las URLs de un texto en enlaces clickeables, dejando el resto
 * igual. El bot escribe enlaces oficiales (normas, boletín, sitio del
 * municipio) dentro de la respuesta, y hasta ahora salían como texto plano.
 */
export function linkify(text: string): ReactNode {
  const parts = text.split(URL_RE);

  // Sin URLs, split devuelve un único elemento: se devuelve el texto tal cual.
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    // Las posiciones impares son el grupo capturado (URLs).
    if (i % 2 === 0) return part;

    const trailing = part.match(TRAILING_RE)?.[0] ?? '';
    const url = trailing ? part.slice(0, -trailing.length) : part;

    return (
      <Fragment key={i}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline break-all"
        >
          {url}
        </a>
        {trailing}
      </Fragment>
    );
  });
}
