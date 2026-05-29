// Configuracion para GitHub Pages.
// Usa una API key restringida por dominio y comparte el spreadsheet como lector.
if (typeof SPREADSHEET_ID === 'undefined') {
  window.SPREADSHEET_ID = '1WJYfJ1emctjLRk9dUnnItzwQ0E4EqM54u5_d3-4LLKU';
}

if (typeof DASHBOARD_SPREADSHEET_ID === 'undefined') {
  window.DASHBOARD_SPREADSHEET_ID = '1_6yJxJ21ldI7aaKN5D38Qx0XTB-4bbyZS2iN6rP1LCI';
}

// Si no usas API key ni service account en GitHub Pages, define aqui los anios
// disponibles para que la app sepa que hojas pa01_YYYY intentar cargar.
if (typeof DASHBOARD_PUBLIC_YEARS === 'undefined') {
  window.DASHBOARD_PUBLIC_YEARS = [2022, 2023, 2024, 2025, 2026];
}

// API key pública de Google Sheets (opcional pero NECESARIA para leer hojas ocultas).
// Sin esta clave, el dashboard usa el endpoint gviz que no accede a hojas ocultas,
// lo que hace que la pestaña "Segmentación" no muestre datos.
//
// Cómo obtener una API key gratuita:
//   1. Ve a https://console.cloud.google.com/
//   2. Crea un proyecto (o usa uno existente)
//   3. Habilita "Google Sheets API"
//   4. En "Credenciales" crea una API Key
//   5. Restringe la clave a: Sitios web HTTP → tu dominio de GitHub Pages (ej. https://usuario.github.io/*)
//   6. Pega la clave abajo reemplazando el string vacío
if (typeof GOOGLE_API_KEY === 'undefined') {
  window.GOOGLE_API_KEY = '';  // ← pega aquí tu API key, ej: 'AIzaSy...'
}
