/**
 * admin.js — Área Administrativa
 * CRUD completo para atendentes, detalhes e relatório geral
 */

let adminData = null;
let editingAtendente = null;
let editingFluxoAtendIdx = null;
let editingFluxoIdx = null;
let editingGeralIdx = null;

function adminInit() {
  adminData = loadData();

  // Navegação
  document.querySelectorAll('.admin-nav-item[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      showPanel(panel);
      document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  renderAtendentesTable();
  renderFluxoDetalheTable();
  renderGeralTable();
  renderPeriodo();
  renderHistoricoTable();
}

function showPanel(id) {
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + id)?.classList.add('active');
}

// ═══ PERÍODO ══════════════════════════════════════════════════════════════
function renderPeriodo() {
  document.getElementById('inputPeriodo').value = adminData.periodo || '';
}

function savePeriodo() {
  const val = document.getElementById('inputPeriodo').value.trim();
  if (!val) { showToast('Preencha o período', 'error'); return; }
  adminData.periodo = val;
  saveData(adminData);
  showToast('Período atualizado!', 'success');
}

// ═══ ATENDENTES ══════════════════════════════════════════════════════════
function renderAtendentesTable() {
  const tbody = document.getElementById('atendenteAdminBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  adminData.atendentes.forEach((a, i) => {
    const taxa = a.registrados > 0 ? ((a.concluidas / a.registrados) * 100).toFixed(1) : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong style="color:var(--txt-1)">${a.nome}</strong></td>
      <td>${a.registrados}</td>
      <td>${a.os_abertas}</td>
      <td>${a.concluidas}</td>
      <td>${a.abortados}</td>
      <td>${a.pendentes}</td>
      <td>${a.sol_remota}</td>
      <td>${taxa}%</td>
      <td>
        <div class="actions-col">
          <button class="btn btn-outline btn-sm" onclick="openEditAtendente(${i})">✏️ Editar</button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteAtendente(${i})">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openNewAtendente() {
  editingAtendente = null;
  document.getElementById('modalAtendTitle').textContent = '➕ Novo Atendente';
  clearAtendForm();
  openModal('modalAtendente');
}

function openEditAtendente(idx) {
  editingAtendente = idx;
  const a = adminData.atendentes[idx];
  document.getElementById('modalAtendTitle').textContent = `✏️ Editar — ${a.nome}`;
  document.getElementById('atend-nome').value = a.nome;
  document.getElementById('atend-reg').value = a.registrados;
  document.getElementById('atend-os').value = a.os_abertas;
  document.getElementById('atend-con').value = a.concluidas;
  document.getElementById('atend-abo').value = a.abortados;
  document.getElementById('atend-pen').value = a.pendentes;
  document.getElementById('atend-rem').value = a.sol_remota;
  openModal('modalAtendente');
}

function saveAtendente() {
  const nome = document.getElementById('atend-nome').value.trim().toUpperCase();
  const reg  = parseInt(document.getElementById('atend-reg').value) || 0;
  const os   = parseInt(document.getElementById('atend-os').value) || 0;
  const con  = parseInt(document.getElementById('atend-con').value) || 0;
  const abo  = parseInt(document.getElementById('atend-abo').value) || 0;
  const pen  = parseInt(document.getElementById('atend-pen').value) || 0;
  const rem  = parseInt(document.getElementById('atend-rem').value) || 0;

  if (!nome) { showToast('Nome obrigatório', 'error'); return; }

  const obj = { nome, registrados: reg, os_abertas: os, concluidas: con, abortados: abo, pendentes: pen, sol_remota: rem };

  if (editingAtendente !== null) {
    obj.detalhes = adminData.atendentes[editingAtendente].detalhes;
    adminData.atendentes[editingAtendente] = obj;
    showToast(`${nome} atualizado!`, 'success');
  } else {
    obj.detalhes = buildEmptyDetalhes();
    adminData.atendentes.push(obj);
    showToast(`${nome} adicionado!`, 'success');
  }

  saveData(adminData);
  closeModal('modalAtendente');
  renderAtendentesTable();
  renderFluxoDetalheTable();
}

function confirmDeleteAtendente(idx) {
  const a = adminData.atendentes[idx];
  if (confirm(`Excluir atendente "${a.nome}"? Esta ação não pode ser desfeita.`)) {
    adminData.atendentes.splice(idx, 1);
    saveData(adminData);
    renderAtendentesTable();
    renderFluxoDetalheTable();
    showToast('Atendente excluído', 'success');
  }
}

function clearAtendForm() {
  ['atend-nome','atend-reg','atend-os','atend-con','atend-abo','atend-pen','atend-rem'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

function buildEmptyDetalhes() {
  const fluxos = [
    'SEM INTERNET','SEM INTERNET FILIAIS','LENTIDÃO','LENTIDÃO FILIAIS','TROCA DE SENHA',
    'SERVIÇO SOLICITADO PELO CLIENTE','SERVIÇO SOLICITADO PELO CLIENTE FILIAIS',
    'TROCA DE EQUIPAMENTO','TROCA DE EQUIPAMENTO FILIAIS','MUDANÇA DE CÔMODO','MUDANÇA DE CÔMODO FILIAIS'
  ];
  return fluxos.map(f => ({ fluxo: f, registrados: 0, os_abertas: 0, concluidas: 0, abortados: 0, pendentes: 0, sol_remota: 0 }));
}

// ═══ DETALHES DE FLUXO POR ATENDENTE ═════════════════════════════════════
function renderFluxoDetalheTable() {
  const sel = document.getElementById('selectAtendFluxo');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '';
  adminData.atendentes.forEach((a, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = a.nome;
    if (String(i) === cur) opt.selected = true;
    sel.appendChild(opt);
  });
  renderFluxoDetalheRows();
}

function renderFluxoDetalheRows() {
  const sel = document.getElementById('selectAtendFluxo');
  const idx = parseInt(sel?.value || 0);
  const a = adminData.atendentes[idx];
  if (!a) return;

  document.getElementById('fluxoDetalheTitle').textContent = `Fluxos — ${a.nome}`;
  const tbody = document.getElementById('fluxoDetalheBody');
  tbody.innerHTML = '';

  a.detalhes.forEach((d, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size:12px">${d.fluxo}</td>
      <td>${d.registrados}</td>
      <td>${d.os_abertas}</td>
      <td>${d.concluidas}</td>
      <td>${d.abortados}</td>
      <td>${d.pendentes}</td>
      <td>${d.sol_remota}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openEditFluxoDetalhe(${idx},${i})">✏️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openEditFluxoDetalhe(atendIdx, fluxIdx) {
  editingFluxoAtendIdx = atendIdx;
  editingFluxoIdx = fluxIdx;
  const d = adminData.atendentes[atendIdx].detalhes[fluxIdx];
  document.getElementById('modalFluxoTitle').textContent = `✏️ Editar — ${d.fluxo}`;
  document.getElementById('fluxo-nome').value = d.fluxo;
  document.getElementById('fluxo-reg').value = d.registrados;
  document.getElementById('fluxo-os').value = d.os_abertas;
  document.getElementById('fluxo-con').value = d.concluidas;
  document.getElementById('fluxo-abo').value = d.abortados;
  document.getElementById('fluxo-pen').value = d.pendentes;
  document.getElementById('fluxo-rem').value = d.sol_remota;
  openModal('modalFluxoDetalhe');
}

function saveFluxoDetalhe() {
  const nome = document.getElementById('fluxo-nome').value.trim();
  const reg  = parseInt(document.getElementById('fluxo-reg').value) || 0;
  const os   = parseInt(document.getElementById('fluxo-os').value) || 0;
  const con  = parseInt(document.getElementById('fluxo-con').value) || 0;
  const abo  = parseInt(document.getElementById('fluxo-abo').value) || 0;
  const pen  = parseInt(document.getElementById('fluxo-pen').value) || 0;
  const rem  = parseInt(document.getElementById('fluxo-rem').value) || 0;

  if (!nome) { showToast('Nome obrigatório', 'error'); return; }

  adminData.atendentes[editingFluxoAtendIdx].detalhes[editingFluxoIdx] = { fluxo: nome, registrados: reg, os_abertas: os, concluidas: con, abortados: abo, pendentes: pen, sol_remota: rem };

  // Recalculate atendente totals
  recalcAtendente(editingFluxoAtendIdx);

  saveData(adminData);
  closeModal('modalFluxoDetalhe');
  renderFluxoDetalheRows();
  renderAtendentesTable();
  showToast('Fluxo atualizado!', 'success');
}

function recalcAtendente(idx) {
  const a = adminData.atendentes[idx];
  a.registrados = a.detalhes.reduce((s, d) => s + d.registrados, 0);
  a.os_abertas  = a.detalhes.reduce((s, d) => s + d.os_abertas, 0);
  a.concluidas  = a.detalhes.reduce((s, d) => s + d.concluidas, 0);
  a.abortados   = a.detalhes.reduce((s, d) => s + d.abortados, 0);
  a.pendentes   = a.detalhes.reduce((s, d) => s + d.pendentes, 0);
  a.sol_remota  = a.detalhes.reduce((s, d) => s + d.sol_remota, 0);
}

// ═══ RELATÓRIO GERAL ══════════════════════════════════════════════════════
function renderGeralTable() {
  const tbody = document.getElementById('geralAdminBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  adminData.relatorio_geral.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size:12px">${r.fluxo}</td>
      <td>${r.registrados}</td>
      <td>${r.os_abertas}</td>
      <td>${r.concluidas}</td>
      <td>${r.abortados}</td>
      <td>${r.pendentes}</td>
      <td>${r.sol_remota}</td>
      <td>
        <div class="actions-col">
          <button class="btn btn-outline btn-sm" onclick="openEditGeral(${i})">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteGeral(${i})">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openNewGeral() {
  editingGeralIdx = null;
  document.getElementById('modalGeralTitle').textContent = '➕ Novo Fluxo';
  clearGeralForm();
  openModal('modalGeral');
}

function openEditGeral(idx) {
  editingGeralIdx = idx;
  const r = adminData.relatorio_geral[idx];
  document.getElementById('modalGeralTitle').textContent = `✏️ Editar — ${r.fluxo}`;
  document.getElementById('geral-fluxo').value = r.fluxo;
  document.getElementById('geral-reg').value = r.registrados;
  document.getElementById('geral-os').value = r.os_abertas;
  document.getElementById('geral-con').value = r.concluidas;
  document.getElementById('geral-abo').value = r.abortados;
  document.getElementById('geral-pen').value = r.pendentes;
  document.getElementById('geral-rem').value = r.sol_remota;
  openModal('modalGeral');
}

function saveGeral() {
  const fluxo = document.getElementById('geral-fluxo').value.trim();
  const reg   = parseInt(document.getElementById('geral-reg').value) || 0;
  const os    = parseInt(document.getElementById('geral-os').value) || 0;
  const con   = parseInt(document.getElementById('geral-con').value) || 0;
  const abo   = parseInt(document.getElementById('geral-abo').value) || 0;
  const pen   = parseInt(document.getElementById('geral-pen').value) || 0;
  const rem   = parseInt(document.getElementById('geral-rem').value) || 0;

  if (!fluxo) { showToast('Nome do fluxo obrigatório', 'error'); return; }

  const obj = { fluxo, registrados: reg, os_abertas: os, concluidas: con, abortados: abo, pendentes: pen, sol_remota: rem };

  if (editingGeralIdx !== null) {
    adminData.relatorio_geral[editingGeralIdx] = obj;
    showToast('Fluxo atualizado!', 'success');
  } else {
    adminData.relatorio_geral.push(obj);
    showToast('Fluxo adicionado!', 'success');
  }

  saveData(adminData);
  closeModal('modalGeral');
  renderGeralTable();
}

function confirmDeleteGeral(idx) {
  const r = adminData.relatorio_geral[idx];
  if (confirm(`Excluir "${r.fluxo}"?`)) {
    adminData.relatorio_geral.splice(idx, 1);
    saveData(adminData);
    renderGeralTable();
    showToast('Fluxo excluído', 'success');
  }
}

function clearGeralForm() {
  ['geral-fluxo','geral-reg','geral-os','geral-con','geral-abo','geral-pen','geral-rem'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

// ═══ RESET ════════════════════════════════════════════════════════════════
function confirmReset() {
  if (confirm('⚠️ Restaurar todos os dados para os valores originais da planilha?\n\nEsta ação apagará todas as alterações salvas.')) {
    adminData = resetData();
    saveData(adminData);
    renderAtendentesTable();
    renderFluxoDetalheTable();
    renderGeralTable();
    renderPeriodo();
    showToast('✅ Dados restaurados com sucesso!', 'success');
  }
}

// ═══ MODAL ════════════════════════════════════════════════════════════════
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

// Close modal clicking overlay
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ═══ TOAST ════════════════════════════════════════════════════════════════
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = (type === 'success' ? '✅ ' : '❌ ') + msg;
  t.className = `show ${type}`;
  setTimeout(() => t.className = '', 3000);
}

document.addEventListener('DOMContentLoaded', adminInit);

// ═══════════════════════════════════════════════════════════════════════════
// ═══ IMPORTAÇÃO DE EXCEL ══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════

const FLUXO_MAP = {
  'SEM INTERNET':                           { key: 'SEM INTERNET',                           geral_matriz: 'SEM INTERNET — MATRIZ',        geral_filiais: null },
  'SEM INTERNET FILIAIS':                   { key: 'SEM INTERNET FILIAIS',                   geral_matriz: null,                            geral_filiais: 'SEM INTERNET — FILIAIS' },
  'LENTIDÃO':                               { key: 'LENTIDÃO',                               geral_matriz: 'LENTIDÃO — MATRIZ',             geral_filiais: null },
  'LENTIDÃO FILIAIS':                       { key: 'LENTIDÃO FILIAIS',                       geral_matriz: null,                            geral_filiais: 'LENTIDÃO — FILIAIS' },
  'TROCA DE SENHA':                         { key: 'TROCA DE SENHA',                         geral_matriz: 'TROCA DE SENHA',                geral_filiais: null },
  'SERVIÇO SOLICITADO PELO CLIENTE':        { key: 'SERVIÇO SOLICITADO PELO CLIENTE',        geral_matriz: 'SERVIÇO SOLICITADO — MATRIZ',   geral_filiais: null },
  'SERVIÇO SOLICITADO PELO CLIENTE FILIAIS':{ key: 'SERVIÇO SOLICITADO PELO CLIENTE FILIAIS',geral_matriz: null,                            geral_filiais: 'SERVIÇO SOLICITADO — FILIAIS' },
  // Grafia correta
  'TROCA DE EQUIPAMENTO':                   { key: 'TROCA DE EQUIPAMENTO',                   geral_matriz: 'TROCA DE EQUIPAMENTO — MATRIZ', geral_filiais: null },
  'TROCA DE EQUIPAMENTO FILIAIS':           { key: 'TROCA DE EQUIPAMENTO FILIAIS',           geral_matriz: null,                            geral_filiais: 'TROCA DE EQUIPAMENTO — FILIAIS' },
  // Grafia com erro de digitação presente na planilha (EQUIPAMNETO)
  'TROCA DE EQUIPAMNETO':                   { key: 'TROCA DE EQUIPAMENTO',                   geral_matriz: 'TROCA DE EQUIPAMENTO — MATRIZ', geral_filiais: null },
  'TROCA DE EQUIPAMNETO FILIAIS':           { key: 'TROCA DE EQUIPAMENTO',                   geral_matriz: null,                            geral_filiais: 'TROCA DE EQUIPAMENTO — FILIAIS' },
  'MUDANÇA DE CÔMODO':                      { key: 'MUDANÇA DE CÔMODO',                      geral_matriz: 'MUDANÇA DE CÔMODO — MATRIZ',    geral_filiais: null },
  'MUDANÇA DE CÔMODO FILIAIS':              { key: 'MUDANÇA DE CÔMODO FILIAIS',              geral_matriz: null,                            geral_filiais: 'MUDANÇA DE CÔMODO — FILIAIS' },
};

function normalizeFluxoKey(str) {
  return (str || '').toString().trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/\s*\/\s*/g, ' / ')   // normaliza espaços em torno de "/"
    .replace(/\s+/g, ' ');         // colapsa múltiplos espaços
}

function num(v) {
  const n = parseInt(v);
  return isNaN(n) ? 0 : n;
}

function loadExcelFile() {
  const file = document.getElementById('excelFileInput').files[0];
  if (!file) { showToast('Selecione um arquivo .xlsx', 'error'); return; }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const preview = parseExcelData(wb);
      if (!preview) return;
      showExcelPreview(preview, wb);
    } catch(err) {
      showToast('Erro ao ler o arquivo: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseExcelData(wb) {
  // ── Mapeamento de colunas aceitas (normalizado, sem acento) ──────────────
  const COL_MAP = {
    'ATENDENTE':        'atendente',
    'FLUXO':            'fluxo',
    'FLUXO / TOPICO':   'fluxo',   // cabeçalho real da planilha
    'FLUXO/TOPICO':     'fluxo',
    'REGISTRADOS':      'registrados',
    'OS ABERTAS':       'os_abertas',
    'CONCLUIDAS':       'concluidas',
    'ABORTADOS':        'abortados',
    'PENDENTES':        'pendentes',
    'SOL. REMOTA':      'sol_remota',
    'SOL REMOTA':       'sol_remota',
  };

  const geralAcc = {};

  // ── Tenta detectar formato da planilha ───────────────────────────────────
  // FORMATO A (novo): aba única com coluna ATENDENTE (ex: "📋 BASE DADOS")
  // FORMATO B (legado): uma aba por atendente, sem coluna ATENDENTE

  let result = tryParseFormatoA(wb, COL_MAP, geralAcc)
            || tryParseFormatoB(wb, COL_MAP, geralAcc);

  if (!result) {
    showToast('Nenhuma aba válida encontrada. Verifique se as colunas estão corretas.', 'error');
    return null;
  }

  const { atendentes } = result;

  // ── Ordena e monta o relatório geral ─────────────────────────────────────
  const ORDEM_GERAL = [
    'LENTIDÃO — MATRIZ','LENTIDÃO — FILIAIS',
    'SEM INTERNET — MATRIZ','SEM INTERNET — FILIAIS',
    'TROCA DE SENHA',
    'SERVIÇO SOLICITADO — MATRIZ','SERVIÇO SOLICITADO — FILIAIS',
    'TROCA DE EQUIPAMENTO — MATRIZ','TROCA DE EQUIPAMENTO — FILIAIS',
    'MUDANÇA DE CÔMODO — MATRIZ','MUDANÇA DE CÔMODO — FILIAIS',
  ];
  const relatorio_geral = ORDEM_GERAL
    .filter(k => geralAcc[k])
    .map(k => geralAcc[k]);

  return { atendentes, relatorio_geral };
}

// ── FORMATO A: aba única com coluna ATENDENTE ────────────────────────────
// Estrutura: ATENDENTE | FLUXO / TÓPICO | REGISTRADOS | OS ABERTAS | ...
function tryParseFormatoA(wb, COL_MAP, geralAcc) {
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows.length) continue;

    // Procura cabeçalho com coluna ATENDENTE nas primeiras 10 linhas
    let headerRow = -1, headerIdx = {};
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const normalized = rows[i].map(c => normalizeFluxoKey(c));
      if (normalized.includes('ATENDENTE')) {
        headerRow = i;
        normalized.forEach((col, idx) => {
          const mapped = COL_MAP[col];
          if (mapped && !(mapped in headerIdx)) headerIdx[mapped] = idx;
        });
        break;
      }
    }
    if (headerRow === -1 || !('atendente' in headerIdx) || !('fluxo' in headerIdx)) continue;

    // Agrupa linhas por atendente
    const byAtendente = {};
    const ordem = [];

    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      const atendenteRaw = normalizeFluxoKey(row[headerIdx.atendente]);
      const fluxoRaw     = normalizeFluxoKey(row[headerIdx.fluxo]);

      if (!atendenteRaw && !fluxoRaw) continue;

      // Linha de total geral (sem atendente, só números)
      if (!atendenteRaw && fluxoRaw.includes('TOTAL')) continue;

      // Linha com nome de atendente mas sem fluxo = cabeçalho de grupo (ignora)
      if (atendenteRaw && !fluxoRaw) continue;

      // Usa o último atendente visto se a célula estiver vazia (merge visual)
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

// ── FORMATO B (legado): uma aba por atendente ─────────────────────────────
// Estrutura: aba com nome do atendente, coluna FLUXO, sem coluna ATENDENTE
function tryParseFormatoB(wb, COL_MAP, geralAcc) {
  const ABAS_IGNORADAS = ['RELATORIO GERAL', 'RELATÓRIO GERAL', 'INSIGHTS', 'DINAMIC', 'DASHBOARD', 'BASE DADOS', 'BASE DE DADOS'];
  const atendentes = [];

  for (const sheetName of wb.SheetNames) {
    // Ignora abas de sistema
    if (ABAS_IGNORADAS.some(ign => normalizeFluxoKey(sheetName).includes(ign))) continue;

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows.length) continue;

    // Procura cabeçalho com FLUXO (sem ATENDENTE)
    let headerRow = -1, headerIdx = {};
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const normalized = rows[i].map(c => normalizeFluxoKey(c));
      if (normalized.some(c => c === 'FLUXO' || c === 'FLUXO / TOPICO' || c === 'FLUXO/TOPICO')) {
        headerRow = i;
        normalized.forEach((col, idx) => {
          const mapped = COL_MAP[col];
          if (mapped && !(mapped in headerIdx)) headerIdx[mapped] = idx;
        });
        break;
      }
    }
    if (headerRow === -1 || !('fluxo' in headerIdx)) continue;

    const grupo = {};
    grupo[sheetName.trim().toUpperCase()] = [];
    for (let i = headerRow + 1; i < rows.length; i++) {
      grupo[sheetName.trim().toUpperCase()].push(rows[i]);
    }

    const result = buildAtendentesFromGroups(grupo, [sheetName.trim().toUpperCase()], headerIdx, geralAcc);
    atendentes.push(...result);
  }

  return atendentes.length ? { atendentes } : null;
}

// ── Constrói objetos de atendente a partir dos grupos de linhas ───────────
function buildAtendentesFromGroups(byAtendente, ordem, headerIdx, geralAcc) {
  const atendentes = [];

  for (const nome of ordem) {
    const rows = byAtendente[nome];
    const detalhes = [];
    let totalRow = null;

    for (const row of rows) {
      const fluxoRaw = normalizeFluxoKey(row[headerIdx.fluxo]);
      if (!fluxoRaw) continue;

      if (fluxoRaw.includes('TOTAL')) { totalRow = row; continue; }

      // Normaliza o nome do fluxo (aceita erros de digitação como EQUIPAMNETO)
      const matched = Object.keys(FLUXO_MAP).find(k => normalizeFluxoKey(k) === fluxoRaw);
      const fluxoNome = matched || row[headerIdx.fluxo].toString().trim().toUpperCase();

      const d = {
        fluxo:       fluxoNome,
        registrados: num(row[headerIdx.registrados]),
        os_abertas:  num(row[headerIdx.os_abertas]),
        concluidas:  num(row[headerIdx.concluidas]),
        abortados:   num(row[headerIdx.abortados]),
        pendentes:   num(row[headerIdx.pendentes]),
        sol_remota:  num(row[headerIdx.sol_remota]),
      };
      detalhes.push(d);

      // Acumula no relatório geral
      const mapa = FLUXO_MAP[matched];
      if (mapa) {
        const geralKey = mapa.geral_matriz || mapa.geral_filiais;
        if (geralKey) {
          if (!geralAcc[geralKey]) {
            geralAcc[geralKey] = { fluxo: geralKey, registrados: 0, os_abertas: 0, concluidas: 0, abortados: 0, pendentes: 0, sol_remota: 0 };
          }
          geralAcc[geralKey].registrados += d.registrados;
          geralAcc[geralKey].os_abertas  += d.os_abertas;
          geralAcc[geralKey].concluidas  += d.concluidas;
          geralAcc[geralKey].abortados   += d.abortados;
          geralAcc[geralKey].pendentes   += d.pendentes;
          geralAcc[geralKey].sol_remota  += d.sol_remota;
        }
      }
    }

    const totais = totalRow ? {
      registrados: num(totalRow[headerIdx.registrados]),
      os_abertas:  num(totalRow[headerIdx.os_abertas]),
      concluidas:  num(totalRow[headerIdx.concluidas]),
      abortados:   num(totalRow[headerIdx.abortados]),
      pendentes:   num(totalRow[headerIdx.pendentes]),
      sol_remota:  num(totalRow[headerIdx.sol_remota]),
    } : {
      registrados: detalhes.reduce((s, d) => s + d.registrados, 0),
      os_abertas:  detalhes.reduce((s, d) => s + d.os_abertas, 0),
      concluidas:  detalhes.reduce((s, d) => s + d.concluidas, 0),
      abortados:   detalhes.reduce((s, d) => s + d.abortados, 0),
      pendentes:   detalhes.reduce((s, d) => s + d.pendentes, 0),
      sol_remota:  detalhes.reduce((s, d) => s + d.sol_remota, 0),
    };

    if (detalhes.length) atendentes.push({ nome, ...totais, detalhes });
  }

  return atendentes;
}

function showExcelPreview(parsed, wb) {
  const container = document.getElementById('excelPreviewArea');
  const { atendentes, relatorio_geral } = parsed;
  const totalReg = atendentes.reduce((s, a) => s + a.registrados, 0);
  const totalCon = atendentes.reduce((s, a) => s + a.concluidas, 0);
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
  atendentes.forEach(a => {
    const t = a.registrados > 0 ? ((a.concluidas / a.registrados) * 100).toFixed(1) : 0;
    html += `<tr>
      <td><strong>${a.nome}</strong></td>
      <td class="num-col">${a.registrados}</td>
      <td class="num-col">${a.concluidas}</td>
      <td class="num-col">${a.abortados}</td>
      <td class="num-col">${a.pendentes}</td>
      <td class="num-col">${a.sol_remota}</td>
      <td class="num-col">${t}%</td>
    </tr>`;
  });
  html += `
        <tr style="font-weight:bold;color:var(--cyan)">
          <td>TOTAL</td>
          <td class="num-col">${totalReg}</td>
          <td class="num-col">${totalCon}</td>
          <td class="num-col">${atendentes.reduce((s,a)=>s+a.abortados,0)}</td>
          <td class="num-col">${atendentes.reduce((s,a)=>s+a.pendentes,0)}</td>
          <td class="num-col">${atendentes.reduce((s,a)=>s+a.sol_remota,0)}</td>
          <td class="num-col">${taxa}%</td>
        </tr>
        </tbody>
      </table>
      <p style="color:var(--txt-2);font-size:13px">✅ ${relatorio_geral.length} fluxo(s) no relatório geral gerado automaticamente.</p>
      <div style="display:flex;gap:10px;margin-top:12px;align-items:center;flex-wrap:wrap">
        <label style="color:var(--txt-2);font-size:13px">Nome do período:</label>
        <input id="importPeriodoInput" class="form-control" style="width:200px" placeholder="ex: 01/06 a 30/06" />
        <button class="btn btn-primary" onclick="confirmImport(${JSON.stringify(parsed).split('"').join('&quot;')})">✅ Confirmar Importação</button>
        <button class="btn btn-outline" onclick="cancelImport()">✖ Cancelar</button>
      </div>
    </div>
  `;
  container.innerHTML = html;
  container.style.display = 'block';

  // Guarda parsed no estado temporário para o confirm
  window._pendingImport = parsed;
}

function confirmImport() {
  const parsed = window._pendingImport;
  if (!parsed) return;

  const periodoInput = document.getElementById('importPeriodoInput').value.trim();
  const periodo = periodoInput || adminData.periodo;

  // Salva no histórico antes de sobrescrever
  const snapshot = JSON.parse(JSON.stringify(adminData));
  saveSnapshot(snapshot);

  // Aplica os novos dados
  adminData.atendentes     = parsed.atendentes;
  adminData.relatorio_geral = parsed.relatorio_geral;
  adminData.periodo        = periodo;

  saveData(adminData);

  // Atualiza todas as tabelas admin
  renderAtendentesTable();
  renderFluxoDetalheTable();
  renderGeralTable();
  renderPeriodo();
  renderHistoricoTable();

  cancelImport();
  showToast(`✅ Dados de "${periodo}" importados com sucesso!`, 'success');
}

function cancelImport() {
  const area = document.getElementById('excelPreviewArea');
  if (area) { area.innerHTML = ''; area.style.display = 'none'; }
  window._pendingImport = null;
  const input = document.getElementById('excelFileInput');
  if (input) input.value = '';
}

// ═══════════════════════════════════════════════════════════════════════════
// ═══ HISTÓRICO DE RELATÓRIOS ══════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════

const HISTORY_KEY = 'suporte_dashboard_history';

function loadHistory() {
  try {
    const h = localStorage.getItem(HISTORY_KEY);
    return h ? JSON.parse(h) : [];
  } catch(e) { return []; }
}

function saveSnapshot(snapshot) {
  const history = loadHistory();
  const entry = {
    id: Date.now(),
    periodo: snapshot.periodo || '—',
    savedAt: new Date().toLocaleString('pt-BR'),
    data: snapshot,
  };
  history.unshift(entry); // mais recente primeiro
  // Manter máximo 24 snapshots
  if (history.length > 24) history.splice(24);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function renderHistoricoTable() {
  const tbody = document.getElementById('historicoBody');
  if (!tbody) return;
  const history = loadHistory();
  tbody.innerHTML = '';

  if (!history.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--txt-2);padding:24px">Nenhum relatório salvo ainda.</td></tr>';
    return;
  }

  history.forEach((entry, i) => {
    const totalReg = entry.data.atendentes.reduce((s, a) => s + a.registrados, 0);
    const totalCon = entry.data.atendentes.reduce((s, a) => s + a.concluidas, 0);
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
          <button class="btn btn-danger btn-sm" onclick="deleteSnapshot(${entry.id})">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function saveCurrentSnapshot() {
  saveSnapshot(JSON.parse(JSON.stringify(adminData)));
  renderHistoricoTable();
  showToast('Relatório salvo no histórico!', 'success');
}

function loadSnapshot(id) {
  const history = loadHistory();
  const entry = history.find(e => e.id === id);
  if (!entry) { showToast('Relatório não encontrado', 'error'); return; }

  if (!confirm(`Carregar o relatório de "${entry.periodo}"?\nOs dados atuais serão substituídos (mas continuam no histórico).`)) return;

  // Salva estado atual antes de substituir
  saveSnapshot(JSON.parse(JSON.stringify(adminData)));

  adminData = JSON.parse(JSON.stringify(entry.data));
  saveData(adminData);

  renderAtendentesTable();
  renderFluxoDetalheTable();
  renderGeralTable();
  renderPeriodo();
  renderHistoricoTable();
  showToast(`Relatório de "${entry.periodo}" carregado!`, 'success');
}

function viewSnapshotOnDashboard(id) {
  const history = loadHistory();
  const entry = history.find(e => e.id === id);
  if (!entry) { showToast('Relatório não encontrado', 'error'); return; }

  // Grava o snapshot na sessionStorage via a função do data.js
  setViewingSnapshot(entry.data);

  // Abre o dashboard em nova aba (ou redireciona na mesma)
  const dashUrl = 'index.html';
  const newTab = window.open(dashUrl, '_blank');
  if (!newTab) {
    // Popup bloqueado — redireciona na mesma aba
    window.location.href = dashUrl;
  } else {
    showToast(`Abrindo dashboard com período "${entry.periodo}"…`, 'success');
  }
}

function deleteSnapshot(id) {
  const history = loadHistory();
  const entry = history.find(e => e.id === id);
  if (!entry) return;
  if (!confirm(`Excluir o relatório de "${entry.periodo}" do histórico?`)) return;
  const updated = history.filter(e => e.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  renderHistoricoTable();
  showToast('Relatório removido do histórico', 'success');
}

function clearHistory() {
  if (!confirm('⚠️ Apagar TODO o histórico de relatórios? Esta ação não pode ser desfeita.')) return;
  localStorage.removeItem(HISTORY_KEY);
  renderHistoricoTable();
  showToast('Histórico apagado', 'success');
}