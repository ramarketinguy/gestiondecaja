# Cómo probar el proyecto Violet

## Opción 1: Netlify (Recomendado - HTTPS automático)

1. Ve a https://app.netlify.com/drop
2. Arrastra toda la carpeta `Programa de gestión de caja` al área de subir
3. Netlify te dará un enlace HTTPS (ej: https://tu-sitio.netlify.app)
4. Abre ese enlace - ¡Funcionará con Supabase porque es HTTPS!

## Opción 2: Servidor local HTTPS (más complejo)

### Requisitos:
- Node.js instalado
- mkcert instalado (https://github.com/FiloSottile/mkcert)

### Pasos:
1. Instalar mkcert y crear certificado local:
   ```
   mkcert -install
   mkcert localhost
   ```

2. Instalar servidor HTTP con soporte HTTPS:
   ```
   npm install -g http-server
   ```

3. Ejecutar servidor HTTPS desde la carpeta del proyecto:
   ```
   http-server -S -C localhost+2.pem -K localhost+2-key.pem
   ```

4. Abrir en navegador: https://localhost:8080

## Notas importantes:
- Supabase requiere HTTPS para funcionar correctamente
- El servidor HTTP simple de Python (`python -m http.server`) NO funciona porque es HTTP
- Si ves errores en la consola del navegador relacionados con Supabase, verifica que estés usando HTTPS
- El usuario de prueba es: Patricia (ver en el HTML)

## Archivo principal:
- `pos.html` - Interfaz principal
- `login.html` - Pantalla de inicio de sesión

## Estructura modular:
El JavaScript está dividido en módulos para mejor mantenimiento:
- `state.js` - Estado centralizado
- `auth.js` - Autenticación
- `supabase-helpers.js` - Funciones helper para Supabase
- `clients.js` - Lógica de clientes
- `pos.js` - Lógica principal del POS
- `pos.dashboard.js` - Widgets del dashboard
- `pos.services.js` - Servicios y empleados
- `pos.config.js` - Configuración del negocio
- `validation.js` - Validaciones
- `config.js` - Configuración de Supabase (URL y key)

## Próximos pasos sugeridos:
1. Probar el flujo completo: login → registrar transacción → ver en dashboard
2. Probar la gestión de clientes
3. Probar la agenda
4. Verificar que los datos se guarden en Supabase (revisar la tabla en el dashboard de Supabase)