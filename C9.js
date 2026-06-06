// Estado global del pipeline de datos C9
let rawData = [];
let headers = [];
let chart = null;

// Elementos del DOM
let csvInput, selectGroupCol, selectDataCol, selectBenchmark, selectTest, testDirection, alphaInput, fileInfo;

window.addEventListener('DOMContentLoaded', () => {
    // Vincular Nodos
    csvInput = document.getElementById('csv-file');
    selectGroupCol = document.getElementById('select-group-col');
    selectDataCol = document.getElementById('select-data-col');
    selectBenchmark = document.getElementById('select-benchmark-group');
    selectTest = document.getElementById('select-test-group');
    testDirection = document.getElementById('test-direction');
    alphaInput = document.getElementById('alpha-num');
    fileInfo = document.getElementById('file-info');

    // Configurar enlace de la IA automáticamente
    const aiLink = document.getElementById('ai-chat-link');
    if(aiLink) aiLink.href = window.location.href;

    // --- NUEVO: PREVENIR QUE EL NAVEGADOR ABRA EL ARCHIVO AL ARRASTRAR ---
    const dropZone = csvInput.closest('div'); // Atrapa el contenedor gris punteado

    // Prevenir el comportamiento por defecto en toda la ventana por seguridad
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    // Eventos visuales sobre la zona de arrastre
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('bg-gray-200', 'border-blue-500'); // Efecto visual al sostener el archivo
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('bg-gray-200', 'border-blue-500');
    });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('bg-gray-200', 'border-blue-500');

    const files = e.dataTransfer.files;
    if (files.length === 0) {
        alert("No se detectó ningún archivo. Por favor, arrastra un archivo con extensión .csv");
        return;
    }

    const file = files[0];
    // Validar extensión .csv (ignorando mayúsculas)
    if (!file.name.toLowerCase().endsWith('.csv')) {
        alert("Por favor, arrastra únicamente un archivo con extensión .csv");
        return;
    }

    csvInput.files = files; // Asignar el archivo al input oculto
    processDroppedFile(file); // Procesar el archivo estadísticamente
});

    // --------------------------------------------------------------------

    // Listeners reactivos estándar
    csvInput.addEventListener('change', handleFileLoad);
    selectGroupCol.addEventListener('change', processVariables);
    selectDataCol.addEventListener('change', processVariables);
    selectBenchmark.addEventListener('change', executeHypothesisTest);
    selectTest.addEventListener('change', executeHypothesisTest);
    testDirection.addEventListener('change', executeHypothesisTest);
    alphaInput.addEventListener('input', executeHypothesisTest);

    initChart();
});

// --- NUEVA FUNCIÓN AUXILIAR PARA PROCESAR EL ARRASTRE ---
function processDroppedFile(file) {
    fileInfo.innerText = `📦 Archivo activo (Arrastrado): ${file.name}`;
    fileInfo.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = function(evt) {
        rawData = parseCSV(evt.target.result);
        populateSelectors();
    };
    reader.readAsText(file);
}
// Parser de texto CSV limpio y tolerante a formatos
function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return [];
    
    // Detectar separador (coma o punto y coma)
    const firstLine = lines[0];
    const separator = firstLine.includes(';') ? ';' : ',';
    
    headers = firstLine.split(separator).map(h => h.trim().replace(/^"|"$/g, ''));
    
    return lines.slice(1).map(line => {
        const values = line.split(separator).map(v => v.trim().replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = values[index];
        });
        return obj;
    });
}

function handleFileLoad(e) {
    const file = e.target.files[0];
    if (!file) return;

    fileInfo.innerText = `📦 Archivo activo: ${file.name}`;
    fileInfo.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = function(evt) {
        rawData = parseCSV(evt.target.result);
        populateSelectors();
    };
    reader.readAsText(file);
}

function populateSelectors() {
    // Limpiar selectores de columnas
    selectGroupCol.innerHTML = '';
    selectDataCol.innerHTML = '';
    
    headers.forEach((h, index) => {
        const optG = new Option(h, h);
        const optD = new Option(h, h);
        selectGroupCol.add(optG);
        selectDataCol.add(optD);
    });

    // Heurística de detección automática: 
    // Frecuentemente la columna 0 es el grupo y la 1 o 2 son los datos
    if(headers.length >= 2) {
        selectGroupCol.value = headers[0];
        selectDataCol.value = headers[1];
    }

    selectGroupCol.disabled = false;
    selectDataCol.disabled = false;

    processVariables();
}

function processVariables() {
    const groupCol = selectGroupCol.value;
    if (!groupCol || rawData.length === 0) return;

    // Extraer las categorías únicas de la columna de grupo
    const uniqueGroups = [...new Set(rawData.map(row => row[groupCol]))].filter(g => g !== undefined && g !== '');

    selectBenchmark.innerHTML = '';
    selectTest.innerHTML = '';

    if (uniqueGroups.length < 2) {
        alert("Advertencia: La columna de grupo seleccionada debe contener al menos 2 categorías distintas.");
        return;
    }

    uniqueGroups.forEach(g => {
        selectBenchmark.add(new Option(`Grupo: ${g}`, g));
        selectTest.add(new Option(`Grupo: ${g}`, g));
    });

    // Pre-seleccionar grupos opuestos
    selectBenchmark.selectedIndex = 0;
    selectTest.selectedIndex = 1;

    selectBenchmark.disabled = false;
    selectTest.disabled = false;

    executeHypothesisTest();
}

function getGroupStats(groupName, groupCol, dataCol) {
    const rows = rawData.filter(row => row[groupCol] === groupName);
    const rawValues = rows.map(row => row[dataCol]);
    
    // Verificar si los datos son numéricos continuos o proporciones de éxito binarias
    const samplesAsNumbers = rawValues.map(v => parseFloat(v)).filter(v => !isNaN(v));
    const isQuantitative = samplesAsNumbers.length > 0;

    let n = rows.length;
    let mean = 0;
    let variance = 0;
    let sd = 0;
    let isProportion = false;

    if (isQuantitative) {
        // Análisis cuantitativo (Medias continuas)
        n = samplesAsNumbers.length;
        mean = samplesAsNumbers.reduce((sum, v) => sum + v, 0) / n;
        variance = samplesAsNumbers.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (n - 1);
        sd = Math.sqrt(variance);
    } else {
        // Análisis cualitativo (Proporciones binarias, buscando texto de éxito tipo 'yes','1','success','true')
        isProportion = true;
        const successes = rawValues.filter(v => ['yes', '1', 'success', 'true', 'sí', 'si'].includes(v.toLowerCase())).length;
        mean = n > 0 ? successes / n : 0;
        sd = Math.sqrt(mean * (1 - mean)); // Error para proporciones individuales
    }

    return { n, mean, sd, isProportion };
}

function executeHypothesisTest() {
    const groupCol = selectGroupCol.value;
    const dataCol = selectDataCol.value;
    const benchmarkGroup = selectBenchmark.value;
    const testGroup = selectTest.value;
    const alpha = parseFloat(alphaInput.value) || 0.05;
    const direction = testDirection.value;

    if (!benchmarkGroup || !testGroup || benchmarkGroup === testGroup) return;

    // Actualizar etiquetas visuales
    document.getElementById('lbl-g1').innerText = `Benchmark: ${benchmarkGroup}`;
    document.getElementById('lbl-g2').innerText = `Test: ${testGroup}`;

    const stats1 = getGroupStats(benchmarkGroup, groupCol, dataCol); // Grupo 1
    const stats2 = getGroupStats(testGroup, groupCol, dataCol);      // Grupo 2

    // Imprimir estadísticas descriptivas en pantalla
    document.getElementById('n1-val').innerText = stats1.n;
    document.getElementById('m1-val').innerText = stats1.mean.toFixed(4);
    document.getElementById('sd1-val').innerText = stats1.sd.toFixed(4);

    document.getElementById('n2-val').innerText = stats2.n;
    document.getElementById('m2-val').innerText = stats2.mean.toFixed(4);
    document.getElementById('sd2-val').innerText = stats2.sd.toFixed(4);

    // Cálculo del Estadístico Z de dos muestras independientes
    let zObserved = 0;
    if (stats1.isProportion && stats2.isProportion) {
        // Test Z para diferencia de dos proporciones (Pooled proportion)
        const totalSuccesses = (stats1.mean * stats1.n) + (stats2.mean * stats2.n);
        const totalN = stats1.n + stats2.n;
        const pPool = totalSuccesses / totalN;
        const se = Math.sqrt(pPool * (1 - pPool) * (1 / stats1.n + 1 / stats2.n));
        zObserved = se === 0 ? 0 : (stats2.mean - stats1.mean) / se;
    } else {
        // Test Z para diferencia de dos medias de muestras independientes
        const se = Math.sqrt((Math.pow(stats1.sd, 2) / stats1.n) + (Math.pow(stats2.sd, 2) / stats2.n));
        zObserved = se === 0 ? 0 : (stats2.mean - stats1.mean) / se;
    }

    // Evaluación Probabilística del P-Valor
    let pValue = 0;
    let criticalLeft = null;
    let criticalRight = null;

    if (direction === 'left-tailed') {
        pValue = cdfNormal(zObserved);
        criticalLeft = ppointsInverse(alpha);
    } else if (direction === 'right-tailed') {
        pValue = 1 - cdfNormal(zObserved);
        criticalRight = ppointsInverse(1 - alpha);
    } else {
        pValue = 2 * (1 - cdfNormal(Math.abs(zObserved)));
        criticalLeft = ppointsInverse(alpha / 2);
        criticalRight = ppointsInverse(1 - alpha / 2);
    }

    pValue = Math.max(0, Math.min(1, pValue));
    const shouldReject = pValue < alpha;

    // Actualizar Outputs Numéricos
    document.getElementById('stat-z-val').innerText = zObserved.toFixed(3);
    document.getElementById('p-val').innerText = pValue.toFixed(4);
    
    const critElem = document.getElementById('crit-val');
    if (direction === 'two-tailed') {
        critElem.innerText = `±${criticalRight.toFixed(3)}`;
    } else {
        critElem.innerText = direction === 'left-tailed' ? criticalLeft.toFixed(3) : `+${criticalRight.toFixed(3)}`;
    }

    // Actualizar Panel Informativo Final
    const box = document.getElementById('decision-box');
    const icon = document.getElementById('decision-icon');
    const title = document.getElementById('decision-title');
    const text = document.getElementById('decision-text');

    if (shouldReject) {
        box.className = "p-5 rounded-2xl border bg-red-50 border-red-200 text-red-900";
        icon.innerHTML = "❌";
        title.innerText = "Rechazar H₀ (Diferencia Significativa)";
        text.innerHTML = `El <b>p-valor (${pValue.toFixed(4)}) &lt; α (${alpha})</b>. Tenemos evidencia empírica contundente en el set de datos para rechazar la igualdad estructural. <br><br><b>Conclusión:</b> El rendimiento de la variable en el grupo de prueba <b>(${testGroup})</b> difiere significativamente respecto al grupo de control base.`;
    } else {
        box.className = "p-5 rounded-2xl border bg-green-50 border-green-200 text-green-900";
        icon.innerHTML = "✅";
        title.innerText = "No Rechazar H₀ (Efectos Similares)";
        text.innerHTML = `El <b>p-valor (${pValue.toFixed(4)}) &ge; α (${alpha})</b>. Falla al rechazar la hipótesis nula.<br><br><b>Conclusión:</b> No existe variación estadística robusta entre el comportamiento de los dos grupos analizados. La variación observada es explicable por mero azar muestral.`;
    }

    updateChart(zObserved, direction, criticalLeft, criticalRight);
}

// Funciones Auxiliares de Distribución Estadística N(0,1)
function cdfNormal(z) {
    const b1 = 0.319381530, b2 = -0.356563782, b3 = 1.781477937, b4 = -1.821255978, b5 = 1.330274429;
    const p = 0.2316419, c = 0.39894228;
    let absZ = Math.abs(z);
    let t = 1.0 / (1.0 + p * absZ);
    let cdf = 1.0 - c * Math.exp(-absZ * absZ / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
    return z >= 0 ? cdf : 1.0 - cdf;
}

function ppointsInverse(p) {
    const c0 = 2.515517, c1 = 0.802853, c2 = 0.010328;
    const d1 = 1.432788, d2 = 0.189269, d3 = 0.001308;
    if (p <= 0 || p >= 1) return 0;
    let t = Math.sqrt(-2.0 * Math.log(p < 0.5 ? p : 1.0 - p));
    let ans = t - ((c2 * t + c1) * t + c0) / (((d3 * t + d2) * t + d1) * t + 1.0);
    return p < 0.5 ? -ans : ans;
}

function pdfNormal(x) {
    return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

function initChart() {
    const ctx = document.getElementById('normalChart').getContext('2d');
    const labels = []; const data = [];
    for (let x = -4; x <= 4; x += 0.05) { labels.push(x); data.push(pdfNormal(x)); }

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{ data: data, borderColor: '#3b82f6', borderWidth: 2, pointRadius: 0, fill: false }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, annotation: { annotations: {} } },
            scales: { x: { type: 'linear', min: -4, max: 4 }, y: { display: false } }
        }
    });
}

function updateChart(zObs, direction, critLeft, critRight) {
    if (!chart) return;
    const annotations = {};

    annotations.zObsLine = {
        type: 'line', xMin: zObs, xMax: zObs, borderColor: '#1e40af', borderWidth: 3, borderDash: [4, 4],
        label: { display: true, content: `Z obs: ${zObs.toFixed(2)}`, position: 'end', backgroundColor: '#1e40af', color: '#fff', font: { size: 10, weight: 'bold' } }
    };

    if (critLeft !== null) {
        annotations.critLeftLine = { type: 'line', xMin: critLeft, xMax: critLeft, borderColor: '#ef4444', borderWidth: 2 };
        annotations.boxLeft = { type: 'box', xMin: -4, xMax: critLeft, backgroundColor: 'rgba(239, 68, 68, 0.12)', borderWidth: 0 };
    }
    if (critRight !== null) {
        annotations.critRightLine = { type: 'line', xMin: critRight, xMax: critRight, borderColor: '#ef4444', borderWidth: 2 };
        annotations.boxRight = { type: 'box', xMin: critRight, xMax: 4, backgroundColor: 'rgba(239, 68, 68, 0.12)', borderWidth: 0 };
    }

    if (direction === 'left-tailed' || (direction === 'two-tailed' && zObs < 0)) {
        annotations.pValBoxLeft = { type: 'box', xMin: -4, xMax: zObs, backgroundColor: 'rgba(59, 130, 246, 0.25)', borderWidth: 0 };
    }
    if (direction === 'right-tailed' || (direction === 'two-tailed' && zObs > 0)) {
        annotations.pValBoxRight = { type: 'box', xMin: zObs, xMax: 4, backgroundColor: 'rgba(59, 130, 246, 0.25)', borderWidth: 0 };
    }
    chart.options.plugins.annotation.annotations = annotations;
    chart.update();
}