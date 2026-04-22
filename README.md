# 🟣 Violet POS & ERP - Documentación Técnica

## 📋 Índice
1. [Inicio Rápido](#inicio-rápido)
2. [Estructura del Proyecto](#estructura-del-proyecto)
3. [Instalación y Setup](#instalación-y-setup)
4. [Autenticación](#autenticación)
5. [Base de Datos](#base-de-datos)
6. [Desarrollo](#desarrollo)
7. [Deployment](#deployment)
8. [Troubleshooting](#troubleshooting)

---

## 🚀 Inicio Rápido

### Requisitos Previos
- **Cuenta Supabase** (gratis en https://supabase.com)
- **Navegador moderno** (Chrome, Firefox, Safari, Edge)
- **Servidor local** (Python, Node.js, o similar)

### Pasos Rápidos
1. Clonar repositorio
2. Crear proyecto en Supabase y copiar credenciales en `config.js`
3. Crear tablas siguiendo `SETUP_SUPABASE.md`
4. Ejecutar servidor local: `python -m http.server 3000`
5. Abrir http://localhost:3000

---

## 🏗️ Estructura del Proyecto

```
Programa de gestión de caja/
├── index.html                    # Login página
├── pos.html                      # Aplicación principal
├── pos.css                       # Estilos
│
├── config.js                     # Credenciales Supabase ⚠️ CRÍTICO
├── state.js                      # Gestor de estado centralizado
├── auth.js                       # Autenticación y sesiones
├── validation.js                 # Validaciones de datos
├── clients.js                    # Servicio de clientes (CRUD)
│
├── MEMORIA_PROYECTO.md           # Historia del proyecto
├── FEEDBACK_PROYECTO.md          # Análisis y mejoras
├── SETUP_SUPABASE.md             # Guía de base de datos
├── README.md                     # Este archivo
│
└── Logo/
    └── Logo Violet SF (1).png    # Branding
```

---

## ⚙️ Instalación y Setup

### Paso 1: Clonar el Proyecto
```bash
git clone <tu-repo>
cd "Programa de gestión de caja"
```

### Paso 2: Crear Proyecto en Supabase
**Ver archivo `SETUP_SUPABASE.md` para instrucciones detalladas**

En resumen:
- Crear proyecto en https://supabase.com
- Copiar URL y Anon Key
- Actualizar `config.js`

### Paso 3: Servidor Local
**Opción A - Python:**
```bash
python -m http.server 3000
```

**Opción B - Node.js:**
```bash
npx http-server -p 3000
```

**Opción C - PHP:**
```bash
php -S localhost:3000
```

### Paso 4: Abrir la App
Ir a: http://localhost:3000

---

## 🔐 Autenticación

### Sistema de Autenticación

Violet usa **Supabase Auth** con múltiples métodos:

#### Método 1: Email + Contraseña
```javascript
// En index.html
await loginWithEmail('user@example.com', 'password123');
```

#### Método 2: Magic Link (Sin Contraseña)
```javascript
// Más seguro
await loginWithMagicLink('user@example.com');
```

#### Método 3: Google OAuth
```javascript
// Requiere configuración en Supabase
await loginWithGoogle();
```

### Proteger Rutas

En `pos.html`, el DOMContentLoaded debe verificar autenticación:

```javascript
document.addEventListener('DOMContentLoaded', async () => {
    // Proteger ruta
    if (!(await initializeAuth())) return;
    
    // Resto de inicialización
    watchAuthChanges();
    await loadDataFromSupabase();
    initDashboard();
    // ...
});
```

### Variables de Autenticación Disponibles

```javascript
// Obtener usuario actual
const user = getCurrentUser();
const email = getCurrentUserEmail();
const userId = getCurrentUserId();

// Verificar si está autenticado
if (isAuthenticated()) {
    // Acciones protegidas
}

// Logout
await logout();
```

---

## 🗄️ Base de Datos

### Tablas Requeridas

**Ver `SETUP_SUPABASE.md` para SQL completo**

Tablas necesarias:
1. `clients` - Base de datos de clientes
2. `transactions` - Ingresos/gastos
3. `appointments` - Citas/turnos
4. `tasks` - Tareas del día
5. `services` - Catálogo de servicios
6. `employees` - Personal
7. `business_config` - Configuración del negocio

### Seguridad - Row Level Security (RLS)

⚠️ **CRÍTICO:** Habilitar RLS en todas las tablas para proteger datos.

Ejemplo:
```sql
-- Los usuarios solo ven sus propios datos
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven sus clientes"
ON clients
FOR SELECT
USING (auth.uid() = user_id);
```

---

## 👨‍💻 Desarrollo

### Módulos Disponibles

#### `state.js` - Gestor de Estado
```javascript
// Establecer valor
setState('ui.currentView', 'caja');

// Obtener valor
const view = getState('ui.currentView');

// Actualizar datos
updateData('clients', [/* array de clientes */]);
```

#### `auth.js` - Autenticación
```javascript
// Login
await loginWithEmail(email, password);

// Logout
await logout();

// Verificar sesión
if (isAuthenticated()) { }
```

#### `validation.js` - Validaciones
```javascript
// Validar cliente
const errors = validateClient(clientData);
if (errors.length > 0) {
    showValidationErrors(errors);
}

// Normalizar datos
const clean = {
    name: normalizeName(name),
    phone: normalizePhone(phone),
    instagram: normalizeInstagram(ig)
};
```

#### `clients.js` - Servicio de Clientes
```javascript
// Crear cliente
const { data, error } = await createClient({
    name: 'Patricia',
    phone: '098123456',
    email: 'patricia@example.com'
});

// Obtener cliente
const client = getClientById(clientId);

// Buscar
const results = searchClients('patricia');

// Actualizar
await updateClient(clientId, { name: 'Pat' });

// Deudas
const clientsWithDebt = getClientsWithDebt();
const summary = getClientsSummary();
```

### Agregar Nuevos Módulos

Crear archivo `services/nombredel-servicio.js`:
```javascript
/**
 * NOMBRE_SERVICIO.JS - Descripción
 */

async function funcionPrincipal(param) {
    try {
        // Lógica
        return { success: true };
    } catch (error) {
        console.error('[NOMBRE]', error);
        return { error: error.message };
    }
}

console.log('[NOMBRE] Módulo cargado');
```

Importar en HTML:
```html
<script src="nombre-del-servicio.js"></script>
```

---

## 🚀 Deployment

### Opción 1: Vercel (Recomendado)
```bash
npm install -g vercel
vercel
```

### Opción 2: Netlify
```bash
npm install -g netlify-cli
netlify deploy
```

### Opción 3: GitHub Pages
```bash
# Subir a rama 'main' en repositorio
git push origin main
# Configurar en Settings > Pages
```

### Checklist Pre-Deployment
- [ ] ¿RLS habilitado en Supabase?
- [ ] ¿Autenticación configurada?
- [ ] ¿Variables de entorno protegidas?
- [ ] ¿Testeado en mobile?
- [ ] ¿Certificado SSL activado?
- [ ] ¿Backup automático de BD?

---

## 🔧 Troubleshooting

### "Supabase no inicializado"
```
❌ Error: Supabase no inicializado
```
**Solución:** Verificar que `config.js` tenga URL y Key correctas
```javascript
// config.js
const SUPABASE_URL = 'https://xxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJxxx...';
```

### "No se puede conectar a BD"
```
❌ Error conectando con Supabase
```
**Solución:** 
- Verificar conexión a internet
- Verificar URL de Supabase
- Verificar que las tablas existan
- Verificar RLS no bloquea lecturas

### "Usuario no autenticado"
```
❌ Error: Acceso denegado
```
**Solución:** 
- Hacer login primero
- Verificar sesión no expiró
- Limpiar cookies/localStorage

### "Errores en consola"
1. Abrir DevTools: `F12`
2. Ir a tab "Console"
3. Copiar errores
4. Buscar en documentación o crear issue

---

## 📞 Soporte

- **Email:** ramarketing.uy@gmail.com
- **Documentación:** Ver archivos `.md` en la carpeta del proyecto
- **Logs:** Abrir DevTools (F12) → Console para ver errores

---

**Última actualización:** 21 de Abril, 2026
**Versión:** 1.0 (MVP)
