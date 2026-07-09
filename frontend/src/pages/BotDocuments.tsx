import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { EmptyState } from '../components/common/EmptyState';
import { Spinner } from '../components/common/Spinner';
import { Button } from '../components/common/Button';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';
import { useAccentTheme } from '../hooks/useAccentTheme';
import botsService from '../services/bots.service';
import documentsService, { type RAGDocument, type RAGStats } from '../services/documents.service';
import type { Bot } from '../types/bot.types';

const TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF',
  docx: 'Word',
  txt: 'Texto',
};

const TYPE_COLORS: Record<string, string> = {
  pdf: 'bg-red-200 text-red-950',
  docx: 'bg-blue-200 text-blue-950',
  txt: 'bg-gray-200 text-gray-950',
};

const CATEGORIES = ['general', 'productos', 'políticas', 'faq', 'legal', 'otro'];

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const BotDocuments = () => {
  const { accent } = useAccentTheme();
  const { botId } = useParams<{ botId: string }>();
  const [bot, setBot] = useState<Bot | null>(null);
  const [documents, setDocuments] = useState<RAGDocument[]>([]);
  const [stats, setStats] = useState<RAGStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('general');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<RAGDocument | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!botId) return;
    try {
      setLoading(true);
      setError(null);
      const [botData, docs, s] = await Promise.all([
        botsService.getBotById(botId),
        documentsService.list(botId),
        documentsService.getStats(botId),
      ]);
      setBot(botData);
      setDocuments(docs);
      setStats(s);
    } catch {
      setError('No se pudieron cargar los documentos.');
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => { load(); }, [load]);

  const handleFiles = async (files: FileList | null) => {
    if (!botId || !files || files.length === 0) return;
    const file = files[0];

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'docx', 'txt'].includes(ext || '')) {
      setUploadError('Formato no soportado. Usá PDF, DOCX o TXT.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadProgress(0);

    try {
      const result = await documentsService.upload(
        botId,
        file,
        uploadTitle || file.name,
        uploadCategory,
        (pct) => setUploadProgress(pct)
      );
      setUploadSuccess(`"${result.filename}" subido correctamente (${result.chunks_created} fragmentos)`);
      setUploadTitle('');
      await load();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      let msg: string;
      if (typeof detail === 'string') {
        msg = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0] as { msg?: string; loc?: string[] };
        msg = first?.msg || 'Error de validación';
      } else {
        msg = 'Error al subir el archivo.';
      }
      setUploadError(msg);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDelete = async (doc: RAGDocument) => {
    if (!botId) return;
    setDeleting(doc.doc_id);
    setConfirmDelete(null);
    try {
      await documentsService.remove(botId, doc.doc_id);
      await load();
    } catch {
      setError('Error al eliminar el documento.');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24">
          <Spinner />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">

        {/* Breadcrumb */}
        <nav className="mb-4">
          <ol className="flex items-center space-x-2 text-base text-gray-900">
            <li>
              <Link to="/bots" className="hover:underline" style={{ color: accent }}>
                Agentes
              </Link>
            </li>
            <li>/</li>
            <li>
              <Link to={`/bots/${botId}`} className="hover:underline" style={{ color: accent }}>
                {bot?.name || 'Agente'}
              </Link>
            </li>
            <li>/</li>
            <li className="text-gray-900">Documentos</li>
          </ol>
        </nav>

        {/* Header */}
        <PageHeader
          title="Base de conocimiento"
          description="Documentos usados por el RAG de este agente para responder consultas"
          titleClassName="font-light uppercase tracking-[0.08em]"
          descriptionClassName="text-gray-800"
          actions={
            stats ? (
              <div className="hidden sm:flex gap-6 text-center">
                <div>
                  <p className="text-2xl font-normal" style={{ color: accent }}>{documents.length}</p>
                  <p className="text-sm text-gray-900 mt-0.5">documentos</p>
                </div>
                <div className="border-l border-gray-300 pl-6">
                  <p className="text-2xl font-normal text-gray-800">{stats.total_chunks}</p>
                  <p className="text-sm text-gray-900 mt-0.5">fragmentos totales</p>
                </div>
              </div>
            ) : undefined
          }
        />

        <div className="space-y-6">

          {/* Upload zone */}
          <div className="bg-white rounded-lg border border-gray-300 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Subir documento</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Título (opcional)</label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Se usa el nombre del archivo si no se completa"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Categoría</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
                ${isDragging ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary/50 hover:bg-gray-50'}
                ${uploading ? 'pointer-events-none opacity-60' : ''}
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              {uploading ? (
                <div className="space-y-3">
                  <Spinner />
                  <p className="text-base text-gray-800">Procesando... {uploadProgress > 0 && `${uploadProgress}%`}</p>
                  {uploadProgress > 0 && (
                    <div className="w-48 mx-auto bg-gray-200 rounded-full h-1.5">
                      <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <svg className="mx-auto h-10 w-10 text-gray-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-base font-medium text-gray-800">
                    Arrastrá un archivo o <span style={{ color: accent }}>hacé click para seleccionar</span>
                  </p>
                  <p className="text-sm text-gray-800 mt-1">PDF, DOCX, TXT · Sin límite de tamaño</p>
                </>
              )}
            </div>

            {uploadError && <Alert variant="error" className="mt-3">{uploadError}</Alert>}
            {uploadSuccess && <Alert variant="success" className="mt-3">{uploadSuccess}</Alert>}
          </div>

          {/* Documents list */}
          <div>
            <h2 className="text-base font-semibold text-gray-800 mb-3">Documentos cargados</h2>

            {error ? (
              <Alert variant="error">{error}</Alert>
            ) : documents.length === 0 ? (
              <Table>
                <TableBody>
                  <tr>
                    <td>
                      <EmptyState
                        icon={<FileText className="w-8 h-8 text-gray-800" />}
                        title="No hay documentos cargados todavía"
                        titleClassName="text-gray-900 text-xl"
                      />
                    </td>
                  </tr>
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Documento</TableHeaderCell>
                    <TableHeaderCell>Tipo</TableHeaderCell>
                    <TableHeaderCell>Categoría</TableHeaderCell>
                    <TableHeaderCell>Fragmentos</TableHeaderCell>
                    <TableHeaderCell>Fecha</TableHeaderCell>
                    <TableHeaderCell align="right"> </TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.doc_id}>
                      <TableCell>
                        <p className="font-medium text-gray-900 truncate max-w-xs">{doc.title || doc.doc_id}</p>
                        <p className="text-sm text-gray-800 truncate max-w-xs">{doc.doc_id}</p>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-base font-medium ${TYPE_COLORS[doc.type] || 'bg-gray-200 text-gray-900'}`}>
                          {TYPE_LABELS[doc.type] || doc.type || '—'}
                        </span>
                      </TableCell>
                      <TableCell textClassName="text-gray-800" className="capitalize">{doc.category}</TableCell>
                      <TableCell className="font-medium">{doc.chunks_count}</TableCell>
                      <TableCell textClassName="text-gray-900">{formatDate(doc.uploaded_at)}</TableCell>
                      <TableCell align="right">
                        <button
                          onClick={() => setConfirmDelete(doc)}
                          disabled={deleting === doc.doc_id}
                          className="p-1.5 rounded-lg text-gray-700 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                          title="Eliminar documento"
                        >
                          {deleting === doc.doc_id ? (
                            <Spinner size="sm" />
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Eliminar documento</h3>
                <p className="text-sm text-gray-900 mt-0.5">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <p className="text-base text-gray-800 mb-5">
              ¿Eliminar <span className="font-medium">"{confirmDelete.title || confirmDelete.doc_id}"</span>?
              Se borrarán <span className="font-medium">{confirmDelete.chunks_count} fragmentos</span> de la base de conocimiento.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" fullWidth onClick={() => setConfirmDelete(null)}>
                Cancelar
              </Button>
              <Button variant="danger" fullWidth onClick={() => handleDelete(confirmDelete)}>
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default BotDocuments;
