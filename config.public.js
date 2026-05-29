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
  window.DASHBOARD_PUBLIC_YEARS = [2023, 2024, 2025, 2026];
}

// Reemplaza este valor por tu API key publica restringida a tu dominio de GitHub Pages.
if (typeof GOOGLE_API_KEY === 'undefined') {
  window.GOOGLE_API_KEY = '';
}
