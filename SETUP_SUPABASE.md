# 🗄️ SETUP SUPABASE - Guía Completa

## 📋 Índice
1. [Crear Proyecto](#crear-proyecto)
2. [Obtener Credenciales](#obtener-credenciales)
3. [Crear Tablas](#crear-tablas)
4. [Configurar Autenticación](#configurar-autenticación)
5. [Habilitar Row Level Security (RLS)](#habilitar-row-level-security-rls)
6. [Verificar Conexión](#verificar-conexión)

---

## 🔧 Crear Proyecto

### Paso 1: Registrarse en Supabase
1. Ir a https://supabase.com
2. Click en "Start Your Project"
3. Registrarse con GitHub o Email
4. Crear organización (o usar existente)

### Paso 2: Crear Nuevo Proyecto
1. Click en "New Project"
2. Llenar campos:
   - **Name:** `Violet POS`
   - **Database Password:** Contraseña fuerte (¡GUARDAR!)
   - **Region:** `South America (São Paulo)` o más cercana
   - **Plan:** Free (está bien para MVP)
3. Click "Create new project"
4. **Esperar 2-3 minutos** mientras se inicializa

---

## 🔑 Obtener Credenciales

### Paso 1: Copiar URL y Keys
1. Ir a **Settings** → **API**
2. Copiar:
   - **Project URL:** `https://xxxxx.supabase.co`
   - **Anon (public):** `eyJxxx...`

### Paso 2: Actualizar config.js
```javascript
// config.js
const SUPABASE_URL = 'https://xxxxx.supabase.co';  // Tu URL
const SUPABASE_ANON_KEY = 'eyJxxx...';             // Tu Anon Key
```

⚠️ **IMPORTANTE:** Nunca compartir estas credenciales en repositorios públicos

---

## 📊 Crear Tablas

### Paso 1: Acceder a SQL Editor
1. En Supabase dashboard, ir a **SQL Editor**
2. Click en "New Query"

### Paso 2: Crear Tablas - Copia y Pega Este SQL

```sql
-- ========================================
-- TABLA: clients (Clientes)
-- ========================================
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    instagram VARCHAR(50),
    birthday DATE,
    address TEXT,
    notes TEXT,
    balance NUMERIC(10, 2) DEFAULT 0,
    debt NUMERIC(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email)
);

-- ========================================
-- TABLA: services (Servicios)
-- ========================================
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    price_type VARCHAR(20) CHECK (price_type IN ('fixed', 'variable')),
    price NUMERIC(10, 2),
    duration INT, -- en minutos
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: employees (Personal)
-- ========================================
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    join_date DATE,
    pay_day INT DEFAULT 15, -- día del mes
    tips NUMERIC(10, 2) DEFAULT 0,
    advances NUMERIC(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: transactions (Ingresos/Gastos)
-- ========================================
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    client_name VARCHAR(100),
    transaction_date DATE NOT NULL,
    is_income BOOLEAN NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    method VARCHAR(20) CHECK (method IN ('cash', 'transfer', 'check')),
    employee VARCHAR(100),
    detail TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: appointments (Citas/Turnos)
-- ========================================
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    client_name VARCHAR(100) NOT NULL,
    apt_date DATE NOT NULL,
    apt_time TIME,
    service VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: tasks (Tareas del Día)
-- ========================================
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: business_config (Configuración)
-- ========================================
CREATE TABLE business_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    open_time TIME DEFAULT '09:00',
    close_time TIME DEFAULT '20:00',
    lunch_start TIME,
    lunch_end TIME,
    closed_days INT[] DEFAULT '{0}', -- 0=Dom, 1=Lun, etc.
    time_format VARCHAR(10) DEFAULT '24h',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- ÍNDICES para Rendimiento
-- ========================================
CREATE INDEX idx_clients_user ON clients(user_id);
CREATE INDEX idx_clients_name ON clients(name);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_appointments_user ON appointments(user_id);
CREATE INDEX idx_appointments_date ON appointments(apt_date);
CREATE INDEX idx_tasks_user ON tasks(user_id);

-- ========================================
-- Comentarios
-- ========================================
COMMENT ON TABLE clients IS 'Base de datos de clientas del salón';
COMMENT ON TABLE transactions IS 'Registro de ingresos y gastos';
COMMENT ON TABLE appointments IS 'Citas y turnos agendados';
COMMENT ON TABLE tasks IS 'Tareas y recordatorios diarios';
```

### Paso 3: Ejecutar SQL
1. Click en el botón **▶ Run** (esquina inferior derecha)
2. Esperar confirmación de "Success"

✅ **¡Tablas creadas!**

---

## 🔐 Configurar Autenticación

### Paso 1: Habilitar Email + Contraseña
1. Ir a **Authentication** → **Providers**
2. Click en **Email**
3. Verificar que esté habilitado (toggle ON)
4. **NO** cambiar "Confirm email" por ahora

### Paso 2: Habilitar Google OAuth (Opcional)
1. Click en **Google**
2. Copiar **Client ID** y **Client Secret**
3. Ir a Google Cloud Console (https://console.cloud.google.com)
4. Crear credenciales OAuth
5. Pegar en Supabase
6. Toggle ON

### Paso 3: Configurar Emails
1. Ir a **Authentication** → **Email Templates**
2. Verificar que los templates estén OK (dejar valores por defecto está bien)

---

## 🔒 Habilitar Row Level Security (RLS)

⚠️ **CRÍTICO:** Esto protege los datos de cada usuario

### Paso 1: Habilitar RLS en Tablas
En **SQL Editor**, copia y pega:

```sql
-- ========================================
-- HABILITAR ROW LEVEL SECURITY (RLS)
-- ========================================

-- Habilitar RLS en todas las tablas
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_config ENABLE ROW LEVEL SECURITY;

-- ========================================
-- POLÍTICAS: Cada usuario ve solo sus datos
-- ========================================

-- Política para Clientes
CREATE POLICY "Usuarios ven sus clientes"
ON clients
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Usuarios crean sus clientes"
ON clients
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios editan sus clientes"
ON clients
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios eliminan sus clientes"
ON clients
FOR DELETE
USING (auth.uid() = user_id);

-- Política para Transacciones
CREATE POLICY "Usuarios ven sus transacciones"
ON transactions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Usuarios crean transacciones"
ON transactions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios editan transacciones"
ON transactions
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios eliminan transacciones"
ON transactions
FOR DELETE
USING (auth.uid() = user_id);

-- Política para Citas
CREATE POLICY "Usuarios ven sus citas"
ON appointments
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Usuarios crean citas"
ON appointments
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios editan citas"
ON appointments
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios eliminan citas"
ON appointments
FOR DELETE
USING (auth.uid() = user_id);

-- Política para Tareas
CREATE POLICY "Usuarios ven sus tareas"
ON tasks
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Usuarios crean tareas"
ON tasks
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios editan tareas"
ON tasks
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios eliminan tareas"
ON tasks
FOR DELETE
USING (auth.uid() = user_id);

-- Política para Servicios
CREATE POLICY "Usuarios ven sus servicios"
ON services
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Usuarios crean servicios"
ON services
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios editan servicios"
ON services
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios eliminan servicios"
ON services
FOR DELETE
USING (auth.uid() = user_id);

-- Política para Empleadas
CREATE POLICY "Usuarios ven sus empleadas"
ON employees
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Usuarios crean empleadas"
ON employees
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios editan empleadas"
ON employees
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios eliminan empleadas"
ON employees
FOR DELETE
USING (auth.uid() = user_id);

-- Política para Configuración del Negocio
CREATE POLICY "Usuarios ven su configuración"
ON business_config
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Usuarios crean configuración"
ON business_config
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios editan su configuración"
ON business_config
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios eliminan su configuración"
ON business_config
FOR DELETE
USING (auth.uid() = user_id);
```

Click en **▶ Run**

✅ **¡RLS configurado!**

---

## ✔️ Verificar Conexión

### Paso 1: Abrir DevTools
1. Abrir la aplicación Violet en http://localhost:3000
2. Presionar **F12** para abrir DevTools
3. Ir a tab **Console**

### Paso 2: Verificar Supabase
Debería ver en la consola:
```
[AUTH] Módulo cargado correctamente
[STATE] Módulo cargado correctamente
[VALIDATION] Módulo cargado correctamente
```

### Paso 3: Intentar Crear Usuario
1. Hacer login
2. Ver en la console si dice "Sesión activa"
3. Si ves errores, copiar y pegar en Troubleshooting

---

## 🆘 Troubleshooting Supabase

### Error: "Could not find the 'X' column"
```
PostgreSQL Error: Could not find the 'instagram' column of 'clients'
```
**Solución:**
- La tabla no se creó correctamente
- Eliminar tabla: `DROP TABLE clients;`
- Volver a crear siguiendo los pasos arriba

### Error: "403 Forbidden"
```
Error: User is not authorized to access this
```
**Solución:**
- RLS está bloqueando acceso
- Verificar que user_id coincida
- Ejecutar políticas RLS nuevamente

### Error: "Connection timeout"
```
Error: connection timeout
```
**Solución:**
- Internet desconectada
- URL de Supabase incorrecta
- Verificar en config.js

---

## 📞 Siguiente Paso

Una vez completado:
1. ✅ Proyecto Supabase creado
2. ✅ Tablas creadas
3. ✅ RLS habilitado
4. ✅ config.js actualizado

**Volver a la documentación de `README.md`** para continuar con desarrollo.

---

**Última actualización:** 21 de Abril, 2026
