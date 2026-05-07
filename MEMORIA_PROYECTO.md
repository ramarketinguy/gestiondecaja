# 🟣 Violet POS & ERP - Memoria del Proyecto

Este documento registra los hitos, decisiones técnicas y aprendizajes clave en la optimización del sistema Violet.

---

## 🚀 Actualizaciones Recientes (Mayo 2026)

### 1. Estabilización de Autenticación y Seguridad
- **Fix "Auth session missing":** Se implementó una verificación estricta en `pos.js` que detecta si hay una sesión activa al cargar la aplicación. Si no existe, redirige automáticamente a `index.html`. Esto evita errores al intentar realizar acciones administrativas sin estar logueado.
- **Detección Dinámica de URL (`SITE_URL`):** Se actualizó `config.js` para detectar automáticamente si el sistema corre en `localhost` o en producción. Esto asegura que los correos de confirmación y recuperación de contraseña tengan enlaces válidos.
- **Unificación de Signup:** Se corrigió la lógica de creación de cuenta en `index.html` para incluir el parámetro `emailRedirectTo`, resolviendo problemas de entrega de correos de activación.

### 2. Panel de Administración y Gestión de Usuarios
- **Sección "Mi Cuenta":** Añadida capacidad para ver información del usuario autenticado y cambiar la contraseña directamente desde el dashboard.
- **Invitaciones al Sistema:** Implementación de un sistema de invitaciones mediante **Magic Links** (OTP) en la sección "Accesos al Sistema". Esto permite agregar nuevos colaboradores enviando un enlace de acceso seguro a su email.
- **Modales UI:** Se crearon modales personalizados con validaciones en tiempo real para cambios de credenciales e invitaciones, mejorando la experiencia de administración.

### 3. Optimización del Repositorio
- **Limpieza de Archivos:** Se eliminaron archivos de documentación obsoletos (`.md`) y recursos pesados (`Caja paty.mp4`, 89MB) para profesionalizar el repositorio y mejorar los tiempos de clonación/despliegue.
- **Estructura Modular:** Se mantuvo la separación de responsabilidades entre `config.js`, `auth.js`, `state.js` y `pos.js`.

---

## 💡 Aprendizajes y Notas Técnicas

### Gestión de Supabase (Plan Free)
- **Pausado de Proyectos:** Los proyectos gratuitos de Supabase se pausan tras una semana de inactividad. Esto causa errores de red (`Failed to fetch`) en el frontend. **Solución:** Reanudar el proyecto desde el dashboard de Supabase.
- **Límite SMTP:** El plan gratuito limita el envío a **3 correos por hora**. Si los correos no llegan tras varios intentos, es necesario esperar 60 minutos o confirmar el usuario manualmente desde el dashboard de Supabase (Authentication > Users > Confirm User).

### Configuración de Redirecciones
- Los navegadores bloquean redirecciones desde protocolos `file://` por seguridad. Es imperativo ejecutar el proyecto mediante un servidor local (ej. `http-server` o el servidor de Python) para que la autenticación funcione correctamente.

### Seguridad (RLS)
- Es fundamental mantener activas las **Row Level Security (RLS)** en Supabase. Cada tabla (`clients`, `transactions`, etc.) debe tener una política que filtre por `auth.uid() = user_id` para garantizar la privacidad entre distintos usuarios del sistema.

---
**Última actualización:** 7 de Mayo, 2026
