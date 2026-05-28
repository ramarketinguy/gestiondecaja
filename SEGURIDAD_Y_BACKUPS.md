# Seguridad y backups - Violet POS

Ultima revision: 2026-05-27

## Estado actual

- La app usa Supabase Auth y una publishable key en frontend. Esto es correcto siempre que no se exponga `service_role` ni claves secretas.
- Las tablas principales tienen RLS por `user_id = auth.uid()` y permisos explicitos para `authenticated`.
- No se deben otorgar permisos a `anon` salvo que una tabla sea realmente publica.
- Los backups no deben guardarse como commits dentro del repositorio, porque contienen datos operativos y datos de clientas.

## Backups

### Backup nativo de Supabase

Supabase genera backups diarios desde la plataforma. Se accede en:

`Supabase Dashboard > Database > Backups`

Notas operativas:

- En Free puede existir backup diario gestionado por Supabase, pero para continuidad real conviene mantener exportaciones externas.
- En Pro se accede a los ultimos 7 dias de backups diarios.
- En Team se accede a 14 dias.
- En Enterprise se accede hasta 30 dias.
- PITR permite restaurar a un punto especifico, pero es un add-on pago.
- Los backups de base de datos no restauran objetos eliminados de Supabase Storage; solo incluyen metadata.

### Backup diario via GitHub Actions

El workflow `.github/workflows/supabase_backup.yml` corre todos los dias a las 03:00 UTC y tambien se puede ejecutar manualmente.

Acceso:

1. Ir a GitHub.
2. Abrir el repositorio.
3. Entrar en `Actions`.
4. Seleccionar `Supabase Daily Backup`.
5. Abrir la ejecucion del dia.
6. Descargar el artifact `violet-supabase-backup-...`.

El artifact queda disponible 30 dias. No se commitea al repositorio.

Secrets requeridos en GitHub:

- Recomendado: `SUPABASE_DB_URL`, usando la connection string de Supabase.
- Alternativa heredada: `SUPABASE_DB_PASSWORD` y `SUPABASE_PROJECT_REF`.

## Checklist antes de produccion

- Activar email confirmation en Supabase Auth si se permite crear cuentas desde la pantalla publica.
- Configurar password policy minima de 10 caracteres en Supabase Auth, no solo en frontend.
- Revisar `Supabase Dashboard > Security Advisor` despues de cada cambio de esquema.
- Revisar `Supabase Dashboard > Database > Backups` y confirmar que existan puntos de restauracion.
- Mantener el bucket de archivos de clientas como privado si se suben fotos o PDFs sensibles.
- Si se usa bucket publico, asumir que todo enlace compartido puede ser visto por terceros.
- No guardar dumps `.sql`, `.tar.gz` ni backups descargados dentro del repositorio.
