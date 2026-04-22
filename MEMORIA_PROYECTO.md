# 💜 Proyecto Violet: Sistema de Gestión Integral (ERP/POS)

Este documento resume la evolución, arquitectura y estado actual del sistema **Violet**, diseñado para la gestión completa de un salón o negocio con enfoque en finanzas, clientes y personal.

## 📝 Resumen del Progreso (12 de Abril, 2026)

Hoy hemos consolidado el **ERP Integral** al completar una migración crítica: la transición completa a una arquitectura backend en la nube utilizando Supabase.

### 1. Migración a Backend Cloud (Supabase) - **¡COMPLETADO!**
- **Arquitectura de Datos Real:** Las operaciones (`saveData` y manipulaciones en memoria) han sido refactorizadas y redirigidas a la API de Supabase (`supabase-js`), brindando conexión asíncrona real para CRUDS (Crear, Leer, Actualizar, Borrar).
- **Protección de Relaciones:** Esquemas relacionales implementados (transacciones, clientes, tareas, turnos y personal) bajo Identificadores Únicos Universales (UUID).
- **Adiós a localStorage:** El sistema es ahora capaz de utilizarse de modo multiplataforma y colaborativo ya que lee información viva desde la base de datos de producción y es inmune a borrados de caché de navegador.

### 2. Innovaciones Previas en Módulos
- **Finanzas y POS:** Registro de pagos parciales, cálculos de deudas y arqueos de caja históricos y por empleada (Efectivo y Transferencias).
- **CRM:** Alertas de deuda pendientes y registro de clientela inteligente para automatizaciones futuras.
- **Gestión Staff y Catálogos:** Gestión de sueldos, ingresos, adelantos, propinas, y un catálogo de servicios fijo o variable.

### 3. Analíticas y UI Premium
- **Dashboard Reorganizado:** 
    1. Gráficas de flujo e ingresos (Top).
    2. Clientas frecuentes y Servicios populares (Middle).
    3. Tabla de Arqueo detallado (Bottom).
- **Estética "Violet Premium":**
    - Modalidad de Menús Custom Selects.
    - Cargas asíncronas con feedback instantáneo y animado (Toasts notifications).

---

## 🏗️ Arquitectura Técnica
- **Frontend:** HTML5, CSS3 (Vanilla), JavaScript (ES6+) asíncrono utilizando Promesas.
- **Iconografía:** Lucide Icons.
- **Gráficos:** Chart.js.
- **Base de Datos / Backend:** **Supabase** (Postgres) conectado en tiempo real (Reemplazo exitoso de Mock DB).
- **Próximo Paso Crítico:** Módulo de agenda y conexión con servidor de WhatsApp Automatizado (Node.js).

## 🚀 Próximos Pasos (Hoja de Ruta)
1. **Módulo Agenda:** Implementar las vistas en el calendario local ligadas a la nueva conexión Supabase, evitando choques horarios.
2. **Módulo Pendientes:** Refinar y estructurar avisos (Cumpleaños, Cobros pendientes).
3. **Notificaciones y Backend Node.js (WhatsApp Bot):** Sistema de recordatorios de turnos (24hs y 2hs antes) y cumpleaños de clientes, desplegado en un servidor Node.js mediante Web-Scraping (`whatsapp-web.js`). Envío segmentado natural (riesgo cero de bloqueo) con el número de WhatsApp Business del local.

### 🤖 Plan Detallado: Automatización de WhatsApp (Fase 2)
Para lograr mensajes de WhatsApp automatizados usando el propio número del local (riesgo cero y costo fijo bajo/nulo):
- **Infraestructura:** Un Servidor Virtual Privado (VPS) mínimo (Ej: Railway, Render) corriendo Node.js 24/7 de forma independiente al hardware del local.
- **Base de Datos:** Ya en Supabase. El servidor consultará la agenda real sincronizada por frontend de caja.
- **Core del Bot:** Librería `whatsapp-web.js` (simulación de WhatsApp Web escaneada directamente desde la app de WhatsApp Business del local).
- **Lógica de Envío (Cron Jobs):** Escaneos automáticos de la base de datos a lo largo del día.
    - *Regla A:* Faltan 24hs para el turno -> Enviar recordatorio de confirmación.
    - *Regla B:* Faltan 2hs para el turno -> Enviar recordatorio final.
    - *Regla C:* Es la mañana de un cumpleaños agendado -> Enviar felicitación.
- **Prevención Anti-Spam (Seguridad):** Solo envíos a clientes existentes. Los mensajes se diluyen a lo largo del día. Se emplean retardos de 10-15s si coinciden mensajes y simulación de estado "escribiendo...".

---

## 🔧 Correcciones Realizadas (19 de Abril, 2026)

### Bugs corregidos en `pos.js`:
1. **`parseInt` en UUID de servicios** — `serviceSelect.onChange` usaba `parseInt()` sobre un UUID, rompiendo el auto-precio de servicios fijos. Corregido a comparación de string.
2. **Comillas faltantes en onclick (UUID)** — `openServiceModal(${s.id})` y `openEmployeeModal(${emp.id})` sin comillas causaban error de sintaxis JS al editar. Corregidos a `openServiceModal('${s.id}')`.
3. **`apt.time` podía ser null en sort** — El `.localeCompare()` tiraba error si un turno no tenía hora. Corregido con `(a.time || '')`.
4. **`openClientModal('null')** — Turnos sin `clientId` llamaban `openClientModal('null')`. Corregido con guard condicional.
5. **Variable `hasTrans` declarada pero nunca usada** — Eliminada.

### Archivos eliminados:
- `test.js` — Versión legacy con localStorage. Código muerto eliminado.

### Pendiente (requiere acción del usuario):
- Crear tablas en Supabase (ver instrucciones en conversación)
- Deshabilitar RLS en las tablas creadas
- Verificar que la `SUPABASE_ANON_KEY` en `config.js` sea válida

## 🔧 Correcciones Realizadas (19 de Abril, 2026 — Sesión 2)

### Bugs corregidos:
1. **`depositAlert` null crash** — `initPOS()` referenciaba `document.getElementById('deposit-alert')` que no existe en el HTML. Causaba TypeError al alternar a modo egreso. Eliminada la variable, se usa solo `discountAlert`.
2. **Crear clienta desde ficha (modal cliente)** — `saveClient()` insertaba un objeto sin `balance` y `debt`, violando posibles restricciones NOT NULL en Supabase. Corregido: el insert de nueva clienta ahora incluye `balance: 0, debt: 0`.
3. **Crear clienta desde POS (modal rápido)** — Ya incluía `balance`/`debt`. El error fue investigado; ahora también muestra el mensaje de error de Supabase en el toast para facilitar diagnóstico.
4. **Servicio no queda seleccionado tras crear rápido** — `updateFormSelects()` reconstruía los custom selects pero nunca llamaba `syncCustomSelect` tras asignar el valor. Corregido: ahora llama `syncCustomSelect('service')` y también `syncCustomSelect('apt-service')` si la agenda está abierta.
5. **Servicio en modal de agenda — campo de texto a dropdown** — `#apt-service` era un `<input type="text">`. Ahora es `<select class="custom-select">` poblado dinámicamente por `updateFormSelects()` con el nombre de los servicios. Incluye botón "+ Nuevo servicio".
6. **`updateFormSelects()` no poblaba agenda** — Corregido: ahora también puebla el `#apt-service` select con `s.name` como valor (porque `appointments.service` es texto).
7. **`saveAppointment()` crash con cliente nuevo** — `createClient()` puede devolver un fallback local (`id: 'cl_...'`) si Supabase falla. Ahora se detecta ese caso y se aborta con toast de error claro en lugar de intentar insertar un appointment con FK inválida.
8. **Instagram `@` por defecto** — `openClientModal()` ahora setea `@` en el campo `cm-ig` para clientas nuevas, y añade `@` al frente para las existentes que no lo tengan.
9. **Mobile CSS — columnas inline no sobreescritas** — Varios `form-grid` con `style="grid-template-columns:1fr 1fr"` inline no respetaban el media query. Corregido con `grid-template-columns: 1fr !important` en `@media (max-width: 900px)`.
10. **Mobile CSS — ficha de clienta** — `profile-header-area` ahora se apila verticalmente en mobile (`flex-direction: column`).
11. **Mobile CSS — charts** — `canvas { max-width: 100% !important }` previene desborde horizontal de gráficos Chart.js.
12. **Mobile CSS — modal footers y settings** — Botones del footer se adaptan al ancho, cards de settings se apilan en 1 columna.

## 🔧 Correcciones Realizadas (19 de Abril, 2026 — Sesión 3)

### Bugs críticos corregidos:
1. **Error "Could not find the 'instagram' column"** — Causa raíz de fallos en cascada (crear clienta desde POS, desde ficha, desde agenda, registro de caja). Solución: helpers `insertClientSafe()` / `updateClientSafe()` que detectan el error de columna faltante en el schema cache de Supabase, limpian ese campo y reintentan automáticamente.
2. **Clientas duplicadas sin aviso** — Nueva función `findDuplicateClient()` con match por nombre normalizado (lowercase + espacios colapsados) o últimos 8 dígitos del teléfono. Integrada en `createClient()` (auto-reusa existente), quick modal (confirm dialog) y modal de ficha completa (confirm + abre ficha existente).
3. **Opción de pago dividido en modo egreso** — Ocultada correctamente al alternar a modo gasto. También resetea el checkbox `is-split-payment`.
4. **Modal no cerraba tras crear clienta** — Ya cerraba en quick modal; ahora verificado en todos los flujos.

### Nuevas funcionalidades:
5. **Agenda autocomplete: "+ Crear nueva clienta"** — Siempre aparece opción al final del dropdown (con el texto escrito en comillas). Al guardar la cita se creará la clienta automáticamente vía `createClient()`.
6. **Configuración de Agenda (nueva card en Settings)** — Horario apertura/cierre, inicio/fin de almuerzo, días cerrados (7 checkboxes clickeables), formato 24h/12h, y gestor de franjas bloqueadas (fecha + rango horario + motivo). Persistencia en `localStorage` bajo `violet_business_config`.
7. **Chequeo de conflictos al agendar** — `checkAppointmentConflicts()` devuelve array de avisos (día cerrado, fuera de horario, durante almuerzo, franja bloqueada). `saveAppointment()` los muestra en un confirm() y permite agendar igualmente. También detecta choque con otra cita exacta a la misma hora.

### Notas de implementación:
- **Split-payment explicado**: crea 2 transacciones separadas con el mismo `client_id`, distintos `amount` y `method`. La primera con el monto principal, la segunda con el diferencial. Ambas se cargan a la misma clienta como un solo evento económico en UI.
- **Formato 12h**: configuración guardada pero el `<input type="time">` nativo usa el locale del navegador (no respeta el toggle manualmente). Requiere migración a selector custom en siguiente iteración.

## 🔧 Correcciones y features (20 de Abril, 2026 — Sesión 4)

### Features nuevas:
1. **Agenda con vistas Día / Mes** — Tabs toggleables. Vista Mes: grid calendario con navegación de meses, badges por día (cantidad de citas + 🎂 cumpleaños), celdas destacadas (hoy, seleccionada, día cerrado). Click en día selecciona y actualiza panel lateral.
2. **Panel lateral resumen** — En vista mes, al lado del calendario: citas del día (horario + clienta + servicio), horarios disponibles (cálculo automático en slots de 30 min restando almuerzo, bloqueos y citas existentes), cumpleaños del día, y deudas pendientes globales (top 5).
3. **Campo de propinas en POS** — Nuevo checkbox "Agregar propina" con monto + método (efectivo/transferencia). Al guardar se crea una transacción separada con detalle "🪙 Propina" y se acumula automáticamente en el campo `tips` de la empleada en Supabase.
4. **Upload de foto vía Supabase Storage** — Bucket `client-photos`, archivo `clients/{clientId}_{timestamp}.{ext}`, guarda `photo_url` en el registro de la clienta (con `updateClientSafe` para tolerar esquema sin la columna). Se muestra foto al abrir ficha; fallback a iniciales si no hay foto.
5. **Bloqueos de horario con scope por empleada** — En config de agenda, al crear un bloqueo se puede elegir "Todo el local" o una empleada específica. `checkAppointmentConflicts()` acepta `employeeId` y solo dispara warnings para bloqueos del scope correcto (los de local siempre aplican, los específicos solo si la cita es de esa empleada).
6. **Selector "Atendida por" en modal de agenda** — Nuevo dropdown con empleadas; guarda `employee_id` en el appointment (con retry-on-missing-column). Permite aplicar bloqueos individuales de la empleada correctamente.

### Requisitos manuales en Supabase (pendientes para el usuario):
- Crear bucket **público** llamado `client-photos` en Storage.
- Opcional (recomendado): agregar columnas a tablas existentes:
    - `clients.photo_url` (text)
    - `clients.instagram` (text)
    - `appointments.employee_id` (uuid, FK a employees — o text si preferís simple)
  Los helpers `insertClientSafe`/`updateClientSafe` y el retry inline en `saveAppointment` funcionan sin estas columnas (las omiten si Supabase las rechaza), pero habilitándolas se persisten correctamente.

*Ultima actualización: 20 de Abril, 2026 (Sesión 4) - Antigravity (Advanced Agentic Coding)*

## 🔧 Refactorización UI (21 de Abril, 2026 — Sesión 5)

### Cambio principal: Selectores de hora custom (reemplazo de `<input type="time">`)

**Problema:** Los `<input type="time">` nativos muestran formato 12h o 24h según el sistema operativo/navegador del dispositivo, lo cual causa inconsistencias entre desktop y mobile. El toggle de "Formato 24h/12h" en configuración no tenía efecto real.

**Solución implementada:**
1. **HTML (`pos.html`):** Todos los `<input type="time">` reemplazados por `<select class="custom-select time-select">`:
   - `cfg-open-time`, `cfg-close-time` (horario de negocio)
   - `cfg-lunch-start`, `cfg-lunch-end` (horario de almuerzo)
   - `cfg-block-start`, `cfg-block-end` (franjas bloqueadas)
   - `apt-time` (hora de cita en modal de agendar)

2. **JS (`pos.js`):** Nueva función `populateTimeSelects()`:
   - Genera opciones cada 15 minutos (00:00 a 23:45 = 96 opciones).
   - Lee `getBusinessConfig().timeFormat` para renderizar en 24h (`14:30`) o 12h (`02:30 PM`).
   - Se ejecuta en `DOMContentLoaded` antes de `initCustomSelects()`.
   - Se re-ejecuta al cambiar el formato de hora en configuración.
   - Preserva valores existentes al regenerar.

3. **CSS (`pos.css`):** Nuevas reglas `.time-select-wrapper`:
   - `max-height: 220px` + `overflow-y: auto` para el dropdown (evita que las 96 opciones desborden la pantalla).
   - Scrollbar estilizado (thin, color violet-500).
   - Padding compacto y `font-variant-numeric: tabular-nums` para alineación.

4. **Integración con Custom Selects:** `initCustomSelects()` ahora agrega clase `time-select-wrapper` a los wrappers de selects con `.time-select`, habilitando el CSS de scroll.

5. **Sincronización en Settings:** `initBusinessConfigUI()` ahora llama `syncCustomSelect()` para cada selector de hora tras cargar los valores guardados.

### Archivos modificados:
- `pos.html` — 7 inputs reemplazados por selects
- `pos.js` — Nueva función `populateTimeSelects()`, wrapper class en `initCustomSelects()`, sync en `initBusinessConfigUI()`, listener de cambio de formato
- `pos.css` — Bloque `.time-select-wrapper` con scroll y estilos compactos

### Próximos pasos:
1. **Modularización de `pos.js`** — Dividir el archivo (3200+ líneas) en módulos independientes
2. **Bot de WhatsApp** — Servidor Node.js para recordatorios automáticos

*Ultima actualización: 21 de Abril, 2026 (Sesión 5) - Antigravity (Advanced Agentic Coding)*

## 🔧 Refactorización Estado Unificado (22 de Abril, 2026 — Sesión 6)

### Problema Original
- `pos.js` definía su propio `db = { transactions: [], ... }`
- `state.js` tenía `state.data = { transactions: [], ... }` como copiar diferente
- `clients.js` leía de `state.data.clients` mientras `pos.js` escribía en `db`
- Funciones duplicadas: `getUserId()` (pos.js) y `getCurrentUserId()` (auth.js, clients.js)

### Solución Implementada:

1. **State.js como fuente única de verdad:**
   - `db` definido directamente en `state.js` como variable global
   - `state.data` es un alias a `db`
   - Funciones utilitarias (`getUserId`, `getCurrentUserId`, `getCurrentUser`, `isAuthenticated`) definidas en `state.js`

2. **pos.js simplificado:**
   - Removida la variable local `db`
   - Ahora usa `db` desde `state.js`
   - `loadDataFromSupabase()` sincroniza `state.data = db` tras cargar

3. **clients.js actualizado:**
   - Ahora usa `db.clients` directamente (no `state.data`)
   - Usa `getUserId()` de `state.js`

4. **supabase-helpers.js (NUEVO):**
   - Helper genérico para Supabase
   - `insertClientSafe()`, `updateClientSafe()`, `findDuplicateClient()`
   - `insertTransactionSafe()`, `insertAppointmentSafe()`
   - Compartido entre todos los módulos

5. **Orden de scripts en pos.html:**
   - `config.js` → `state.js` → `validation.js` → `auth.js` → `supabase-helpers.js` → `clients.js` → `pos.js`

### Archivos Modificados/Creados:
- `state.js` — `db` como variable global + funciones unificadas
- `pos.js` — Removido `db` local, usa `db` desde state.js
- `clients.js` — Usa `db` desde state.js
- `supabase-helpers.js` — NUEVO archivo con helpers compartido
- `pos.html` — Orden de scripts actualizado
- `MEMORIA_PROYECTO.md` — Este registro

---

## 🔧 Fix Navegación y Carga (22 de Abril, 2026 — Sesión 8)

### Problema Original
- La app no cargaba sin conexión a Supabase
- Navigación no funcionaba

### Solución Implementada:

1. **Función violetInit() de emergencia**
   - Se ejecuta siempre aunque Supabase falle
   - Timeout de 1.5s para forzar inicio
   - showToast de emergencia si no existe

2. **Inicialización robusta**
   - Ya no redirige a login forzadamente
   - Funciona sin datos de Supabase

3. **Módulos extraídos**
   - `pos.dashboard.js` - Dashboard y widgets
   - `pos.services.js` - Configuración y servicios

### Para probar:
1. Abrir pos.html directamente en navegador
2. Debería mostrar UI aunque no haya datos

*Ultima actualización: 22 de Abril, 2026 (Sesión 8) - Antigravity*

### Pendiente (Roadmap):
- Dividir `pos.js` en módulos menores
- Mover `business_config` a Supabase
- Limpiar CSS `!important` (justificados: sobrescriben estilos inline en media queries)

### Sobre los !important del CSS
Los `!important` en el CSS cumplen un propósito específico:
- Sobrescribir estilos `inline` del HTML cuando el viewport es mobile
- Ejemplo: `<div style="grid-template-columns: 1fr 1fr">` en desktop necesita `1fr` en mobile
- Alternativa: usar clases CSS en lugar de estilos inline (refactorización mayor)

Los !important fuera de media queries son utilities legítima:
- `.custom-select { display: none !important; }` - hide selects native
- `.hidden { display: none !important; }` - utility class
- `.badge { background: transparent !important; }` - badge style

---

## 🔧 Fix Login y Navegación (22 de Abril, 2026 — Sesión 7)

### Problemas corregidos:

1. **Orden de scripts en index.html**
   - Faltaban imports necesarios para funciones
   - Corregido: config → state → validation → supabase-helpers → auth

2. **Signup - mensajes claros**
   - Agregado warning sobre confirmación de email
   - Mejor manejo de errores

3. **Botón cerrar sesión**
   - Se conectó el evento `btn-close-register` en pos.js
   - Ahora funciona correctamente

4. **Funciones redundantes index.html**
   - Agregadas funciones `redirectToDashboard` y `resetState`

### Nota importante - Email de confirmación:
- Por defecto Supabase requiere confirmar email
- Para desactivar: Authentication → Providers → Email → "Confirm email" OFF
- Esto hace el flujo más rápido para testing

### Archivos Modificados:
- `index.html` - orden scripts, funciones adicionales, UI signup
- `pos.js` - evento btn-close-register

---

## Sesión 9: Auditoría Final Pre-Deploy — 22 de Abril, 2026

### Objetivo:
Auditoría de estabilidad previo al deploy a producción. Se encontraron y corrigieron **4 bugs críticos** que bloqueaban funcionalidad core.

### Bugs Críticos Corregidos:

1. **🔴 Agenda completamente vacía (campo mapping roto)**
   - **Causa:** `loadDataFromSupabase` mapeaba `a.appointment_date` → `date` y `a.appointment_time` → `time`, pero las columnas reales de Supabase son `apt_date` y `apt_time`.
   - **Efecto:** `renderAgendaSidePanel`, `renderAgendaMonth` y `renderAgenda` filtraban por `a.date` que era siempre `undefined`. Ninguna cita aparecía en la agenda.
   - **Fix:** Corregido el transform: `date: a.apt_date`, `time: a.apt_time`.

2. **🔴 renderAgenda crasheaba con `ReferenceError: slots is not defined`**
   - **Causa:** La función referenciaba una variable `slots` que era local a `renderAgendaSidePanel`. Al intentar usar `slots[slotIndex].appendChild(eventEl)`, el JS se detenía.
   - **Fix:** Reescritura completa de `renderAgenda` a un layout basado en tarjetas (card-based timeline) sin dependencia de elementos DOM de slots.

3. **🟡 Código huérfano causaba error de sintaxis silencioso**
   - **Causa:** Un bloque de ~50 líneas (L2827-2876) de un refactor anterior quedó fuera de cualquier función (`} else {` suelto).
   - **Efecto:** Potencial SyntaxError dependiendo del motor JS; en mejor caso, código muerto.
   - **Fix:** Eliminado el bloque completo (era duplicado de lógica ya existente en `renderClientHistory`).

4. **🟡 Fechas de transacciones truncadas perdían hora**
   - **Causa:** El transform de transacciones hacía `t.transaction_date.split('T')[0]`, descartando la hora.
   - **Efecto:** La tabla de actividad diaria siempre mostraba `00:00` como hora. El agrupamiento por fecha/hora para pagos mixtos no funcionaba correctamente.
   - **Fix:** Se mantiene el ISO completo en `date`. Todo el código downstream ya usaba `new Date(t.date)` o `.substring(0,10)`, por lo que es retrocompatible.

### Validación de Compatibilidad:
- `updateStats()` — usa `new Date(t.date).toLocaleDateString()` ✅
- `renderTransactionsTable()` — usa `new Date(t.date).toLocaleDateString()` ✅
- `renderEmployeeCashTable()` — usa `t.date.substring(0,10)` ✅
- `updateCharts()` — usa `t.date.substring(0,10)` ✅
- `renderClientHistory()` — usa `t.date.split('T')[0]` ✅
- Overlap detection (agenda) — usa `a.apt_date`/`a.apt_time` directamente ✅

### Archivos Modificados:
- `pos.js` — 4 correcciones en loadDataFromSupabase, renderAgenda, orphan code removal

*Ultima actualización: 22 de Abril, 2026 (Sesión 9) - Antigravity*
