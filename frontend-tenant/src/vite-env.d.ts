/// <reference types="vite/client" />

/** Build-time target inyectado por vite.config.ts (define.__TARGET__). */
declare const __TARGET__: 'staff' | 'client'

/** Build-time flag inyectado por vite.config.ts. true cuando CAPACITOR_BUILD=1. */
declare const __CAPACITOR__: boolean
