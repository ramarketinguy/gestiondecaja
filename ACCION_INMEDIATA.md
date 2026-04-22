# 🎯 PLAN DE ACCIÓN - LO QUE DEBES HACER TÚ

**Tiempo estimado:** 20-30 minutos

---

## 📋 PASO A PASO

### ✅ PASO 1: Crear Proyecto en Supabase (5 minutos)

**QUÉ:** Crear la base de datos en la nube  
**DÓNDE:** https://supabase.com  
**CÓMO:**

1. Ir a https://supabase.com
2. Click en "Start Your Project"
3. Si no tienes cuenta:
   - Click "Sign Up"
   - Registrarse con GitHub (más fácil) o Email
4. Click en "New Project"
5. Llenar:
   - **Name:** `Violet POS`
   - **Database Password:** Algo fuerte como `Violet2024!SecurePass123` ← **GUARDA ESTA CONTRASEÑA EN UN LUGAR SEGURO**
   - **Region:** South America (São Paulo) o tu región más cercana
   - **Plan:** Free está bien
6. Click **"Create new project"**
7. **ESPERAR 2-3 MINUTOS** mientras se inicializa (verás un loading)

✅ **Listo, Supabase creado**

---

### ✅ PASO 2: Copiar Credenciales (3 minutos)

**QUÉ:** Obtener las "llaves" para conectar la app  
**DÓNDE:** Dashboard de Supabase  
**CÓMO:**

1. En el dashboard de Supabase que se acaba de cargar
2. Ir a **Settings** (engranaje) en la esquina inferior izquierda
3. Click en **API**
4. Copiar estos dos valores:

```
Project URL:     https://xxxxx.supabase.co
Anon (public):   eyJxxx...xxxxx
```

(Son líneas largas, cópialas completas)

✅ **Credenciales copiadas**

---

### ✅ PASO 3: Actualizar config.js (2 minutos)

**QUÉ:** Pegar las credenciales en tu proyecto  
**DÓNDE:** Archivo `config.js`  
**CÓMO:**

1. Abrir en VS Code: `config.js`
2. Reemplazar `SUPABASE_URL` y `SUPABASE_ANON_KEY` con lo que copiaste:

```javascript
// config.js
const SUPABASE_URL = 'https://xxxxxx.supabase.co';  // ← Tu URL
const SUPABASE_ANON_KEY = 'eyJxxxx...';              // ← Tu Anon Key

window.supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
```

3. **Guardar archivo** (Ctrl+S)

✅ **Credenciales actualizadas**

---

### ✅ PASO 4: Crear Tablas en BD (5 minutos)

**QUÉ:** Crear la estructura de la base de datos  
**DÓNDE:** En Supabase, en "SQL Editor"  
**CÓMO:**

1. En Supabase dashboard, buscar en la barra izquierda: **SQL Editor**
2. Click en **SQL Editor** (o **New Query**)
3. Copiar TODO el SQL de aquí: `SETUP_SUPABASE.md` (la sección "Crear Tablas")
   - Esto es un bloque de código MUY LARGO (~200 líneas)
4. Pegarla en el editor de Supabase
5. Click en el botón **▶ Run** (abajo a la derecha)
6. Esperar a que diga "Success" ✅

✅ **Tablas creadas**

---

### ✅ PASO 5: Habilitar Row Level Security - RLS (5 minutos)

**QUÉ:** Proteger datos (cada usuario ve solo los suyos)  
**DÓNDE:** En Supabase, SQL Editor nuevamente  
**CÓMO:**

1. SQL Editor → New Query (otra consulta nueva)
2. Copiar TODO el SQL de: `SETUP_SUPABASE.md` (la sección "Habilitar Row Level Security")
   - Esto es otro bloque LARGO (~300 líneas)
3. Pegarla en el editor
4. Click **▶ Run**
5. Esperar "Success" ✅

⚠️ **IMPORTANTE:** Sin esto la app no funcionará en producción

✅ **RLS habilitado**

---

### ✅ PASO 6: Habilitar Autenticación Email (3 minutos)

**QUÉ:** Permitir login con email  
**DÓNDE:** Supabase → Authentication  
**CÓMO:**

1. En Supabase dashboard, ir a **Authentication** (en la barra izquierda)
2. Click en **Providers**
3. Buscar **Email** y verificar que esté **ON** (verde)
4. Eso es todo, los valores por defecto están bien

✅ **Email auth habilitado**

---

## 🧪 PASO 7: Testear Conexión (3 minutos)

**QUÉ:** Verificar que todo funciona  
**DÓNDE:** Localmente en tu computadora  
**CÓMO:**

1. Abrir terminal/PowerShell en la carpeta del proyecto
2. Ejecutar servidor local:
   ```bash
   python -m http.server 3000
   ```
   (O si usas Node: `npx http-server -p 3000`)

3. Abrir navegador: http://localhost:3000
4. Debería cargar la **página de login** (con el logo 🟣 de Violet)
5. Abrir DevTools: Presionar **F12**
6. Ir a tab **Console**
7. Deberías ver mensajes verdes como:
   ```
   [AUTH] Módulo cargado correctamente
   [STATE] Módulo cargado correctamente
   [VALIDATION] Módulo cargado correctamente
   ```

Si ves errores rojo:
- ¿Está correcta la URL y Key en config.js?
- ¿Copiaste bien las credenciales?
- ¿Ejecutaste ambos SQLs?

✅ **Conexión verificada**

---

## ✅ PASO 8: Crear Primera Cuenta de Test (2 minutos)

**QUÉ:** Crear una cuenta para probar  
**DÓNDE:** En la página de login que abriste  
**CÓMO:**

1. En http://localhost:3000, en el tab **"Crear Cuenta"**
2. Llenar:
   - Nombre: `Patricia Test`
   - Email: `patricia.test@example.com`
   - Contraseña: `Test123456`
3. Click **"Crear Cuenta"**
4. Debería ver mensaje verde: "Cuenta creada. Revisa tu email."

✅ **Cuenta creada**

---

## 🎉 LISTO - Paso a Paso Completado

Si todo fue bien, ahora:
- ✅ Supabase configurado
- ✅ Base de datos creada
- ✅ Autenticación funcionando
- ✅ Conexión verificada

---

## 🚨 SI ALGO NO FUNCIONA

### Error: "Supabase no inicializado"
```
❌ Error: No se pudo cargar Supabase
```
**Solución:**
1. Abrir `config.js`
2. Verificar URL y Key son correctas (no falta nada)
3. Guardar
4. Refrescar navegador (F5)

### Error: "Tabla no existe"
```
❌ Error: relation "clients" does not exist
```
**Solución:**
1. Volver a paso 4: Crear Tablas
2. Copiar y ejecutar SQL nuevamente
3. Refrescar navegador

### Error: "403 Forbidden"
```
❌ Error: User is not authorized to access
```
**Solución:**
1. Volver a paso 5: Habilitar RLS
2. Ejecutar SQL nuevamente

### Error: "Email inválido"
Supabase rechaza algunos emails de test. Usar:
- `test@example.com`
- `patricia.test@example.com`
- Tu email real

---

## 📞 PRÓXIMO PASO

Una vez que todo esté funcionando:

1. **Avísame** que terminaste todo ✅
2. Yo te daré los **siguientes pasos** para integrar la autenticación en `pos.html`
3. Después refactorizaré el código `pos.js` en módulos (yo lo hago, es automático)

---

**TIEMPO TOTAL:** ~25 minutos

**¿Preguntas?** Manda screenshot del error en DevTools (F12 → Console)

🚀 **¡Adelante!**
