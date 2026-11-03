// CSV 읽기/쓰기 유틸리티

// 파일을 읽어서 텍스트로 변환 (UTF-8 / EUC-KR(CP949) 자동 감지)
async function readCsvFile(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // UTF-8 BOM 체크
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.slice(3));
  }

  // UTF-8로 먼저 시도, 깨짐(치환문자) 발견되면 EUC-KR로 재시도
  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (!utf8Text.includes('�')) {
    return utf8Text;
  }
  try {
    return new TextDecoder('euc-kr').decode(bytes);
  } catch (e) {
    return utf8Text;
  }
}

// RFC4180 스타일 CSV 파서 (쉼표/줄바꿈 포함 필드의 쌍따옴표 처리)
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // 개행 통일
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
  }
  // 마지막 필드/행 처리
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // 완전히 빈 행 제거 (모든 셀이 공백)
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

// 값 하나를 CSV 필드로 안전하게 escape
function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// 2차원 배열 -> CSV 문자열
function buildCSV(rows) {
  return rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
}

// CSV 문자열 -> UTF-8 BOM 포함 Blob (엑셀에서 한글 깨짐 방지)
function csvToBlob(csvString) {
  const bom = '﻿';
  return new Blob([bom + csvString], { type: 'text/csv;charset=utf-8;' });
}
