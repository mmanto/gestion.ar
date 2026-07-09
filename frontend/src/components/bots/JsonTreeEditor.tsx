import { useState } from 'react';
import type { JsonObject, JsonPrimitive, JsonValue } from '../../types/ius.types';

type JsonType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

const typeLabels: Record<JsonType, string> = {
  string: 'Texto',
  number: 'Número',
  boolean: 'Sí/No',
  null: 'Nulo',
  object: 'Objeto',
  array: 'Lista',
};

const getType = (value: JsonValue): JsonType => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return t;
  return 'object';
};

const defaultForType = (type: JsonType): JsonValue => {
  switch (type) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'null':
      return null;
    case 'object':
      return {};
    case 'array':
      return [];
  }
};

const TypeSelect = ({ value, onChange }: { value: JsonType; onChange: (t: JsonType) => void }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value as JsonType)}
    className="shrink-0 px-1 py-1 border border-gray-200 rounded text-[11px] bg-white text-gray-600"
  >
    {(Object.keys(typeLabels) as JsonType[]).map((t) => (
      <option key={t} value={t}>
        {typeLabels[t]}
      </option>
    ))}
  </select>
);

const PrimitiveEditor = ({
  value,
  onChange,
}: {
  value: JsonPrimitive;
  onChange: (v: JsonPrimitive) => void;
}) => {
  const type = getType(value);

  if (type === 'null') {
    return <span className="text-xs italic text-gray-400 px-2 py-1 block">null</span>;
  }
  if (type === 'boolean') {
    return (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value === 'true')}
        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (type === 'number') {
    return (
      <input
        type="number"
        value={value as number}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"
      />
    );
  }

  const str = value as string;
  const isLong = str.length > 60 || str.includes('\n');
  if (isLong) {
    return (
      <textarea
        value={str}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.min(10, Math.max(2, str.split('\n').length))}
        className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"
      />
    );
  }
  return (
    <input
      type="text"
      value={str}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"
    />
  );
};

const AddControl = ({
  kind,
  onAdd,
}: {
  kind: 'object' | 'array';
  onAdd: (key: string | null, type: JsonType) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [type, setType] = useState<JsonType>('string');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
      >
        {kind === 'object' ? '+ Agregar campo' : '+ Agregar item'}
      </button>
    );
  }

  const commit = () => {
    if (kind === 'object' && !key.trim()) return;
    onAdd(kind === 'object' ? key.trim() : null, type);
    setKey('');
    setType('string');
    setOpen(false);
  };

  return (
    <div className="mt-1 flex items-center gap-2 flex-wrap bg-gray-50 border border-gray-200 rounded p-2">
      {kind === 'object' && (
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          placeholder="nombre_del_campo"
          autoFocus
          className="px-2 py-1 border border-gray-300 rounded text-sm font-mono"
        />
      )}
      <TypeSelect value={type} onChange={setType} />
      <button
        type="button"
        onClick={commit}
        className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
      >
        Agregar
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
      >
        Cancelar
      </button>
    </div>
  );
};

interface JsonEntryRowProps {
  objectKey: string | null;
  index: number | null;
  value: JsonValue;
  depth: number;
  onChange: (v: JsonValue) => void;
  onRemove: () => void;
  onRenameKey?: (newKey: string) => void;
}

const JsonEntryRow = ({
  objectKey,
  index,
  value,
  depth,
  onChange,
  onRemove,
  onRenameKey,
}: JsonEntryRowProps) => {
  const type = getType(value);
  const isContainer = type === 'object' || type === 'array';
  const [collapsed, setCollapsed] = useState(depth >= 1);
  // objectKey only changes when the parent renames this entry, which swaps the
  // React `key` for this row (see JsonNode) and remounts it — so re-deriving
  // draftKey from objectKey here doesn't need an effect.
  const [draftKey, setDraftKey] = useState(objectKey ?? '');

  const commitKeyRename = () => {
    if (onRenameKey && draftKey.trim() && draftKey !== objectKey) {
      onRenameKey(draftKey.trim());
    } else {
      setDraftKey(objectKey ?? '');
    }
  };

  const childCount = isContainer
    ? type === 'object'
      ? Object.keys(value as JsonObject).length
      : (value as JsonValue[]).length
    : 0;

  return (
    <div className="py-0.5">
      <div className="flex items-start gap-1.5">
        {isContainer ? (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="mt-1 w-4 h-4 shrink-0 flex items-center justify-center text-gray-400 hover:text-gray-700"
            aria-label={collapsed ? 'Expandir' : 'Colapsar'}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className="mt-1 w-4 shrink-0" />
        )}

        {objectKey !== null ? (
          <input
            type="text"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            onBlur={commitKeyRename}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-40 shrink-0 px-1.5 py-1 border border-gray-200 rounded text-xs font-mono font-medium text-gray-700 bg-gray-50"
          />
        ) : (
          <span className="w-10 shrink-0 px-1.5 py-1 text-xs font-mono text-gray-400">[{index}]</span>
        )}

        <span className="mt-1 shrink-0 text-[10px] uppercase tracking-wide text-gray-400 w-12">
          {typeLabels[type]}
        </span>

        <div className="flex-1 min-w-0">
          {isContainer ? (
            collapsed && (
              <span className="text-xs text-gray-400 italic px-2 py-1 block">
                {childCount} {type === 'object'
                  ? childCount === 1 ? 'campo' : 'campos'
                  : childCount === 1 ? 'item' : 'items'}
              </span>
            )
          ) : (
            <PrimitiveEditor value={value as JsonPrimitive} onChange={onChange as (v: JsonPrimitive) => void} />
          )}
        </div>

        <TypeSelect value={type} onChange={(t) => onChange(defaultForType(t))} />

        <button
          type="button"
          onClick={onRemove}
          className="mt-0.5 shrink-0 text-xs text-red-400 hover:text-red-600 px-1"
          title="Eliminar"
        >
          ✕
        </button>
      </div>

      {isContainer && !collapsed && (
        <div className="ml-5 mt-1 border-l border-gray-200 pl-3">
          <JsonNode value={value} onChange={onChange} depth={depth + 1} kind={type as 'object' | 'array'} />
        </div>
      )}
    </div>
  );
};

interface JsonNodeProps {
  value: JsonValue;
  onChange: (v: JsonValue) => void;
  depth: number;
  kind: 'object' | 'array';
}

const JsonNode = ({ value, onChange, depth, kind }: JsonNodeProps) => {
  const entries: [string, JsonValue][] =
    kind === 'object'
      ? Object.entries(value as JsonObject)
      : (value as JsonValue[]).map((v, i) => [String(i), v] as [string, JsonValue]);

  const updateEntry = (key: string, newVal: JsonValue) => {
    if (kind === 'object') {
      onChange({ ...(value as JsonObject), [key]: newVal });
    } else {
      const arr = [...(value as JsonValue[])];
      arr[Number(key)] = newVal;
      onChange(arr);
    }
  };

  const removeEntry = (key: string) => {
    if (kind === 'object') {
      const obj = { ...(value as JsonObject) };
      delete obj[key];
      onChange(obj);
    } else {
      onChange((value as JsonValue[]).filter((_, i) => i !== Number(key)));
    }
  };

  const renameKey = (oldKey: string, newKey: string) => {
    const obj = value as JsonObject;
    if (newKey in obj) return;
    const next: JsonObject = {};
    for (const [k, v] of Object.entries(obj)) {
      next[k === oldKey ? newKey : k] = v;
    }
    onChange(next);
  };

  const addEntry = (key: string | null, newType: JsonType) => {
    if (kind === 'object') {
      if (!key) return;
      const obj = value as JsonObject;
      if (key in obj) return;
      onChange({ ...obj, [key]: defaultForType(newType) });
    } else {
      onChange([...(value as JsonValue[]), defaultForType(newType)]);
    }
  };

  return (
    <div>
      {entries.length === 0 && (
        <p className="text-xs text-gray-400 italic py-1">{kind === 'object' ? 'Sin campos.' : 'Lista vacía.'}</p>
      )}
      {entries.map(([key, childValue]) => (
        <JsonEntryRow
          key={key}
          objectKey={kind === 'object' ? key : null}
          index={kind === 'array' ? Number(key) : null}
          value={childValue}
          depth={depth}
          onChange={(v) => updateEntry(key, v)}
          onRemove={() => removeEntry(key)}
          onRenameKey={kind === 'object' ? (nk) => renameKey(key, nk) : undefined}
        />
      ))}
      <AddControl kind={kind} onAdd={addEntry} />
    </div>
  );
};

interface JsonTreeEditorProps {
  value: JsonObject;
  onChange: (value: JsonObject) => void;
}

export const JsonTreeEditor = ({ value, onChange }: JsonTreeEditorProps) => (
  <div className="text-sm">
    <JsonNode value={value} onChange={(v) => onChange(v as JsonObject)} depth={0} kind="object" />
  </div>
);

export default JsonTreeEditor;
