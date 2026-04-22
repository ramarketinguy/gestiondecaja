// config.js - Configuración de Supabase
// Aquí inicializamos el cliente de Supabase para toda la aplicación

const SUPABASE_URL = 'https://oksdgumhmgmbfnalzrzj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XILwEe_dKEnWvUF19rh02g_MkpXdr0d';

// Creamos la instancia de Supabase (se requiere cargar la librería previamente vía CDN)
const lib = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
window.supabaseClient = lib ? lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const supabaseClient = window.supabaseClient; 

if (!window.supabaseClient) {
    console.error("No se pudo cargar Supabase. Asegúrate de que el script de CDN esté incluido en el HTML.");
}
