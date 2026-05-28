// =========================
//  Autenticación con Google Sheets via Service Account
//  Equivalente Python: service_account.Credentials.from_service_account_file()
// =========================

function base64urlEncode(data) {
  let str;
  if (data instanceof ArrayBuffer) {
    str = String.fromCharCode(...new Uint8Array(data));
  } else {
    str = unescape(encodeURIComponent(JSON.stringify(data)));
  }
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function importPrivateKey(pem) {
  const pemContents = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const keyData = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    keyData.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function signJWT(serviceAccountKey, scopes) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now    = Math.floor(Date.now() / 1000);

  const payload = {
    iss:   serviceAccountKey.client_email,
    scope: scopes,
    aud:   serviceAccountKey.token_uri,
    iat:   now,
    exp:   now + 3600
  };

  const cryptoKey    = await importPrivateKey(serviceAccountKey.private_key);
  const signingInput = `${base64urlEncode(header)}.${base64urlEncode(payload)}`;
  const encoder      = new TextEncoder();
  const signature    = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signingInput)
  );

  return `${signingInput}.${base64urlEncode(signature)}`;
}

// Equivalente a: build('sheets', 'v4', credentials=creds)
async function getAccessToken(serviceAccountKey, scopes) {
  const jwt = await signJWT(serviceAccountKey, scopes);

  const response = await fetch(serviceAccountKey.token_uri, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Error de autenticación: ${err.error_description || err.error}`);
  }

  const data = await response.json();
  return data.access_token;
}
