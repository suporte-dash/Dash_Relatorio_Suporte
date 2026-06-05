let adminData = null;
let adminHistory = [];
let pendingExcelFile = null;
let adminInitialized = false;
let adminAuthenticated = false;

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = (type === 'success' ? '✅ ' : '❌ ') + message;
  toast.className = `show ${type}`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.className = '';
  }, 3000);
}

function normalizeFluxoKey(str) {
  return (str || '').toString().trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ');
}

function num(value) {
  const parsed = parseInt(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function derivePeriodoFromFileName(fileName) {
  const base = String(fileName || '')
    .replace(/\.(xlsx|xls)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return base ? base.toUpperCase() : `IMPORTAÇÃO ${new Date().toLocaleDateString('pt-BR')}`;
}

function showPanel(id) {
  document.querySelectorAll('.admin-panel').forEach(panel => panel.classList.remove('active'));
  document.getElementById(`panel-${id}`)?.classList.add('active');
}

function setAdminVisible(isVisible) {
  const gate = document.getElementById('adminLoginGate');
  const shell = document.getElementById('adminShell');
  const logoutBtn = document.getElementById('logoutBtn');

  if (gate) gate.style.display = isVisible ? 'none' : 'flex';
  if (shell) shell.style.display = isVisible ? 'flex' : 'none';
  if (logoutBtn) logoutBtn.style.display = isVisible ? 'inline-flex' : 'none';
}

function getPasswordInput() {
  return document.getElementById('adminPasswordInput');
}

function resetPasswordInput() {
  const input = getPasswordInput();
  if (input) input.value = '';
}

async function bootstrapAdmin() {
  const auth = await fetchRemoteAuth();
  adminAuthenticated = Boolean(auth?.authenticated);

  if (adminAuthenticated) {
    setAdminVisible(true);
    await adminInit();
    return;
  }

  setAdminVisible(false);
}

async function loadRemoteAdminState() {
  const remoteState = await fetchRemoteState();
  if (remoteState) {
    return {
      currentData: remoteState.currentData || loadData(),
      history: remoteState.history || [],
    };
  }

  return {
    currentData: loadData(),
    history: [],
  };
}

async function adminInit() {
  if (adminInitialized) {
    return;
  }

  const state = await loadRemoteAdminState();
  adminData = state.currentData;
  adminHistory = state.history;

  document.querySelectorAll('.admin-nav-item[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      showPanel(panel);
      document.querySelectorAll('.admin-nav-item').forEach(item => item.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  renderHistoricoTable();
  showPanel('importar');
  adminInitialized = true;
}

async function syncAdminData() {
  if (!adminAuthenticated) return;
  const state = await loadRemoteAdminState();
  adminData = state.currentData;
  adminHistory = state.history;
  renderHistoricoTable();
}

async function loginAdmin() {
  const input = getPasswordInput();
  const password = String(input?.value || '').trim();

  if (!password) {
    showToast('Digite a senha para continuar', 'error');
    input?.focus();
    return;
  }

  try {
    await loginRemoteAdmin(password);
    adminAuthenticated = true;
    setAdminVisible(true);
    resetPasswordInput();

    if (adminInitialized) {
      await syncAdminData();
    } else {
      await adminInit();
    }

    showToast('Acesso liberado!', 'success');
  } catch (error) {
    adminAuthenticated = false;
    setAdminVisible(false);
    showToast('Senha inválida: ' + error.message, 'error');
    input?.focus();
    input?.select?.();
  }
}

async function logoutAdmin() {
  try {
    await logoutRemoteAdmin();
  } catch (error) {
    // Continua ocultando a área mesmo se o logout remoto falhar.
  }

  adminAuthenticated = false;
  pendingExcelFile = null;
  window._pendingImport = null;
  cancelImport();
  setAdminVisible(false);
  showToast('Você saiu da área admin.', 'success');
}

function loadExcelFile() {
  const file = document.getElementById('excelFileInput').files[0];
  if (!file) {
    showToast('Selecione um arquivo .xlsx', 'error');
    return;
  }

  if (typeof XLSX === 'undefined') {
    showToast('O leitor de planilhas não carregou. Verifique a conexão e recarregue a página.', 'error');
    return;
  }

  pendingExcelFile = file;
  showToast(`Lendo ${file.name}...`, 'success');

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const workbook = XLSX.read(event.target.result, { type: 'array' });
      const preview = parseExcelData(workbook);
      if (!preview) return;
      showExcelPreview(preview);
    } catch (error) {
      showToast('Erro ao ler o arquivo: ' + error.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

async function uploadExcelFile(file) {
  const response = await fetch(`/api/uploads?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Falha ao salvar o arquivo no servidor');
  }

  return response.json();
}

const FLUXO_MAP = {
  'SEM INTERNET': { geral_matriz: 'SEM INTERNET — MATRIZ', geral_filiais: null },
  'SEM INTERNET FILIAIS': { geral_matriz: null, geral_filiais: 'SEM INTERNET — FILIAIS' },
  'LENTIDÃO': { geral_matriz: 'LENTIDÃO — MATRIZ', geral_filiais: null },
  'LENTIDÃO FILIAIS': { geral_matriz: null, geral_filiais: 'LENTIDÃO — FILIAIS' },
  'TROCA DE SENHA': { geral_matriz: 'TROCA DE SENHA', geral_filiais: null },
  'SERVIÇO SOLICITADO PELO CLIENTE': { geral_matriz: 'SERVIÇO SOLICITADO — MATRIZ', geral_filiais: null },
  'SERVIÇO SOLICITADO PELO CLIENTE FILIAIS': { geral_matriz: null, geral_filiais: 'SERVIÇO SOLICITADO — FILIAIS' },
  'TROCA DE EQUIPAMENTO': { geral_matriz: 'TROCA DE EQUIPAMENTO — MATRIZ', geral_filiais: null },
  'TROCA DE EQUIPAMENTO FILIAIS': { geral_matriz: null, geral_filiais: 'TROCA DE EQUIPAMENTO — FILIAIS' },
  'MUDANÇA DE CÔMODO': { geral_matriz: 'MUDANÇA DE CÔMODO — MATRIZ', geral_filiais: null },
  'MUDANÇA DE CÔMODO FILIAIS': { geral_matriz: null, geral_filiais: 'MUDANÇA DE CÔMODO — FILIAIS' },
  'TROCA DE EQUIPAMNETO': { geral_matriz: 'TROCA DE EQUIPAMENTO — MATRIZ', geral_filiais: null },
  'TROCA DE EQUIPAMNETO FILIAIS': { geral_matriz: null, geral_filiais: 'TROCA DE EQUIPAMENTO — FILIAIS' },
};

function parseExcelData(workbook) {
  const COL_MAP = {
    'ATENDENTE': 'atendente',
    'FLUXO': 'fluxo',
    'FLUXO / TOPICO': 'fluxo',
    'FLUXO/TOPICO': 'fluxo',
    'REGISTRADOS': 'registrados',
    'OS ABERTAS': 'os_abertas',
    'CONCLUIDAS': 'concluidas',
    'ABORTADOS': 'abortados',
    'PENDENTES': 'pendentes',
    'SOL. REMOTA': 'sol_remota',
    'SOL REMOTA': 'sol_remota',
  };

  const geralAcc = {};
  const result = tryParseFormatoA(workbook, COL_MAP, geralAcc)
    || tryParseFormatoB(workbook, COL_MAP, geralAcc);

  if (!result) {
    showToast('Nenhuma aba válida encontrada. Verifique se as colunas estão corretas.', 'error');
    return null;
  }

  const ordemGeral = [
    'LENTIDÃO — MATRIZ', 'LENTIDÃO — FILIAIS',
    'SEM INTERNET — MATRIZ', 'SEM INTERNET — FILIAIS',
    'TROCA DE SENHA',
    'SERVIÇO SOLICITADO — MATRIZ', 'SERVIÇO SOLICITADO — FILIAIS',
    'TROCA DE EQUIPAMENTO — MATRIZ', 'TROCA DE EQUIPAMENTO — FILIAIS',
    'MUDANÇA DE CÔMODO — MATRIZ', 'MUDANÇA DE CÔMODO — FILIAIS',
  ];

  return {
    atendentes: result.atendentes,
    relatorio_geral: ordemGeral.filter(key => geralAcc[key]).map(key => geralAcc[key]),
  };
}

function tryParseFormatoA(workbook, COL_MAP, geralAcc) {
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!rows.length) continue;

    let headerRow = -1;
    let headerIdx = {};

    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const normalized = rows[i].map(value => normalizeFluxoKey(value));
      if (normalized.includes('ATENDENTE')) {
        headerRow = i;
        normalized.forEach((column, index) => {
          const mapped = COL_MAP[column];
          if (mapped && !(mapped in headerIdx)) headerIdx[mapped] = index;
        });
        break;
      }
    }

    if (headerRow === -1 || !('atendente' in headerIdx) || !('fluxo' in headerIdx)) continue;

    const byAtendente = {};
    const ordem = [];

    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      const atendenteRaw = normalizeFluxoKey(row[headerIdx.atendente]);
      const fluxoRaw = normalizeFluxoKey(row[headerIdx.fluxo]);

      if (!atendenteRaw && !fluxoRaw) continue;
      if (!atendenteRaw && fluxoRaw.includes('TOTAL')) continue;
      if (atendenteRaw && !fluxoRaw) continue;

      const currentAtendente = atendenteRaw || ordem[ordem.length - 1];
      if (!currentAtendente) continue;

      if (!byAtendente[currentAtendente]) {
        byAtendente[currentAtendente] = [];
        ordem.push(currentAtendente);
      }

      byAtendente[currentAtendente].push(row);
    }

    if (!ordem.length) continue;

    const atendentes = buildAtendentesFromGroups(byAtendente, ordem, headerIdx, geralAcc);
    if (atendentes.length) return { atendentes };
  }

  return null;
}

function tryParseFormatoB(workbook, COL_MAP, geralAcc) {
  const ABAS_IGNORADAS = ['RELATORIO GERAL', 'RELATÓRIO GERAL', 'INSIGHTS', 'DINAMIC', 'DASHBOARD', 'BASE DADOS', 'BASE DE DADOS'];
  const atendentes = [];

  for (const sheetName of workbook.SheetNames) {
    if (ABAS_IGNORADAS.some(ignore => normalizeFluxoKey(sheetName).includes(ignore))) continue;

    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!rows.length) continue;

    let headerRow = -1;
    let headerIdx = {};

    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const normalized = rows[i].map(value => normalizeFluxoKey(value));
      if (normalized.some(column => column === 'FLUXO' || column === 'FLUXO / TOPICO' || column === 'FLUXO/TOPICO')) {
        headerRow = i;
        normalized.forEach((column, index) => {
          const mapped = COL_MAP[column];
          if (mapped && !(mapped in headerIdx)) headerIdx[mapped] = index;
        });
        break;
      }
    }

    if (headerRow === -1 || !('fluxo' in headerIdx)) continue;

    const grupo = {};
    const nomeAtendente = sheetName.trim().toUpperCase();
    grupo[nomeAtendente] = [];

    for (let i = headerRow + 1; i < rows.length; i++) {
      grupo[nomeAtendente].push(rows[i]);
    }

    const parsed = buildAtendentesFromGroups(grupo, [nomeAtendente], headerIdx, geralAcc);
    atendentes.push(...parsed);
  }

  return atendentes.length ? { atendentes } : null;
}

function buildAtendentesFromGroups(byAtendente, ordem, headerIdx, geralAcc) {
  const atendentes = [];

  for (const nome of ordem) {
    const rows = byAtendente[nome];
    const detalhes = [];
    let totalRow = null;

    for (const row of rows) {
      const fluxoRaw = normalizeFluxoKey(row[headerIdx.fluxo]);
      if (!fluxoRaw) continue;

      if (fluxoRaw.includes('TOTAL')) {
        totalRow = row;
        continue;
      }

      const matched = Object.keys(FLUXO_MAP).find(key => normalizeFluxoKey(key) === fluxoRaw);
      const fluxoNome = matched || row[headerIdx.fluxo].toString().trim().toUpperCase();

      const detalhe = {
        fluxo: fluxoNome,
        registrados: num(row[headerIdx.registrados]),
        os_abertas: num(row[headerIdx.os_abertas]),
        concluidas: num(row[headerIdx.concluidas]),
        abortados: num(row[headerIdx.abortados]),
        pendentes: num(row[headerIdx.pendentes]),
        sol_remota: num(row[headerIdx.sol_remota]),
      };
      detalhes.push(detalhe);

      const mapa = FLUXO_MAP[matched];
      if (mapa) {
        const geralKey = mapa.geral_matriz || mapa.geral_filiais;
        if (geralKey) {
          if (!geralAcc[geralKey]) {
            geralAcc[geralKey] = { fluxo: geralKey, registrados: 0, os_abertas: 0, concluidas: 0, abortados: 0, pendentes: 0, sol_remota: 0 };
          }
          geralAcc[geralKey].registrados += detalhe.registrados;
          geralAcc[geralKey].os_abertas += detalhe.os_abertas;
          geralAcc[geralKey].concluidas += detalhe.concluidas;
          geralAcc[geralKey].abortados += detalhe.abortados;
          geralAcc[geralKey].pendentes += detalhe.pendentes;
          geralAcc[geralKey].sol_remota += detalhe.sol_remota;
        }
      }
    }

    const totais = totalRow ? {
      registrados: num(totalRow[headerIdx.registrados]),
      os_abertas: num(totalRow[headerIdx.os_abertas]),
      concluidas: num(totalRow[headerIdx.concluidas]),
      abortados: num(totalRow[headerIdx.abortados]),
      pendentes: num(totalRow[headerIdx.pendentes]),
      sol_remota: num(totalRow[headerIdx.sol_remota]),
    } : {
      registrados: detalhes.reduce((sum, item) => sum + item.registrados, 0),
      os_abertas: detalhes.reduce((sum, item) => sum + item.os_abertas, 0),
      concluidas: detalhes.reduce((sum, item) => sum + item.concluidas, 0),
      abortados: detalhes.reduce((sum, item) => sum + item.abortados, 0),
      pendentes: detalhes.reduce((sum, item) => sum + item.pendentes, 0),
      sol_remota: detalhes.reduce((sum, item) => sum + item.sol_remota, 0),
    };

    if (detalhes.length) atendentes.push({ nome, ...totais, detalhes });
  }

  return atendentes;
}

function showExcelPreview(parsed) {
  const container = document.getElementById('excelPreviewArea');
  const { atendentes, relatorio_geral } = parsed;
  const totalReg = atendentes.reduce((sum, item) => sum + item.registrados, 0);
  const totalCon = atendentes.reduce((sum, item) => sum + item.concluidas, 0);
  const taxa = totalReg > 0 ? ((totalCon / totalReg) * 100).toFixed(1) : 0;

  let html = `
    <div class="preview-box">
      <h4>📊 Pré-visualização — ${atendentes.length} atendente(s) encontrado(s)</h4>
      <table class="data-table" style="margin-bottom:12px">
        <thead><tr>
          <th>Atendente</th>
          <th class="num-col">Registrados</th>
          <th class="num-col">Concluídas</th>
          <th class="num-col">Abortados</th>
          <th class="num-col">Pendentes</th>
          <th class="num-col">Sol. Remota</th>
          <th class="num-col">Taxa</th>
        </tr></thead>
        <tbody>
  `;

  atendentes.forEach(item => {
    const rate = item.registrados > 0 ? ((item.concluidas / item.registrados) * 100).toFixed(1) : 0;
    html += `
      <tr>
        <td><strong>${item.nome}</strong></td>
        <td class="num-col">${item.registrados}</td>
        <td class="num-col">${item.concluidas}</td>
        <td class="num-col">${item.abortados}</td>
        <td class="num-col">${item.pendentes}</td>
        <td class="num-col">${item.sol_remota}</td>
        <td class="num-col">${rate}%</td>
      </tr>
    `;
  });

  html += `
        <tr style="font-weight:bold;color:var(--cyan)">
          <td>TOTAL</td>
          <td class="num-col">${totalReg}</td>
          <td class="num-col">${totalCon}</td>
          <td class="num-col">${atendentes.reduce((sum, item) => sum + item.abortados, 0)}</td>
          <td class="num-col">${atendentes.reduce((sum, item) => sum + item.pendentes, 0)}</td>
          <td class="num-col">${atendentes.reduce((sum, item) => sum + item.sol_remota, 0)}</td>
          <td class="num-col">${taxa}%</td>
        </tr>
        </tbody>
      </table>
      <p style="color:var(--txt-2);font-size:13px">✅ ${relatorio_geral.length} fluxo(s) no relatório geral gerado automaticamente.</p>
      <div style="display:flex;gap:10px;margin-top:12px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="confirmImport()">✅ Confirmar Importação</button>
        <button class="btn btn-outline" onclick="cancelImport()">✖ Cancelar</button>
      </div>
    </div>
  `;

  container.innerHTML = html;
  container.style.display = 'block';
  window._pendingImport = parsed;
}

async function confirmImport() {
  const parsed = window._pendingImport;
  if (!parsed) return;

  const periodo = derivePeriodoFromFileName(pendingExcelFile?.name);
  const dataToSave = { ...parsed, periodo };

  try {
    if (pendingExcelFile) {
      const uploadResult = await uploadExcelFile(pendingExcelFile);
      await submitRemoteImport({
        data: dataToSave,
        periodo,
        sourceFileName: pendingExcelFile.name,
        savedFileName: uploadResult.fileName,
      });
    } else {
      await submitRemoteImport({ data: dataToSave, periodo });
    }
  } catch (error) {
    showToast('Não foi possível salvar no servidor: ' + error.message, 'error');
    return;
  }

  const refreshed = await loadRemoteAdminState();
  adminData = refreshed.currentData;
  adminHistory = refreshed.history;
  renderHistoricoTable();
  cancelImport();
  showToast('✅ Dados importados com sucesso!', 'success');
}

function cancelImport() {
  const area = document.getElementById('excelPreviewArea');
  if (area) {
    area.innerHTML = '';
    area.style.display = 'none';
  }

  window._pendingImport = null;
  pendingExcelFile = null;

  const input = document.getElementById('excelFileInput');
  if (input) input.value = '';
}

function renderHistoricoTable() {
  const tbody = document.getElementById('historicoBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!adminHistory.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--txt-2);padding:24px">Nenhum relatório importado ainda.</td></tr>';
    return;
  }

  adminHistory.forEach(entry => {
    const totalReg = entry.data.atendentes.reduce((sum, item) => sum + item.registrados, 0);
    const totalCon = entry.data.atendentes.reduce((sum, item) => sum + item.concluidas, 0);
    const taxa = totalReg > 0 ? ((totalCon / totalReg) * 100).toFixed(1) : 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong style="color:var(--txt-1)">${entry.periodo}</strong></td>
      <td style="color:var(--txt-2);font-size:12px">${entry.savedAt}</td>
      <td style="color:var(--cyan)">${totalReg} reg · ${taxa}% resolução</td>
      <td>
        <div class="actions-col">
          <button class="btn btn-primary btn-sm" onclick="viewSnapshotOnDashboard(${entry.id})">👁 Ver no Dash</button>
          <button class="btn btn-outline btn-sm" onclick="loadSnapshot(${entry.id})">📂 Carregar</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSnapshot(${entry.id})">🗑️ Apagar</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadSnapshot(id) {
  const entry = adminHistory.find(item => item.id === id) || await fetchRemoteHistoryEntry(id);
  if (!entry) {
    showToast('Relatório não encontrado', 'error');
    return;
  }

  if (!confirm(`Carregar o relatório de "${entry.periodo}"? Os dados atuais serão substituídos.`)) return;

  await submitRemoteImport({
    data: entry.data,
    periodo: entry.periodo,
    sourceFileName: entry.sourceFileName || null,
    savedFileName: entry.savedFileName || null,
  });

  const refreshed = await loadRemoteAdminState();
  adminData = refreshed.currentData;
  adminHistory = refreshed.history;
  renderHistoricoTable();
  showToast(`Relatório de "${entry.periodo}" carregado!`, 'success');
}

function viewSnapshotOnDashboard(id) {
  const dashUrl = `index.html?historyId=${encodeURIComponent(id)}`;
  const newTab = window.open(dashUrl, '_blank');
  if (!newTab) {
    window.location.href = dashUrl;
  }
}

async function deleteSnapshot(id) {
  const entry = adminHistory.find(item => item.id === id) || null;
  if (!entry) {
    showToast('Relatório não encontrado', 'error');
    return;
  }

  if (!confirm(`Apagar o relatório "${entry.periodo}"? Esse item vai sair do histórico e o arquivo salvo será removido.`)) return;

  try {
    await deleteRemoteHistoryEntry(id);
    const refreshed = await loadRemoteAdminState();
    adminData = refreshed.currentData;
    adminHistory = refreshed.history;
    renderHistoricoTable();
    showToast('Relatório apagado com sucesso!', 'success');
  } catch (error) {
    showToast('Não foi possível apagar o relatório: ' + error.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bootstrapAdmin().catch((error) => {
    setAdminVisible(false);
    showToast('Erro ao verificar acesso: ' + error.message, 'error');
  });
});

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    syncAdminData().catch(() => {});
  }
});

setInterval(() => {
  syncAdminData().catch(() => {});
}, 15000);
