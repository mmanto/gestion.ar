import { QRCodeSVG } from 'qrcode.react';
import { Modal } from '../common/Modal';

interface ChatQrModalProps {
  open: boolean;
  onClose: () => void;
  userFullName: string;
  chatUrl: string | null;
}

export const ChatQrModal = ({ open, onClose, userFullName, chatUrl }: ChatQrModalProps) => {
  return (
    <Modal open={open} onClose={onClose} title="Código QR del chat">
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-base font-medium text-gray-900">{userFullName}</p>
        {chatUrl ? (
          <div className="p-3 bg-white border border-gray-200 rounded-xl">
            <QRCodeSVG value={chatUrl} size={220} />
          </div>
        ) : (
          <div className="w-[220px] h-[220px] flex items-center justify-center text-sm text-gray-400">
            No se pudo generar el código QR.
          </div>
        )}
        <p className="text-sm text-gray-600">Escaneá el código para abrir el chat.</p>
      </div>
    </Modal>
  );
};

export default ChatQrModal;
