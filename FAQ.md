# ❓ FAQ - Preguntas Frecuentes

---

## 🔐 Autenticación y Login

### P: ¿Dónde está la página de login?
**R:** En `index.html`. Cuando abras http://localhost:3000 deberías ver esta página.

### P: ¿Puedo usar Google para login?
**R:** Sí, pero necesita configuración extra en Supabase:
1. Settings → Providers → Google
2. Copiar Client ID y Secret de Google Cloud Console
3. Pegar en Supabase

Por ahora usa Email + Contraseña, es más simple.

### P: ¿Se pueden cambiar las opciones de login?
**R:** Sí, en `auth.js`:
- `loginWithEmail()` → Email + Contraseña
- `loginWithMagicLink()` → Sin contraseña, por email
- `loginWithGoogle()` → Google OAuth

### P: ¿Cómo reseteo una contraseña?
**R:** En index.html → "¿Olvidaste tu contraseña?" → Ingresar email → Supabase envía link de reset

### P: ¿Puedo agregar WhatsApp login?
**R:** No directamente en Supabase, pero sí vía terceros (Twilio, etc.). Para MVP, email es suficiente.

---

## 🗄️ Base de Datos (Supabase)

### P: ¿Dónde creo las tablas?
**R:** En Supabase:
1. Ir a **SQL Editor**
2. Click **New Query**
3. Copiar y pegar SQL de `SETUP_SUPABASE.md`
4. Click **▶ Run**

### P: ¿Qué es RLS?
**R:** Row Level Security. Cada usuario ve solo sus datos. OBLIGATORIO antes de producción.

### P: ¿Puedo editar datos directamente en Supabase?
**R:** Sí, en **Data Editor** → Click en tabla → Editar/Agregar filas. Útil para testing.

### P: ¿Se pierden datos si reseteo Supabase?
**R:** Sí, TODO se elimina. Por eso hacer backup regularmente:
1. Settings → Data Export
2. Download CSV

### P: ¿Cuántos usuarios puedo tener en Free?
**R:** Supabase Free plan: ilimitado. Pero con límites de requests (500K/mes).

### P: ¿Dónde ves los logs de BD?
**R:** En Supabase → Logs → Database Logs. Útil para debugging.

---

## 🔧 Desarrollo y Código

### P: ¿Cómo uso `setState()` y `getState()`?
**R:**
```javascript
// Establecer
setState('ui.currentView', 'caja');

// Obtener
const view = getState('ui.currentView'); // 'caja'

// Datos
setState('data.clients', [cliente1, cliente2]);
const clients = getState('data.clients');
```

### P: ¿Cómo agrego un nuevo módulo?
**R:**
1. Crear `mi-servicio.js`
2. Escribir funciones
3. Terminar con: `console.log('[NOMBRE] Módulo cargado');`
4. Importar en HTML: `<script src="mi-servicio.js"></script>`

### P: ¿Cómo hago console.log?
**R:** Como siempre:
```javascript
console.log('Mensaje');       // Info
console.warn('Advertencia');  // Amarillo
console.error('Error');       // Rojo
```
Ver en DevTools (F12 → Console)

### P: ¿Cómo cargo datos desde Supabase?
**R:** La función `loadDataFromSupabase()` ya existe. Se llama en `pos.html`:
```javascript
await loadDataFromSupabase();
```

### P: ¿Cómo creo un cliente?
**R:** Con `createClient()`:
```javascript
const { data, error } = await createClient({
    name: 'Patricia',
    phone: '098123456',
    email: 'patricia@example.com'
});

if (error) console.error(error);
else console.log('Cliente creado:', data);
```

### P: ¿Cómo valido datos?
**R:** Con funciones de `validation.js`:
```javascript
const errors = validateClient({
    name: 'Pat',
    email: 'pat@example'
});

if (errors.length > 0) {
    errors.forEach(e => console.error(e));
}
```

---

## 🎨 UI y Estilos

### P: ¿Cómo cambio colores?
**R:** En `pos.css`, modifica las variables CSS:
```css
:root {
    --violet-500: #5b3a8a;  ← Cambiar aquí
    --gold-500: #c9a84c;     ← O aquí
}
```

### P: ¿Cómo agrego un botón?
**R:** En HTML:
```html
<button class="btn">Clickeame</button>

<!-- Con ícono Lucide -->
<button class="btn">
    <i data-lucide="plus"></i>
    Agregar
</button>
```

### P: ¿Cómo creo un modal?
**R:** Ya hay ejemplos en `pos.html`. Estructura básica:
```html
<div id="mi-modal" class="modal">
    <div class="modal-content">
        <h2>Título</h2>
        <!-- contenido -->
        <button onclick="closeModal('mi-modal')">Cerrar</button>
    </div>
</div>
```

### P: ¿Responsive design funciona?
**R:** Sí, hay media queries en `pos.css`:
```css
@media (max-width: 900px) {
    /* Mobile styles */
}
```

---

## 🐛 Errores Comunes

### P: "Supabase no inicializado"
**R:**
1. Verifica `config.js` tiene URL y Key
2. La URL debe terminar en `.supabase.co`
3. La Key debe empezar con `eyJ...`
4. Refrescar navegador (F5)

### P: "Módulo no cargado"
**R:**
1. ¿Está el `<script>` en el HTML?
2. ¿El archivo `.js` existe?
3. Ver console (F12 → Console) para errores
4. Sin errores = módulo cargó OK

### P: "Tabla no existe"
**R:**
1. Ejecutaste ambos SQLs (Tablas + RLS)?
2. En Supabase → Table Editor, ¿aparece la tabla?
3. Si no, ejecutar SQL de Tablas nuevamente

### P: "403 Forbidden"
**R:** RLS está bloqueando. Soluciones:
1. Verificar RLS ejecutado (ver SETUP_SUPABASE.md)
2. En SQL Editor, verificar:
   ```sql
   SELECT * FROM information_schema.tables 
   WHERE table_name = 'clients';
   ```
3. Si no aparece, tabla no existe

### P: "Email inválido"
**R:** Usa emails válidos o de test:
- ✅ `test@example.com`
- ✅ `patricia@example.com`
- ✅ Tu email real
- ❌ No: `test@test`, `@example.com`, vacío

### P: "Contraseña muy corta"
**R:** Mínimo 6 caracteres. Usa: `Test123456`

---

## 📱 Mobile y Responsive

### P: ¿Funciona en celular?
**R:** Debería sí, hay CSS responsive. Para testear:
1. DevTools (F12)
2. Click icono móvil (esquina superior izquierda)
3. Seleccionar dispositivo

### P: ¿Funciona offline?
**R:** No por ahora, necesita internet. Supabase está en la nube.

### P: ¿Funciona en tablet?
**R:** Sí, CSS adapta a cualquier pantalla.

---

## 🚀 Deployment

### P: ¿Dónde hosteo la app?
**R:** Opciones gratuitas/baratas:
1. **Vercel** - `vercel deploy` (recomendado)
2. **Netlify** - `netlify deploy`
3. **GitHub Pages** - Push a rama main
4. **Heroku** - Deprecado, no usar

### P: ¿Cómo hago HTTPS?
**R:** En Vercel/Netlify es automático. En servidor propio:
- Let's Encrypt (gratis)
- Nginx/Apache con certificado

### P: ¿Cómo backupeo datos?
**R:** En Supabase:
1. Settings → Data Export
2. Download como CSV
3. Guardar en lugar seguro

---

## 💾 Credenciales y Seguridad

### P: ¿Puedo publicar mis credenciales en GitHub?
**R:** ❌ **NO NUNCA**. Usa `.env`:
```javascript
// .env (no subir a Git)
VITE_SUPABASE_URL=https://...
VITE_SUPABASE_KEY=eyJ...
```

### P: ¿Y si alguien roba mis credenciales?
**R:** En Supabase Settings → API:
1. Revocar la Anon Key vieja
2. Generar nueva
3. Actualizar en config.js
4. Listo

### P: ¿Qué hace la Anon Key?
**R:** Permite operaciones **públicas** (login, crear cuenta). Usa RLS para proteger datos. Es seguro compartir.

### P: ¿Qué es el Service Role Key?
**R:** Clave **administrativa**. ❌ **NUNCA** publiques. Úsala solo en backend.

---

## 📊 Performance

### P: ¿Es lento?
**R:** Si ves lag:
1. Devtools → Network → ¿Hay requests lentos?
2. Devtools → Performance → Grabar y analizar
3. Considerar paginación si muchos datos

### P: ¿Cuántos clientes puedo tener?
**R:** Supabase puede manejar millones. Pero para UX fluida:
- <1000: Sin problemas
- 1000-10000: Agregar paginación
- >10000: Hacer búsqueda indexada

### P: ¿Cómo hago búsqueda rápida?
**R:** En `clients.js` está `searchClients()`. Pero con >10000 registros, hacer:
```javascript
// Búsqueda en BD (más rápida)
const { data } = await supabaseClient
    .from('clients')
    .select('*')
    .ilike('name', `%${query}%`);
```

---

## 🆘 Cuando Nada Funciona

### Paso 1: Revisar Console
1. Abrir DevTools: **F12**
2. Ir a tab **Console**
3. ¿Hay errores rojos?
4. Copiar error completo

### Paso 2: Verificar Config
1. Abrir `config.js`
2. ¿URL y Key son correctas?
3. ¿Sin espacios extra?
4. ¿Sin comillas faltantes?

### Paso 3: Verificar Supabase
1. ¿Proyecto creado en supabase.com?
2. ¿Tablas existen en SQL Editor?
3. ¿RLS habilitado?
4. ¿Email auth ON?

### Paso 4: Resetear Todo
1. Limpiar cache: `Ctrl+Shift+Del` en navegador
2. Cerrar y reabrir DevTools
3. Refrescar página: `F5`
4. Recargar servidor: Matar y reiniciar `http.server`

### Paso 5: Pedir Ayuda
Si nada funciona:
- Screenshot del error (F12 → Console)
- Pasos para reproducir
- Versión de navegador
- Email: ramarketing.uy@gmail.com

---

**Última actualización:** 21 Abril 2026
