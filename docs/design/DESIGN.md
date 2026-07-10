# DESIGN.md — Sistema de diseño

---

## Stack

- **Framework:** React + TypeScript
- **Estilos:** Tailwind CSS 3.x
- **Configuración:** `frontend/tailwind.config.js`

---

## Convenciones

- Solo clases Tailwind: sin CSS modules, sin `style={{}}` inline
- Componentes en `frontend/src/components/`
- Preferir componentes funcionales con TypeScript tipado

---

## Tokens (completar según diseño actual)

Los tokens están definidos en `frontend/tailwind.config.js`. Documentar aquí los colores, tipografías y espaciados del sistema de diseño una vez estabilizados.

---

## Componentes base (pendiente de inventario)

- [ ] Button (variantes: primary, secondary, danger)
- [ ] Input, Textarea, Select
- [ ] Card
- [ ] Badge / Status indicator
- [ ] Modal / Dialog
- [ ] Table con paginación
- [x] Toast / Notification — `frontend/src/context/ToastContext.tsx` + `frontend/src/components/common/ToastContainer.tsx`. Se dispara manualmente con `useToast().showToast()` o automáticamente para cualquier error de API vía el interceptor de `frontend/src/services/api.ts`
- [ ] Sidebar Navigation
- [ ] Chat bubble (inbound / outbound / agent)
