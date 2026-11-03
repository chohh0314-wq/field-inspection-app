// 아주 작은 ZIP(무압축/store) 작성기 — 외부 라이브러리 없이 오프라인에서도 동작

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(v) {
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
}
function u32(v) {
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
}

function concatBytes(chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

// files: [{ name: string, data: Uint8Array }]
function createZipBlob(files) {
  const encoder = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = file.data;
    const crc = crc32(data);
    const size = data.length;

    const localHeader = concatBytes([
      u32(0x04034b50),
      u16(20),       // version needed
      u16(0x0800),   // flags: bit 11 = UTF-8 filename (EFS)
      u16(0),        // method: store
      u16(0),        // mod time
      u16(0),        // mod date
      u32(crc),
      u32(size),     // compressed size
      u32(size),     // uncompressed size
      u16(nameBytes.length),
      u16(0),        // extra field length
      nameBytes,
    ]);

    localChunks.push(localHeader, data);

    const centralHeader = concatBytes([
      u32(0x02014b50),
      u16(20),       // version made by
      u16(20),       // version needed
      u16(0x0800),   // flags: bit 11 = UTF-8 filename (EFS)
      u16(0),        // method
      u16(0),        // mod time
      u16(0),        // mod date
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),        // extra field length
      u16(0),        // comment length
      u16(0),        // disk number start
      u16(0),        // internal attrs
      u32(0),        // external attrs
      u32(offset),   // relative offset of local header
      nameBytes,
    ]);
    centralChunks.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralDirectory = concatBytes(centralChunks);
  const localSection = concatBytes(localChunks);

  const eocd = concatBytes([
    u32(0x06054b50),
    u16(0), // disk number
    u16(0), // disk with cd
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(localSection.length), // offset of start of central directory
    u16(0), // comment length
  ]);

  const full = concatBytes([localSection, centralDirectory, eocd]);
  return new Blob([full], { type: 'application/zip' });
}

// dataURL(base64) -> Uint8Array
function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
