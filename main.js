// =========================
//  Equivalente JavaScript de main.py
//  Punto de entrada principal del dashboard
// =========================

async function main() {
  try {
    console.log('Autenticando con Google Sheets...');

    // Equivalente a:
    // creds = service_account.Credentials.from_service_account_file(KEY, scopes=SCOPES)
    // service = build('sheets', 'v4', credentials=creds)
    const accessToken = await getAccessToken(SERVICE_ACCOUNT_KEY, SCOPES);
    console.log('Autenticación exitosa.');

    // Equivalente a: loader = RecaudacionLoader(service, SPREADSHEET_ID)
    const loader = new RecaudacionLoader(accessToken, SPREADSHEET_ID);

    // =========================
    //  Cargar y consolidar SAR
    // =========================
    console.log('Cargando datos SAR...');
    await loader.cargarSar();
    loader.consolidar();

    const dfConsolidado = loader.getDfConsolidado();
    const tablaSar      = loader.getTablaSar();

    console.log('Consolidado (primeros 5 registros):', dfConsolidado.slice(0, 5));

    // =========================
    //  Cargar Tipo_OT
    // =========================
    console.log('Cargando Tipo_OT...');
    await loader.cargarTipoOt();
    const dfTipoOt = loader.getDfTipoOt();
    console.log('Tipo_OT (primeros 5 registros):', dfTipoOt.slice(0, 5));

    // =========================
    //  Cargar Tamano_OT
    // =========================
    console.log('Cargando Tamano_OT...');
    await loader.cargarTamanoOt();
    const dfTamanoOt = loader.getDfTamanoOt();
    console.log('Tamano_OT (primeros 5 registros):', dfTamanoOt.slice(0, 5));

    // =========================
    //  Cargar Departamento
    // =========================
    console.log('Cargando Departamento...');
    await loader.cargarDepartamento();
    const dfDepartamento = loader.getDfDepartamento();
    console.log('Departamento (primeros 5 registros):', dfDepartamento.slice(0, 5));

    // =========================
    //  Cargar Municipio
    // =========================
    console.log('Cargando Municipio...');
    await loader.cargarMunicipio();
    const dfMunicipio = loader.getDfMunicipio();
    console.log('Municipio (primeros 5 registros):', dfMunicipio.slice(0, 5));

    // =========================
    //  Cargar Seccion
    // =========================
    console.log('Cargando Seccion...');
    await loader.cargarSeccion();
    const dfSeccion = loader.getDfSeccion();
    console.log('Seccion (primeros 5 registros):', dfSeccion.slice(0, 5));

    // Aquí se puede agregar lógica de visualización (gráficos, tablas, etc.)
    console.log('Todos los datos cargados correctamente.');

    return {
      dfConsolidado,
      tablaSar,
      dfTipoOt,
      dfTamanoOt,
      dfDepartamento,
      dfMunicipio,
      dfSeccion
    };

  } catch (error) {
    console.error('Error en main:', error);
    throw error;
  }
}
