// =========================
//  Equivalente JavaScript de loader.py
//  RecaudacionLoader: lee hojas de Google Sheets y devuelve arrays de objetos
//  (equivalente a DataFrames de pandas)
// =========================

// Equivalente a: leer_hoja_gsheets(service, spreadsheet_id, nombre_hoja)
async function leerHojaGSheets(accessToken, spreadsheetId, nombreHoja) {
  const rango    = `${nombreHoja}!A1:Z1000`;
  const url      = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rango)}`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Error leyendo hoja "${nombreHoja}": ${err.error?.message || response.statusText}`);
  }

  const result  = await response.json();
  const valores = result.values || [];

  if (!valores.length) {
    console.log(`La hoja ${nombreHoja} está vacía.`);
    return [];
  }

  const encabezados = valores[0];
  const filas       = valores.slice(1);
  const nCols       = encabezados.length;

  // Pad de filas para que coincidan con el número de encabezados
  const filasPadded = filas.map(row => {
    if (row.length < nCols) return [...row, ...Array(nCols - row.length).fill('')];
    return row.slice(0, nCols);
  });

  // Convierte a array de objetos (equivalente a DataFrame de pandas)
  return filasPadded.map(row => {
    const obj = {};
    encabezados.forEach((key, i) => { obj[key] = row[i] ?? ''; });
    return obj;
  });
}

// Limpia y parsea un valor numérico (equivalente al str.replace + to_numeric de pandas)
function parsearNumero(valor) {
  const limpio = String(valor ?? '').replace(/[^\d.\-]/g, '').trim();
  const num    = parseFloat(limpio);
  return isNaN(num) ? 0 : num;
}

// Normaliza los encabezados de un array de objetos según un mapa de renombres
function normalizarEncabezados(datos, renombres) {
  return datos.map(row => {
    const normalizado = {};
    Object.entries(row).forEach(([key, value]) => {
      const keyNorm  = key.trim().toUpperCase();
      const keyFinal = renombres[keyNorm] ?? keyNorm;
      normalizado[keyFinal] = value;
    });
    return normalizado;
  });
}

// =========================
//  Clase RecaudacionLoader
//  Equivalente a la clase RecaudacionLoader de Python
// =========================
class RecaudacionLoader {
  constructor(accessToken, spreadsheetId) {
    this.accessToken    = accessToken;
    this.spreadsheetId  = spreadsheetId;
    this.tablaSar       = null;
    this.dfConsolidado  = null;
    this.dfTipoOt       = null;
    this.dfTamanoOt     = null;
    this.dfDepartamento = null;
    this.dfMunicipio    = null;
    this.dfSeccion      = null;
    this.nombreHoja     = 'Datos - Plantilla Impuesto';
  }

  // Equivalente a: leer_rango() dentro de cargar_sar()
  async _leerRangoSar(fila_inicio, fila_fin) {
    const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
                   'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const columnas = ['codigo','descripcion', ...meses, 'total'];

    const rango    = `'${this.nombreHoja}'!B${fila_inicio}:P${fila_fin}`;
    const url      = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(rango)}`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });

    const result  = await response.json();
    const values  = result.values || [];
    const nCols   = columnas.length;

    const valuesPadded = values.map(row => {
      if (row.length < nCols) return [...row, ...Array(nCols - row.length).fill('')];
      return row.slice(0, nCols);
    });

    let datos = valuesPadded.map(row => {
      const obj = {};
      columnas.forEach((col, i) => { obj[col] = row[i] ?? ''; });
      return obj;
    });

    // Eliminar filas vacías
    datos = datos.filter(row => !Object.values(row).every(v => String(v).trim() === ''));

    // Normalizar 'codigo' a 5 dígitos
    datos = datos.map(row => {
      const match = String(row.codigo).match(/(\d+)/);
      row.codigo  = match ? match[1].padStart(5, '0') : '';
      return row;
    });

    // Filtrar solo códigos de 5 dígitos válidos
    datos = datos.filter(row => /^\d{5}$/.test(row.codigo));

    // Excluir códigos agregados y los que terminan en "00"
    const codigosAgregados = new Set(['11100','11200','11300','11400','11500','11600']);
    datos = datos.filter(row => !codigosAgregados.has(row.codigo) && !row.codigo.endsWith('00'));

    // Mapeo de códigos a categoría de concepto
    const diccionarioConceptos = {
      '11101':'ISR','11102':'ISR','11103':'ISR','11104':'ISR','11105':'ISR',
      '11106':'ISR','11107':'ISR','11108':'ISR','11109':'ISR','11110':'ISR',
      '11111':'ISR','11112':'ISR','11113':'ISR','11114':'ISR','11115':'ISR',
      '11116':'ISR',
      '11201':'RESTO','11202':'RESTO','11203':'RESTO','11204':'RESTO',
      '11301':'RESTO','11302':'RESTO','11303':'RESTO','11304':'RESTO','11305':'RESTO',
      '11306':'ISV','11307':'ISV','11308':'RESTO','11309':'RESTO','11310':'RESTO',
      '11314':'ISV','11315':'ISV',
      '11401':'RESTO','11402':'RESTO','11403':'RESTO','11404':'RESTO','11405':'RESTO',
      '11406':'RESTO','11407':'RESTO','11408':'RESTO','11409':'RESTO','11410':'RESTO',
      '11411':'RESTO','11412':'RESTO','11413':'RESTO','11414':'RESTO','11415':'RESTO',
      '11416':'RESTO','11417':'RESTO','11418':'RESTO',
      '11501':'RESTO','11502':'RESTO','11503':'RESTO','11504':'RESTO',
      '11601':'RESTO','11602':'RESTO','11603':'RESTO'
    };

    datos = datos.map(row => {
      row.CONCEPTO_CAT = diccionarioConceptos[row.codigo] ?? null;
      return row;
    });

    return datos;
  }

  // Equivalente a: cargar_sar()
  async cargarSar() {
    const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
                   'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

    const rangosAnios = {
      2023: [208, 303],
      2024: [308, 403],
      2025: [408, 503],
      2026: [508, 603],
    };

    const todosLosDatos = [];

    for (const [anio, [inicio, fin]] of Object.entries(rangosAnios)) {
      const datos = await this._leerRangoSar(inicio, fin);

      // Limpiar y sumar montos por código y concepto
      const agrupado = {};
      for (const row of datos) {
        if (!['ISR','ISV','RESTO'].includes(row.CONCEPTO_CAT)) continue;

        const key = `${row.codigo}__${row.CONCEPTO_CAT}`;
        if (!agrupado[key]) agrupado[key] = { CONCEPTO_CAT: row.CONCEPTO_CAT };
        meses.forEach(mes => {
          agrupado[key][mes] = (agrupado[key][mes] || 0) + parsearNumero(row[mes]);
        });
      }

      // Convertir a formato largo (melt) por mes
      for (const item of Object.values(agrupado)) {
        meses.forEach(mes => {
          todosLosDatos.push({
            AÑO:          parseInt(anio),
            MES:          mes,
            CONCEPTO_CAT: item.CONCEPTO_CAT,
            MONTO:        (item[mes] || 0) / 100  // equivalente a / 1_00 de Python
          });
        });
      }
    }

    // Agrupar por AÑO, MES, CONCEPTO_CAT y sumar MONTO
    const agrupado2 = {};
    for (const row of todosLosDatos) {
      const key = `${row.AÑO}__${row.MES}__${row.CONCEPTO_CAT}`;
      if (!agrupado2[key]) agrupado2[key] = { AÑO: row.AÑO, MES: row.MES, CONCEPTO_CAT: row.CONCEPTO_CAT, MONTO: 0 };
      agrupado2[key].MONTO += row.MONTO;
    }

    // Pivot: una columna por CONCEPTO_CAT (ISR, ISV, RESTO)
    const pivotMap = {};
    for (const row of Object.values(agrupado2)) {
      const key = `${row.AÑO}__${row.MES}`;
      if (!pivotMap[key]) pivotMap[key] = { AÑO: row.AÑO, MES: row.MES, ISR: 0, ISV: 0, RESTO: 0 };
      pivotMap[key][row.CONCEPTO_CAT] = (pivotMap[key][row.CONCEPTO_CAT] || 0) + row.MONTO;
    }

    this.tablaSar = Object.values(pivotMap);
    console.log(`[cargarSar] ${this.tablaSar.length} registros cargados.`);
  }

  // Equivalente a: consolidar()
  consolidar() {
    if (!this.tablaSar) throw new Error('Ejecute cargarSar() primero.');

    const ordenMeses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
                        'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

    // Agrupar por AÑO y MES, sumar ISR, ISV, RESTO
    const mapaTotal = {};
    for (const row of this.tablaSar) {
      const key = `${row.AÑO}__${row.MES}`;
      if (!mapaTotal[key]) mapaTotal[key] = { AÑO: row.AÑO, MES: row.MES, ISR: 0, ISV: 0, RESTO: 0 };
      mapaTotal[key].ISR   += row.ISR || 0;
      mapaTotal[key].ISV   += row.ISV || 0;
      mapaTotal[key].RESTO += row.RESTO || 0;
    }

    this.dfConsolidado = Object.values(mapaTotal).map(row => ({
      ...row,
      TOTAL_MENSUAL: row.ISR + row.ISV + row.RESTO
    })).sort((a, b) => {
      if (a.AÑO !== b.AÑO) return a.AÑO - b.AÑO;
      return ordenMeses.indexOf(a.MES) - ordenMeses.indexOf(b.MES);
    });

    console.log(`[consolidar] ${this.dfConsolidado.length} registros consolidados.`);
  }

  // Equivalente a: cargar_tipo_ot()
  async cargarTipoOt(nombreHoja = 'Tipo_OT') {
    const renombres = {
      'A_O':'AÑO','ANIO':'AÑO','ANO':'AÑO','AÑO':'AÑO',
      'MES':'MES',
      'TIPO_OT':'TIPO_OT','TIPO OT':'TIPO_OT',
      'MONTO_RECAUDADO':'MONTO_RECAUDADO','MONTO':'MONTO_RECAUDADO',
      'VALOR':'MONTO_RECAUDADO','TOTAL':'MONTO_RECAUDADO'
    };

    const datos = await leerHojaGSheets(this.accessToken, this.spreadsheetId, nombreHoja);

    if (!datos.length) {
      console.log(`[Tipo_OT] Hoja vacía o no encontrada: ${nombreHoja}`);
      this.dfTipoOt = [];
      return;
    }

    const normalizados = normalizarEncabezados(datos, renombres);
    const requeridas   = ['AÑO','MES','TIPO_OT','MONTO_RECAUDADO'];
    const primerRow    = normalizados[0];
    const faltantes    = requeridas.filter(c => !(c in primerRow));

    if (faltantes.length) throw new Error(`[Tipo_OT] Faltan columnas requeridas: ${faltantes.join(', ')}`);

    this.dfTipoOt = normalizados
      .map(row => ({
        AÑO:             parseInt(row['AÑO']) || null,
        MES:             parseInt(row['MES']) || null,
        TIPO_OT:         String(row['TIPO_OT'] || '').trim().toUpperCase().replace('JURIDICO','JURÍDICO'),
        MONTO_RECAUDADO: parsearNumero(row['MONTO_RECAUDADO'])
      }))
      .filter(row => row.AÑO && row.MES);

    console.log(`[cargarTipoOt] ${this.dfTipoOt.length} registros cargados.`);
  }

  // Equivalente a: cargar_tamano_ot()
  async cargarTamanoOt(nombreHoja = 'Tamano_OT') {
    const renombres = {
      'A_O':'AÑO','ANIO':'AÑO','ANO':'AÑO','AÑO':'AÑO',
      'MES':'MES',
      'TAMANO_OT':'TAMANO_OT','TAMANO OT':'TAMANO_OT',
      'TAMAÑO_OT':'TAMANO_OT','TAMAÑO OT':'TAMANO_OT',
      'MONTO_RECAUDADO':'MONTO_RECAUDADO','MONTO':'MONTO_RECAUDADO',
      'VALOR':'MONTO_RECAUDADO','TOTAL':'MONTO_RECAUDADO'
    };

    const datos = await leerHojaGSheets(this.accessToken, this.spreadsheetId, nombreHoja);

    if (!datos.length) {
      console.log(`[Tamano_OT] Hoja vacía o no encontrada: ${nombreHoja}`);
      this.dfTamanoOt = [];
      return;
    }

    const normalizados = normalizarEncabezados(datos, renombres);
    const requeridas   = ['AÑO','MES','TAMANO_OT','MONTO_RECAUDADO'];
    const faltantes    = requeridas.filter(c => !(c in normalizados[0]));

    if (faltantes.length) throw new Error(`[Tamano_OT] Faltan columnas requeridas: ${faltantes.join(', ')}`);

    this.dfTamanoOt = normalizados
      .map(row => ({
        AÑO:             parseInt(row['AÑO']) || null,
        MES:             parseInt(row['MES']) || null,
        TAMANO_OT:       String(row['TAMANO_OT'] || '').trim().toUpperCase(),
        MONTO_RECAUDADO: parsearNumero(row['MONTO_RECAUDADO'])
      }))
      .filter(row => row.AÑO && row.MES);

    console.log(`[cargarTamanoOt] ${this.dfTamanoOt.length} registros cargados.`);
  }

  // Equivalente a: cargar_departamento()
  async cargarDepartamento(nombreHoja = 'Departamento') {
    const renombres = {
      'A_O':'AÑO','ANIO':'AÑO','ANO':'AÑO','AÑO':'AÑO',
      'MES':'MES',
      'DEPARTAMENTO':'DEPARTAMENTO','DEPTO':'DEPARTAMENTO','DEPA':'DEPARTAMENTO','DEPART.':'DEPARTAMENTO',
      'MONTO_RECAUDADO':'MONTO_RECAUDADO','MONTO':'MONTO_RECAUDADO','VALOR':'MONTO_RECAUDADO','TOTAL':'MONTO_RECAUDADO'
    };

    const datos = await leerHojaGSheets(this.accessToken, this.spreadsheetId, nombreHoja);

    if (!datos.length) {
      console.log(`[Departamento] Hoja vacía o no encontrada: ${nombreHoja}`);
      this.dfDepartamento = [];
      return;
    }

    const normalizados = normalizarEncabezados(datos, renombres);
    const requeridas   = ['AÑO','MES','DEPARTAMENTO','MONTO_RECAUDADO'];
    const faltantes    = requeridas.filter(c => !(c in normalizados[0]));

    if (faltantes.length) throw new Error(`[Departamento] Faltan columnas requeridas: ${faltantes.join(', ')}`);

    this.dfDepartamento = normalizados
      .map(row => ({
        AÑO:             parseInt(row['AÑO']) || null,
        MES:             parseInt(row['MES']) || null,
        DEPARTAMENTO:    String(row['DEPARTAMENTO'] || '').trim().toUpperCase(),
        MONTO_RECAUDADO: parsearNumero(row['MONTO_RECAUDADO'])
      }))
      .filter(row => row.AÑO && row.MES);

    console.log(`[cargarDepartamento] ${this.dfDepartamento.length} registros cargados.`);
  }

  // Equivalente a: cargar_municipio()
  async cargarMunicipio(nombreHoja = 'Municipio') {
    const renombres = {
      'A_O':'AÑO','ANIO':'AÑO','ANO':'AÑO','AÑO':'AÑO',
      'MES':'MES',
      'DEPARTAMENTO':'DEPARTAMENTO','DEPTO':'DEPARTAMENTO','DEPA':'DEPARTAMENTO','DEPART.':'DEPARTAMENTO',
      'MUNICIPIO':'MUNICIPIO',
      'MONTO_RECAUDADO':'MONTO_RECAUDADO','MONTO':'MONTO_RECAUDADO','VALOR':'MONTO_RECAUDADO','TOTAL':'MONTO_RECAUDADO'
    };

    const datos = await leerHojaGSheets(this.accessToken, this.spreadsheetId, nombreHoja);

    if (!datos.length) {
      this.dfMunicipio = [];
      return;
    }

    const normalizados = normalizarEncabezados(datos, renombres);
    const requeridas   = ['AÑO','MES','DEPARTAMENTO','MUNICIPIO','MONTO_RECAUDADO'];
    const faltantes    = requeridas.filter(c => !(c in normalizados[0]));

    if (faltantes.length) throw new Error(`[Municipio] Faltan columnas requeridas: ${faltantes.join(', ')}`);

    this.dfMunicipio = normalizados
      .map(row => ({
        AÑO:             parseInt(row['AÑO']) || null,
        MES:             parseInt(row['MES']) || null,
        DEPARTAMENTO:    String(row['DEPARTAMENTO'] || '').trim().toUpperCase(),
        MUNICIPIO:       String(row['MUNICIPIO'] || '').trim().toUpperCase(),
        MONTO_RECAUDADO: parsearNumero(row['MONTO_RECAUDADO'])
      }))
      .filter(row => row.AÑO && row.MES);

    console.log(`[cargarMunicipio] ${this.dfMunicipio.length} registros cargados.`);
  }

  // Equivalente a: cargar_seccion()
  async cargarSeccion(nombreHoja = 'Seccion') {
    const renombres = {
      'A_O':'AÑO','ANIO':'AÑO','ANO':'AÑO','AÑO':'AÑO',
      'MES':'MES',
      'SECCION':'SECCION','SECCIÓN':'SECCION','SECCION_OT':'SECCION','SECCIÓN OT':'SECCION',
      'MONTO_RECAUDADO':'MONTO_RECAUDADO','MONTO':'MONTO_RECAUDADO','VALOR':'MONTO_RECAUDADO','TOTAL':'MONTO_RECAUDADO'
    };

    const datos = await leerHojaGSheets(this.accessToken, this.spreadsheetId, nombreHoja);

    if (!datos.length) {
      console.log(`[Seccion] Hoja vacía o no encontrada: ${nombreHoja}`);
      this.dfSeccion = [];
      return;
    }

    const normalizados = normalizarEncabezados(datos, renombres);
    const requeridas   = ['AÑO','MES','SECCION','MONTO_RECAUDADO'];
    const faltantes    = requeridas.filter(c => !(c in normalizados[0]));

    if (faltantes.length) throw new Error(`[Seccion] Faltan columnas requeridas: ${faltantes.join(', ')}`);

    this.dfSeccion = normalizados
      .map(row => ({
        AÑO:             parseInt(row['AÑO']) || null,
        MES:             parseInt(row['MES']) || null,
        SECCION:         String(row['SECCION'] || '').trim().toUpperCase(),
        MONTO_RECAUDADO: parsearNumero(row['MONTO_RECAUDADO'])
      }))
      .filter(row => row.AÑO && row.MES);

    console.log(`[cargarSeccion] ${this.dfSeccion.length} registros cargados.`);
  }

  // Getters (equivalentes a get_df_* de Python)
  getDfConsolidado()  { return this.dfConsolidado  ?? []; }
  getTablaSar()       { return this.tablaSar        ?? []; }
  getDfTipoOt()       { return this.dfTipoOt        ?? []; }
  getDfTamanoOt()     { return this.dfTamanoOt      ?? []; }
  getDfDepartamento() { return this.dfDepartamento  ?? []; }
  getDfMunicipio()    { return this.dfMunicipio     ?? []; }
  getDfSeccion()      { return this.dfSeccion       ?? []; }
}
