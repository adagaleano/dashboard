// Copia este archivo como config.js y completa los valores reales.
const SPREADSHEET_ID = 'TU_SPREADSHEET_ID';
const DASHBOARD_SPREADSHEET_ID = 'TU_DASHBOARD_SPREADSHEET_ID';

const SERVICE_ACCOUNT_KEY = {
  type: 'service_account',
  project_id: 'TU_PROJECT_ID',
  private_key_id: 'TU_PRIVATE_KEY_ID',
  private_key: '-----BEGIN PRIVATE KEY-----\nTU_PRIVATE_KEY\n-----END PRIVATE KEY-----\n',
  client_email: 'tu-service-account@tu-proyecto.iam.gserviceaccount.com',
  client_id: 'TU_CLIENT_ID',
  token_uri: 'https://oauth2.googleapis.com/token',
  universe_domain: 'googleapis.com'
};

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly';
