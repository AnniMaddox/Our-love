/** Read a .txt / .md / .json / .docx File object and return its plain-text content. */
export async function readLetterContent(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return file.text();
  }

  if (name.endsWith('.json')) {
    // Return raw JSON string; chat-mode parser will interpret it
    return file.text();
  }

  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const buffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer: buffer });
    return value;
  }

  return '';
}
