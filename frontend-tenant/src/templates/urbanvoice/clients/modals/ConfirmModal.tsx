import type { ReactNode } from 'react';
import { Modal } from '../../ui/Modal';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({ open, title, description, confirmLabel, danger, children, onConfirm, onClose }: ConfirmModalProps) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      {description ? <p className="muted">{description}</p> : null}
      {children}
      <div className="m-a">
        <button type="button" className={`btn ${danger ? 'danger-f' : 'pri'}`} onClick={onConfirm}>{confirmLabel}</button>
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}
