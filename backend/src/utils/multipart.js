// Module 4: Medical Record Upload
//
// Minimal multipart/form-data parser, hand-written instead of adding a
// dependency (e.g. busboy/multer/formidable). Justification: uploads are
// already size-capped and the whole request is buffered anyway for this
// prototype, so a small, fully-unit-tested parser here keeps backend
// dependencies at zero. Every operation works on Buffers end-to-end
// (never converts the file portion to a string), so binary file content
// is never corrupted by encoding conversions.

function parseBoundary(contentTypeHeader) {
  // e.g. 'multipart/form-data; boundary=----WebKitFormBoundaryXXXX'
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentTypeHeader || '');
  if (!match) return null;
  return (match[1] || match[2] || '').trim();
}

function splitBuffer(buffer, delimiter) {
  const parts = [];
  let start = 0;
  let index;
  while ((index = buffer.indexOf(delimiter, start)) !== -1) {
    parts.push(buffer.subarray(start, index));
    start = index + delimiter.length;
  }
  parts.push(buffer.subarray(start));
  return parts;
}

function parseHeaders(headerBuffer) {
  const headers = {};
  headerBuffer
    .toString('utf8')
    .split('\r\n')
    .forEach((line) => {
      const idx = line.indexOf(':');
      if (idx === -1) return;
      headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
    });
  return headers;
}

function parseContentDisposition(value) {
  const result = {};
  if (!value) return result;
  const nameMatch = /name="([^"]*)"/.exec(value);
  const filenameMatch = /filename="([^"]*)"/.exec(value);
  if (nameMatch) result.name = nameMatch[1];
  if (filenameMatch) result.filename = filenameMatch[1];
  return result;
}

/**
 * Parses a fully-buffered multipart/form-data request body.
 * Returns { fields: { [name]: string }, file: { fieldName, filename, mimeType, buffer } | null }.
 * Throws if the boundary cannot be determined from the Content-Type header.
 */
function parseMultipart(bodyBuffer, contentTypeHeader) {
  const boundary = parseBoundary(contentTypeHeader);
  if (!boundary) {
    throw new Error('Missing or invalid multipart boundary in Content-Type header.');
  }

  const delimiter = Buffer.from(`--${boundary}`);
  const rawParts = splitBuffer(bodyBuffer, delimiter);

  const fields = {};
  let file = null;

  for (const rawPart of rawParts) {
    if (rawPart.length === 0) continue;

    let part = rawPart;
    // Strip the leftover CRLF right after the boundary line
    if (part.subarray(0, 2).toString('latin1') === '\r\n') {
      part = part.subarray(2);
    }
    // Final boundary is followed by "--" — nothing to parse
    if (part.subarray(0, 2).toString('latin1') === '--') continue;

    const headerEndIndex = part.indexOf('\r\n\r\n');
    if (headerEndIndex === -1) continue;

    const headers = parseHeaders(part.subarray(0, headerEndIndex));
    let content = part.subarray(headerEndIndex + 4);

    // Trim the trailing CRLF that precedes the next boundary
    if (
      content.length >= 2 &&
      content.subarray(content.length - 2).toString('latin1') === '\r\n'
    ) {
      content = content.subarray(0, content.length - 2);
    }

    const disposition = parseContentDisposition(headers['content-disposition']);
    if (!disposition.name) continue;

    if (disposition.filename !== undefined) {
      file = {
        fieldName: disposition.name,
        filename: disposition.filename,
        mimeType: headers['content-type'] || 'application/octet-stream',
        buffer: content,
      };
    } else {
      fields[disposition.name] = content.toString('utf8');
    }
  }

  return { fields, file };
}

module.exports = { parseMultipart };
