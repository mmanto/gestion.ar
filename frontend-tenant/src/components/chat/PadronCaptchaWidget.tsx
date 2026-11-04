import { useState } from 'react';
import type { PadronCaptchaWidgetData } from '../../types/chat.types';

/**
 * Verificador del padrón electoral (ver backend/app/modules/padron_ext.py).
 *
 * El backend manda la imagen como data URL y espera el código como un mensaje
 * de texto normal: el interceptor del módulo lo toma en el turno siguiente.
 * "Otro verificador" manda el texto de refresco que el interceptor reconoce.
 */
export function PadronCaptchaWidget({
  widget,
  onSelectOption,
}: {
  widget: PadronCaptchaWidgetData;
  onSelectOption: (value: string) => void;
}) {
  const [codigo, setCodigo] = useState('');

  const enviar = () => {
    const valor = codigo.trim();
    if (!valor) return;
    onSelectOption(valor);
    setCodigo('');
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-300 bg-white p-3">
      <img
        src={widget.image}
        alt="Código verificador del padrón"
        className="w-full rounded-lg border border-gray-200 bg-white"
      />
      <input
        type="text"
        value={codigo}
        onChange={(event) => setCodigo(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') enviar();
        }}
        placeholder="Escribí el código de la imagen"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={enviar}
          disabled={!codigo.trim()}
          className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          Consultar
        </button>
        <button
          type="button"
          onClick={() => onSelectOption('otro captcha')}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Otro verificador
        </button>
      </div>
    </div>
  );
}
