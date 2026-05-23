interface ChatHeaderProps {
  botName: string;
  isConnected: boolean;
}

export function ChatHeader({ isConnected }: ChatHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-indigo-600 text-white shadow-md">
      <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0">
        <img src="/img/logo_vertical_ius.svg" alt="gestion.ar" className="w-7 h-7" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Asistente</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}
          />
          <span className="text-xs text-white/75">
            {isConnected ? 'Conectado' : 'Desconectado'}
          </span>
        </div>
      </div>
    </div>
  );
}
