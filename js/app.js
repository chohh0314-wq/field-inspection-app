// 현장 점검 앱 — 메인 로직
const STORAGE_KEY = 'inspection_session_v1';

let state = null;        // 현재 점검 세션 상태
let parsedCsv = null;    // 업로드 직후, 점검 시작 전 임시 파싱 결과

// ---------- 저장/복원 ----------
function saveState() {
  if (!state) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('저장 실패(용량 초과 가능):', e);
    alert('저장 공간이 부족합니다. 사진 용량이 큰 항목을 확인해주세요.');
  }
}

function loadSavedState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearSavedState() {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------- CSV 업로드 처리 ----------
function parseCsvToState(text, fileName) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('CSV에 데이터가 충분하지 않습니다.');

  const header = rows[0];
  const firstColName = (header[0] || '구분').trim() || '구분';
  const headers = header.slice(1).map(h => h.trim()).filter(h => h !== '');
  if (headers.length === 0) throw new Error('점검항목(열)을 찾을 수 없습니다.');

  const targets = [];
  const refMap = {};
  const records = {};

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const target = (r[0] || '').trim();
    if (!target) continue;
    targets.push(target);
    refMap[target] = {};
    records[target] = {};
    headers.forEach((item, idx) => {
      refMap[target][item] = (r[idx + 1] || '').trim();
      records[target][item] = { value: '', status: null, memo: '', photo: null, timestamp: null };
    });
  }
  if (targets.length === 0) throw new Error('점검 대상(행)을 찾을 수 없습니다.');

  return { firstColName, headers, targets, refMap, records, csvFileName: fileName };
}

const fileInput = document.getElementById('csv-input');
const fileDropText = document.getElementById('file-drop-text');
const csvPreview = document.getElementById('csv-preview');
const csvError = document.getElementById('csv-error');
const inspectorInput = document.getElementById('inspector-input');
const btnStart = document.getElementById('btn-start');

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  csvError.hidden = true;
  csvPreview.hidden = true;
  try {
    const text = await readCsvFile(file);
    const parsed = parseCsvToState(text, file.name);
    parsedCsv = parsed;
    fileDropText.textContent = file.name;
    csvPreview.hidden = false;
    csvPreview.innerHTML =
      `<strong>${parsed.targets.length}개</strong> 점검대상 · <strong>${parsed.headers.length}개</strong> 점검항목 감지됨` +
      `<div class="muted small">대상 예: ${parsed.targets.slice(0, 3).join(', ')}${parsed.targets.length > 3 ? ' …' : ''}</div>` +
      `<div class="muted small">항목 예: ${parsed.headers.slice(0, 3).join(', ')}${parsed.headers.length > 3 ? ' …' : ''}</div>`;
    updateStartButton();
  } catch (e) {
    parsedCsv = null;
    csvError.hidden = false;
    csvError.textContent = 'CSV를 읽을 수 없습니다: ' + e.message;
    updateStartButton();
  }
});

inspectorInput.addEventListener('input', updateStartButton);

function updateStartButton() {
  btnStart.disabled = !(parsedCsv && inspectorInput.value.trim());
}

btnStart.addEventListener('click', () => {
  if (!parsedCsv) return;
  state = {
    ...parsedCsv,
    inspector: inspectorInput.value.trim(),
    startedAt: new Date().toISOString(),
  };
  saveState();
  renderInspectScreen();
  showScreen('inspect');
});

// ---------- 이어하기 배너 ----------
const resumeBanner = document.getElementById('resume-banner');
const resumeTitle = document.getElementById('resume-title');
const resumeSub = document.getElementById('resume-sub');

function checkResume() {
  const saved = loadSavedState();
  if (!saved) {
    resumeBanner.hidden = true;
    return;
  }
  const { done, total } = countProgress(saved);
  resumeTitle.textContent = `${saved.csvFileName || '이전 점검'} (${saved.inspector})`;
  resumeSub.textContent = `${done}/${total}건 완료 · ${new Date(saved.startedAt).toLocaleString()}`;
  resumeBanner.hidden = false;
}

document.getElementById('btn-resume').addEventListener('click', () => {
  state = loadSavedState();
  if (!state) return;
  renderInspectScreen();
  showScreen('inspect');
});

document.getElementById('btn-discard').addEventListener('click', () => {
  if (!confirm('이전 점검 기록을 삭제할까요? 되돌릴 수 없습니다.')) return;
  clearSavedState();
  resumeBanner.hidden = true;
});

function countProgress(s) {
  let done = 0, total = 0;
  for (const t of s.targets) {
    for (const item of s.headers) {
      total++;
      if (s.records[t][item].status) done++;
    }
  }
  return { done, total };
}

// ---------- 화면 전환 ----------
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  window.scrollTo(0, 0);
}

document.getElementById('btn-back-upload').addEventListener('click', () => showScreen('upload'));
document.getElementById('btn-back-inspect').addEventListener('click', () => showScreen('inspect'));
document.getElementById('btn-goto-review').addEventListener('click', () => {
  renderReviewScreen();
  showScreen('review');
});

// ---------- 점검 화면 렌더링 ----------
const targetList = document.getElementById('target-list');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');

function sanitizeName(s) {
  return String(s).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
}

function renderInspectScreen() {
  targetList.innerHTML = '';
  state.targets.forEach((target, tIdx) => {
    const details = document.createElement('details');
    details.className = 'target-card';
    details.open = tIdx === 0;

    const summary = document.createElement('summary');
    summary.innerHTML = `<span class="target-name">${escapeHtml(target)}</span><span class="badge" data-badge-for="${tIdx}"></span>`;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'target-body';

    state.headers.forEach(item => {
      body.appendChild(renderItemRow(target, item));
    });

    details.appendChild(body);
    targetList.appendChild(details);
  });
  updateAllProgress();
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function renderItemRow(target, item) {
  const rec = state.records[target][item];
  const ref = (state.refMap[target] && state.refMap[target][item]) || '';

  const row = document.createElement('div');
  row.className = 'item-row';
  row.dataset.target = target;
  row.dataset.item = item;

  row.innerHTML = `
    <div class="item-head">
      <span class="item-name">${escapeHtml(item)}</span>
      ${ref ? `<span class="item-ref">기준: ${escapeHtml(ref)}</span>` : ''}
    </div>
    <div class="status-buttons">
      <button type="button" class="status-btn good" data-status="양호">양호</button>
      <button type="button" class="status-btn bad" data-status="불량">불량</button>
      <button type="button" class="status-btn na" data-status="해당없음">해당없음</button>
    </div>
    <input type="text" class="text-input value-input" placeholder="측정값 (선택, 예: 0.25MPa)" value="${escapeHtml(rec.value)}">
    <div class="memo-wrap" ${rec.status === '불량' ? '' : 'hidden'}>
      <textarea class="text-input memo-input" placeholder="불량 내용/메모 (필수)">${escapeHtml(rec.memo)}</textarea>
    </div>
    <div class="photo-wrap">
      <label class="btn secondary photo-btn">
        ${rec.photo ? '사진 다시 찍기' : '사진 촬영/첨부'}
        <input type="file" accept="image/*" capture="environment" class="photo-input" hidden>
      </label>
      <div class="photo-preview" ${rec.photo ? '' : 'hidden'}>
        <img src="${rec.photo ? rec.photo.dataUrl : ''}">
        <div class="gps-info muted small">${rec.photo ? gpsText(rec.photo) : ''}</div>
        <button type="button" class="btn ghost small photo-remove">사진 삭제</button>
      </div>
    </div>
  `;

  // 상태 버튼 active 표시
  if (rec.status) {
    row.querySelector(`.status-btn[data-status="${rec.status}"]`).classList.add('active');
  }

  return row;
}

function gpsText(photo) {
  if (!photo.lat) return '위치 정보 없음';
  return `위치: ${photo.lat.toFixed(6)}, ${photo.lng.toFixed(6)} (정확도 ±${Math.round(photo.accuracy || 0)}m)`;
}

// 이벤트 위임 (상태버튼/값입력/메모/사진)
targetList.addEventListener('click', async (e) => {
  const statusBtn = e.target.closest('.status-btn');
  if (statusBtn) {
    const row = statusBtn.closest('.item-row');
    const { target, item } = row.dataset;
    const rec = state.records[target][item];
    rec.status = statusBtn.dataset.status;
    rec.timestamp = new Date().toISOString();
    row.querySelectorAll('.status-btn').forEach(b => b.classList.toggle('active', b === statusBtn));
    row.querySelector('.memo-wrap').hidden = rec.status !== '불량';
    saveState();
    updateAllProgress();
    return;
  }

  const removeBtn = e.target.closest('.photo-remove');
  if (removeBtn) {
    const row = removeBtn.closest('.item-row');
    const { target, item } = row.dataset;
    state.records[target][item].photo = null;
    row.querySelector('.photo-preview').hidden = true;
    row.querySelector('.photo-btn').childNodes[0].textContent = '사진 촬영/첨부';
    saveState();
    return;
  }
});

targetList.addEventListener('input', (e) => {
  const row = e.target.closest('.item-row');
  if (!row) return;
  const { target, item } = row.dataset;
  const rec = state.records[target][item];
  if (e.target.classList.contains('value-input')) {
    rec.value = e.target.value;
    saveState();
  } else if (e.target.classList.contains('memo-input')) {
    rec.memo = e.target.value;
    saveState();
  }
});

targetList.addEventListener('change', async (e) => {
  if (!e.target.classList.contains('photo-input')) return;
  const file = e.target.files[0];
  if (!file) return;
  const row = e.target.closest('.item-row');
  const { target, item } = row.dataset;
  const rec = state.records[target][item];

  const dataUrl = await compressImage(file);
  const loc = await getLocation();

  rec.photo = {
    dataUrl,
    lat: loc ? loc.lat : null,
    lng: loc ? loc.lng : null,
    accuracy: loc ? loc.accuracy : null,
    takenAt: new Date().toISOString(),
  };
  saveState();

  const preview = row.querySelector('.photo-preview');
  preview.hidden = false;
  preview.querySelector('img').src = dataUrl;
  preview.querySelector('.gps-info').textContent = gpsText(rec.photo);
  row.querySelector('.photo-btn').childNodes[0].textContent = '사진 다시 찍기';
});

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const max = 1280;
        if (width > max || height > max) {
          if (width > height) {
            height = Math.round(height * max / width);
            width = max;
          } else {
            width = Math.round(width * max / height);
            height = max;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { timeout: 8000, enableHighAccuracy: true }
    );
  });
}

function updateAllProgress() {
  const { done, total } = countProgress(state);
  progressFill.style.width = total ? `${(done / total) * 100}%` : '0%';
  progressText.textContent = `${done}/${total} 완료`;

  state.targets.forEach((target, tIdx) => {
    let tDone = 0;
    state.headers.forEach(item => {
      if (state.records[target][item].status) tDone++;
    });
    const badge = document.querySelector(`[data-badge-for="${tIdx}"]`);
    if (badge) {
      badge.textContent = `${tDone}/${state.headers.length}`;
      badge.classList.toggle('badge-done', tDone === state.headers.length);
      badge.classList.toggle('badge-partial', tDone > 0 && tDone < state.headers.length);
    }
  });
}

// ---------- 결과/다운로드 화면 ----------
function findBadWithoutMemo() {
  const list = [];
  for (const target of state.targets) {
    for (const item of state.headers) {
      const rec = state.records[target][item];
      if (rec.status === '불량' && !rec.memo.trim()) {
        list.push({ target, item });
      }
    }
  }
  return list;
}

function allBadRecords() {
  const list = [];
  for (const target of state.targets) {
    for (const item of state.headers) {
      const rec = state.records[target][item];
      if (rec.status === '불량') list.push({ target, item, rec });
    }
  }
  return list;
}

function renderReviewScreen() {
  const { done, total } = countProgress(state);
  let good = 0, bad = 0, na = 0;
  for (const target of state.targets) {
    for (const item of state.headers) {
      const st = state.records[target][item].status;
      if (st === '양호') good++;
      else if (st === '불량') bad++;
      else if (st === '해당없음') na++;
    }
  }
  const none = total - done;

  document.getElementById('review-summary').innerHTML = `
    <p><strong>${state.csvFileName}</strong> · 점검자 ${escapeHtml(state.inspector)}</p>
    <p class="muted small">시작: ${new Date(state.startedAt).toLocaleString()}</p>
    <p>총 ${total}건 — 양호 ${good} · 불량 ${bad} · 해당없음 ${na} · 미점검 ${none}</p>
  `;

  const badList = allBadRecords();
  const badListEl = document.getElementById('review-bad-list');
  if (badList.length === 0) {
    badListEl.innerHTML = `<label class="field-label">불량 항목</label><p class="muted">불량 항목이 없습니다.</p>`;
  } else {
    badListEl.innerHTML = `<label class="field-label">불량 항목 (${badList.length})</label>` +
      badList.map(({ target, item, rec }) => `
        <div class="bad-item" data-target="${escapeHtml(target)}" data-item="${escapeHtml(item)}">
          <strong>${escapeHtml(target)}</strong> · ${escapeHtml(item)}
          <div class="muted small">${rec.memo.trim() ? escapeHtml(rec.memo) : '⚠ 메모 없음'}</div>
        </div>
      `).join('');
  }
}

document.getElementById('review-bad-list').addEventListener('click', (e) => {
  const item = e.target.closest('.bad-item');
  if (!item) return;
  jumpToItem(item.dataset.target, item.dataset.item);
});

function jumpToItem(target, item) {
  renderInspectScreen();
  showScreen('inspect');
  const row = document.querySelector(`.item-row[data-target="${CSS.escape(target)}"][data-item="${CSS.escape(item)}"]`);
  if (row) {
    row.closest('details').open = true;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 1500);
  }
}

// ---------- CSV/ZIP 내보내기 ----------
function buildSummaryCSV() {
  const rows = [[state.firstColName, ...state.headers]];
  for (const target of state.targets) {
    rows.push([target, ...state.headers.map(item => state.records[target][item].status || '')]);
  }
  return buildCSV(rows);
}

function buildDetailCSV() {
  const rows = [['구분', '점검항목', '참고기준', '측정값', '상태', '비고', '점검자', '점검일시', '사진파일명', '위도', '경도']];
  state.targets.forEach((target, tIdx) => {
    state.headers.forEach((item, iIdx) => {
      const rec = state.records[target][item];
      const ref = (state.refMap[target] && state.refMap[target][item]) || '';
      const photoName = rec.photo ? `사진/${tIdx}_${iIdx}_${sanitizeName(target)}_${sanitizeName(item)}.jpg` : '';
      rows.push([
        target, item, ref, rec.value, rec.status || '', rec.memo,
        state.inspector, rec.timestamp || '', photoName,
        rec.photo && rec.photo.lat != null ? rec.photo.lat : '',
        rec.photo && rec.photo.lng != null ? rec.photo.lng : '',
      ]);
    });
  });
  return buildCSV(rows);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

document.getElementById('btn-export-summary').addEventListener('click', () => {
  if (!validateBeforeExport()) return;
  const blob = csvToBlob(buildSummaryCSV());
  downloadBlob(blob, `점검결과_요약_${timestampForFile()}.csv`);
});

document.getElementById('btn-export-zip').addEventListener('click', () => {
  if (!validateBeforeExport()) return;

  const files = [];
  files.push({ name: '요약.csv', data: new TextEncoder().encode('﻿' + buildSummaryCSV()) });
  files.push({ name: '상세.csv', data: new TextEncoder().encode('﻿' + buildDetailCSV()) });

  state.targets.forEach((target, tIdx) => {
    state.headers.forEach((item, iIdx) => {
      const rec = state.records[target][item];
      if (rec.photo) {
        files.push({
          name: `사진/${tIdx}_${iIdx}_${sanitizeName(target)}_${sanitizeName(item)}.jpg`,
          data: dataUrlToBytes(rec.photo.dataUrl),
        });
      }
    });
  });

  const blob = createZipBlob(files);
  downloadBlob(blob, `점검결과_${timestampForFile()}.zip`);
});

function validateBeforeExport() {
  const missing = findBadWithoutMemo();
  if (missing.length > 0) {
    alert(`불량 항목 중 메모가 없는 항목이 ${missing.length}건 있습니다.\n첫 항목: ${missing[0].target} - ${missing[0].item}\n메모를 입력한 뒤 다시 시도해주세요.`);
    jumpToItem(missing[0].target, missing[0].item);
    return false;
  }
  return true;
}

document.getElementById('btn-reset').addEventListener('click', () => {
  if (!confirm('현재 점검 기록을 삭제하고 새로 시작할까요? 되돌릴 수 없습니다.')) return;
  clearSavedState();
  state = null;
  parsedCsv = null;
  fileInput.value = '';
  fileDropText.textContent = 'CSV 파일 선택';
  csvPreview.hidden = true;
  inspectorInput.value = '';
  updateStartButton();
  checkResume();
  showScreen('upload');
});

// ---------- 초기화 ----------
checkResume();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
